import { and, eq, sql } from "drizzle-orm";
import { db, teamsTable, type Team } from "@workspace/db";
import { sessionTeamIds, withSessionTeams, trainingLocalDate, trainingSlotOnDate, trainingSlotPeriodsOverlap, type ProgramTrainingSlot } from "@workspace/api-zod";
import { resultRows } from "./training-availability";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export class TrainingProgramError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export const PROGRAM_MARKER = "[FTB_PROGRAM_TEAMS]";
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const previousDay = (date: string) => new Date(Date.parse(date + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);
export function slotsBefore(slots: ProgramTrainingSlot[], date: string): ProgramTrainingSlot[] {
  return slots.filter(slot => !slot.validFrom || slot.validFrom < date).map(slot => ({...slot, validUntil: slot.validUntil && slot.validUntil < date ? slot.validUntil : previousDay(date)}));
}
export function programParticipants(teams: Pick<Team, "id" | "trainingSchedule">[], leader: number, date: string, _start: string): number[] {
  return [leader, ...teams.filter(team => team.id !== leader && team.trainingSchedule?.some(slot => slot.jointTeamId === leader && trainingSlotOnDate(slot, date))).map(team => team.id)];
}
export function automaticProgramNotes(notes: string | null): boolean {
  return (notes ?? "").split("\n").filter(line => !line.startsWith("[FTB_SESSION_TEAMS]") && !line.startsWith(PROGRAM_MARKER)).join("\n").trim() === "[FTB_AUTO_TRAINING]";
}
export async function lockTrainingPrograms(tx: Tx, clubId: number) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`training-program|${clubId}`}))`);
  const teams = await tx.select().from(teamsTable).where(eq(teamsTable.clubId, clubId));
  for (const team of [...teams].sort((a,b)=>a.id-b.id)) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`training-team|${clubId}|${team.id}`}))`);
  return teams;
}
export function validateProgramSchedule(teams: Team[], team: Team, slots: ProgramTrainingSlot[], from: string) {
  const future = slots.filter(slot => !slot.validUntil || slot.validUntil >= from);
  for (const slot of future) {
    if (!["domenica","lunedi","martedi","mercoledi","giovedi","venerdi","sabato"].includes(norm(slot.day)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.endTime) || slot.endTime <= slot.startTime || !slot.campo?.trim() || !slot.lockerRoom?.trim()) throw new TrainingProgramError("Indica giorno, orari, campo e spogliatoio per ogni seduta del programma.", 400);
    for (const other of teams) for (const candidate of other.id === team.id ? future : other.trainingSchedule ?? []) {
      if (other.id!==team.id&&other.seasonId&&team.seasonId&&other.seasonId!==team.seasonId)continue;
      if (other.officialTrainingEndDate&&other.officialTrainingEndDate<(slot.validFrom??from)||candidate.validFrom&&team.officialTrainingEndDate&&candidate.validFrom>team.officialTrainingEndDate)continue;
      if (candidate === slot || (candidate.validUntil && candidate.validUntil < from) || !trainingSlotPeriodsOverlap(slot,candidate) || norm(slot.day)!==norm(candidate.day) || slot.startTime>=candidate.endTime || candidate.startTime>=slot.endTime) continue;
      const root = slot.jointTeamId ?? team.id, otherRoot = candidate.jointTeamId ?? other.id;
      if (other.id !== team.id && root === otherRoot) continue;
      const field = norm(slot.campo ?? ""), otherField = norm(candidate.campo ?? "");
      const number = field.match(/campo\s*(\d+)/)?.[1], otherNumber = otherField.match(/campo\s*(\d+)/)?.[1];
      const fieldConflict = !!field && !!otherField && (field===otherField || !!number && number===otherNumber && (field.startsWith("campo") || otherField.startsWith("campo")));
      if (fieldConflict || slot.lockerRoom && norm(slot.lockerRoom) === norm(candidate.lockerRoom ?? "")) throw new TrainingProgramError(`${slot.day} ${slot.startTime}–${slot.endTime}: campo o spogliatoio occupato da ${other.name}.`);
    }
  }
}
/** A dated snapshot keeps history stable. Followers can only refer to an independent team. */
export async function setTrainingProgram(tx: Tx, teams: Team[], team: Team, leaderId: number | null, from: string, rows: ProgramTrainingSlot[]) {
  const today = trainingLocalDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !Number.isFinite(Date.parse(from+"T12:00:00Z")) || new Date(from+"T12:00:00Z").toISOString().slice(0,10)!==from || from < today || Date.parse(from)-Date.parse(today)>400*86400000) throw new TrainingProgramError("Scegli una data valida da oggi entro la stagione.",400);
  if (team.officialTrainingEndDate && from > team.officialTrainingEndDate) throw new TrainingProgramError("La data supera la fine degli allenamenti della squadra.",400);
  const leader = leaderId ? teams.find(item => item.id === leaderId) : null;
  if (leaderId && (!leader || leaderId===team.id || leader.clubSection!==team.clubSection || leader.seasonId!==team.seasonId)) throw new TrainingProgramError("La squadra di riferimento deve essere diversa, della stessa società, settore e stagione.",400);
  if (leader && (leader.trainingSchedule ?? []).some(slot => slot.jointTeamId && (!slot.validUntil || slot.validUntil>=from))) throw new TrainingProgramError("La squadra di riferimento ha già un programma congiunto. Non sono consentiti collegamenti a catena.",400);
  if (leader && teams.some(other => other.trainingSchedule?.some(slot => slot.jointTeamId===team.id && (!slot.validUntil || slot.validUntil>=from)))) throw new TrainingProgramError("Questa squadra è già riferimento di un gruppo: separa prima le squadre collegate.",400);
  const boundary=(team.trainingSchedule??[]).map(slot=>slot.validFrom).filter((date):date is string=>!!date&&date>from).sort()[0];
  const until=boundary?previousDay(boundary):null;
  const preserved=(team.trainingSchedule??[]).filter(slot=>boundary&&slot.validFrom&&slot.validFrom>=boundary);
  const source = leader ? leader.trainingSchedule ?? [] : rows;
  const next = source.filter(slot => (!slot.validUntil || slot.validUntil >= from)&&(!until||!slot.validFrom||slot.validFrom<=until)).map(slot => ({ day:slot.day,startTime:slot.startTime,endTime:slot.endTime,campo:slot.campo?.trim()||null,lockerRoom:slot.lockerRoom?.trim()||null,validFrom:[from,slot.validFrom,leader?.seasonTrainingStartDate,team.seasonTrainingStartDate].filter((date):date is string=>!!date).sort().at(-1)!,validUntil:[until,slot.validUntil,leader?.officialTrainingEndDate,team.officialTrainingEndDate].filter((date):date is string=>!!date).sort()[0]??null,jointTeamId:leaderId }));
  if (next.some(slot=>slot.validUntil&&slot.validUntil<slot.validFrom))throw new TrainingProgramError("Le date stagionali delle squadre non si sovrappongono.",400);
  if (!next.length) throw new TrainingProgramError("Imposta il programma completo della squadra di riferimento, oppure i giorni della squadra autonoma.",400);
  const updated = {...team, trainingSchedule:[...slotsBefore(team.trainingSchedule ?? [],from),...next,...preserved]};
  const all = teams.map(item => item.id===team.id?updated:item);
  validateProgramSchedule(all,updated,next,from);
  await tx.update(teamsTable).set({trainingSchedule:updated.trainingSchedule}).where(and(eq(teamsTable.id,team.id),eq(teamsTable.clubId,team.clubId)));
  // Changes made to the reference programme propagate only to its future followers.
  for (const follower of all.filter(item => item.id!==team.id)) {
    const linked = (follower.trainingSchedule??[]).filter(slot=>slot.jointTeamId===team.id&&(!slot.validUntil||slot.validUntil>=from));
    if (!linked.length) continue;
    const ranges = [...new Map(linked.map(slot=>[`${slot.validFrom??from}|${slot.validUntil??""}`,{from:slot.validFrom&&slot.validFrom>from?slot.validFrom:from,until:slot.validUntil??null}])).values()];
    const retained = (follower.trainingSchedule??[]).flatMap(slot=>slot.jointTeamId===team.id&&(!slot.validUntil||slot.validUntil>=from)?slotsBefore([slot],from):[slot]);
    const inherited = ranges.flatMap(range=>updated.trainingSchedule.filter(slot=>trainingSlotPeriodsOverlap(slot,{...slot,validFrom:range.from,validUntil:range.until})).map(slot=>({...slot,validFrom:[slot.validFrom,range.from].sort().at(-1)!,validUntil:[slot.validUntil,range.until].filter((date):date is string=>!!date).sort()[0]??null,jointTeamId:team.id})));
    follower.trainingSchedule=[...retained,...inherited];
    await tx.update(teamsTable).set({trainingSchedule:follower.trainingSchedule}).where(and(eq(teamsTable.id,follower.id),eq(teamsTable.clubId,team.clubId)));
  }
  return all;
}
export async function reconcileProgramSessions(tx: Tx, teams: Team[], clubId: number) {
  const sessions=resultRows<{id:number;teamId:number;at:Date|string;notes:string|null;empty:boolean}>(await tx.execute(sql`SELECT s.id,s.team_id AS "teamId",s.scheduled_at AS at,s.notes,
    (s.title='Allenamento da preparare' AND s.updated_at=s.created_at AND s.objectives IS NULL AND s.description IS NULL AND NOT EXISTS(SELECT 1 FROM training_session_exercises e WHERE e.training_session_id=s.id) AND NOT EXISTS(SELECT 1 FROM training_attendances a WHERE a.training_session_id=s.id) AND NOT EXISTS(SELECT 1 FROM training_session_plans p WHERE p.session_id=s.id)) AS empty
    FROM training_sessions s WHERE s.club_id=${clubId} AND s.scheduled_at>=NOW() AND s.session_kind='regular' AND s.status NOT IN ('cancelled','canceled') ORDER BY s.id FOR UPDATE`));
  for (const session of sessions) {
    const at=new Date(session.at),date=trainingLocalDate(at),start=at.toLocaleTimeString('it-IT',{timeZone:'Europe/Rome',hour:'2-digit',minute:'2-digit'});
    const team=teams.find(team=>team.id===session.teamId);if(!team)continue;
    const leader=team.trainingSchedule?.find(slot=>slot.jointTeamId&&trainingSlotOnDate(slot,date))?.jointTeamId;
    if (leader) {
      if (!session.empty || !automaticProgramNotes(session.notes)) throw new TrainingProgramError(`La seduta ${session.id} del ${date} di ${team.name} è già modificata o compilata. Gestiscila prima di unire i programmi: nessun dato è stato cambiato.`);
      await tx.execute(sql`UPDATE training_sessions SET status='cancelled',notes='[FTB_AUTO_TRAINING] PROGRAM',updated_at=NOW() WHERE id=${session.id} AND club_id=${clubId}`);
      continue;
    }
    const expected=programParticipants(teams,team.id,date,start);
    const previous=(session.notes?.split('\n').find(line=>line.startsWith(PROGRAM_MARKER))?.slice(PROGRAM_MARKER.length).split(',').map(Number)??[]).filter(id=>Number.isInteger(id)&&id>0);
    if(previous.some(id=>id!==team.id&&!expected.includes(id))&&!session.empty) throw new TrainingProgramError(`La seduta congiunta ${session.id} del ${date} è già compilata. Gestisci esplicitamente la preparazione futura prima della separazione: nessun dato è stato cambiato.`);
    if(expected.length===1&&!previous.length)continue;
    const ids=[...new Set([...sessionTeamIds(team.id,session.notes).filter(id=>!previous.includes(id)),...expected])];
    const base=(session.notes??'').split('\n').filter(line=>!line.startsWith(PROGRAM_MARKER)).join('\n');
    const notes=withSessionTeams(base,ids)+(expected.length>1?'\n'+PROGRAM_MARKER+expected.join(','):'');
    if(notes!==session.notes)await tx.execute(sql`UPDATE training_sessions SET notes=${notes} WHERE id=${session.id} AND club_id=${clubId}`);
  }
}
