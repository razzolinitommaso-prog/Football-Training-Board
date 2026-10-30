import { trainingSlotOnDate } from "@workspace/api-zod";
import { automaticProgramNotes } from "./joint-training-program";
import { ensureTrainingSuppressions } from "./training-session-integrity";
import { sql } from "drizzle-orm";
import { db, type Team } from "@workspace/db";
import { resultRows } from "./training-availability";
export const AUTO_TRAINING_MARKER="[FTB_AUTO_TRAINING]";
const title="Allenamento da preparare";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function syncTrainingDrafts(tx:Tx,team:Team,userId:number) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`training-team|${team.clubId}|${team.id}`}))`);
  const seasons=resultRows<{startDate:string;endDate:string}>(await tx.execute(sql`SELECT start_date::text AS "startDate",end_date::text AS "endDate" FROM seasons WHERE club_id=${team.clubId} AND ${team.seasonId?sql`id=${team.seasonId}`:sql`is_active=true`} ORDER BY start_date DESC LIMIT 1`));
  const today=resultRows<{day:string}>(await tx.execute(sql`SELECT (NOW() AT TIME ZONE 'Europe/Rome')::date::text AS day`))[0].day;
  const start=[team.seasonTrainingStartDate??seasons[0]?.startDate,today].filter(Boolean).sort().at(-1)!;
  const end=team.officialTrainingEndDate??seasons[0]?.endDate;
  if(!end||!start||end<start||Date.parse(end)-Date.parse(start)>400*86400000)return {created:0,reason:"Periodo stagionale assente o non valido"};
  const weekday:Record<string,number>={domenica:0,lunedi:1,martedi:2,mercoledi:3,giovedi:4,venerdi:5,sabato:6};
  const desired=new Map<string,{at:string;duration:number;location:string|null}>();
  for(const slot of team.trainingSchedule??[]){
    const day=weekday[slot.day.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')];
    if(day===undefined||!/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.endTime))continue;
    const minutes=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3));const duration=minutes(slot.endTime)-minutes(slot.startTime);if(duration<=0)continue;
    const rows=resultRows<{at:Date|string}>(await tx.execute(sql`SELECT ((d::date+${slot.startTime}::time) AT TIME ZONE 'Europe/Rome') AS at FROM generate_series(${start}::date,${end}::date,'1 day'::interval) d WHERE EXTRACT(DOW FROM d)=${day}`));
    for(const row of rows){const at=new Date(row.at).toISOString();const date=new Date(row.at).toLocaleDateString("sv-SE",{timeZone:"Europe/Rome"});if(slot.jointTeamId||!trainingSlotOnDate(slot,date)||Date.parse(at)<Date.now())continue;desired.set(at,{at,duration:90,location:slot.campo??null});}
  }
  const changes=resultRows<{own:boolean;status:string;originalAt:Date|string;at:Date|string|null;duration:number|null;location:string|null}>(await tx.execute(sql`SELECT team_id=${team.id} AS own,status,
    ((original_date+original_start_time::time) AT TIME ZONE 'Europe/Rome') AS "originalAt",
    CASE WHEN team_id=${team.id} THEN ((new_date+new_start_time::time) AT TIME ZONE 'Europe/Rome') ELSE ((target_date+target_start_time::time) AT TIME ZONE 'Europe/Rome') END AS at,
    CASE WHEN team_id=${team.id} THEN EXTRACT(EPOCH FROM (new_end_time::time-new_start_time::time))/60 ELSE EXTRACT(EPOCH FROM (target_end_time::time-target_start_time::time))/60 END AS duration,location
    FROM training_calendar_overrides WHERE club_id=${team.clubId} AND (team_id=${team.id} OR (status='joined' AND target_team_id=${team.id}))`));
  for(const change of changes){
    const original=new Date(change.originalAt).toISOString(),source=desired.get(original);
    if(change.own&&["cancelled","moved","joined"].includes(change.status))desired.delete(original);
    if(change.status==='note'&&source&&change.location)source.location=change.location;
    if(["moved","joined"].includes(change.status)&&change.at){const at=new Date(change.at).toISOString();const localDate=new Date(change.at).toLocaleDateString('sv-SE',{timeZone:'Europe/Rome'});if(localDate>=start&&localDate<=end)desired.set(at,{at,duration:90,location:change.location??source?.location??null});}
  }
  const existing=resultRows<{id:number;at:Date|string;title:string;notes:string|null;status:string;untouched:boolean;protected:boolean;duration:number|null;teamId:number}>(await tx.execute(sql`SELECT s.id,s.team_id AS "teamId",s.duration_minutes AS duration,s.scheduled_at AS at,s.title,s.notes,s.status,(s.updated_at=s.created_at AND s.objectives IS NULL AND s.description IS NULL) AS untouched,
    (EXISTS(SELECT 1 FROM training_session_exercises e WHERE e.training_session_id=s.id) OR EXISTS(SELECT 1 FROM training_attendances a WHERE a.training_session_id=s.id)) AS protected
    FROM training_sessions s WHERE s.club_id=${team.clubId} AND (s.team_id=${team.id} OR ${String(team.id)}=ANY(string_to_array(split_part(split_part(coalesce(s.notes,''),'[FTB_SESSION_TEAMS]',2),E'\\n',1),','))) AND s.session_kind='regular' AND s.notes IS DISTINCT FROM '[FTB_AUTO_TRAINING] GROUPED' AND s.scheduled_at>=NOW()`));
  for(const row of existing){
    if(row.teamId!==team.id) {
      if(!['cancelled','canceled'].includes(row.status))for(const [key,item] of desired){
        const source=Date.parse(String(row.at)),slot=Date.parse(key);
        if(slot<source+(row.duration??90)*60000&&slot+item.duration*60000>source)desired.delete(key);
      }
      continue;
    }
    const exactAt=new Date(row.at).toISOString();
    const at=[...desired.keys()].find(key=>key.slice(0,16)===exactAt.slice(0,16))??exactAt;
    if(row.title===title&&!row.protected&&automaticProgramNotes(row.notes)&&row.untouched&&!desired.has(at))await tx.execute(sql`UPDATE training_sessions SET status='cancelled',notes=${AUTO_TRAINING_MARKER+' REMOVED'},updated_at=NOW() WHERE id=${row.id} AND club_id=${team.clubId}`);
    if(row.title===title&&!row.protected&&[AUTO_TRAINING_MARKER+' REMOVED',AUTO_TRAINING_MARKER+' PROGRAM'].includes(row.notes??'')&&desired.has(at))await tx.execute(sql`UPDATE training_sessions SET status='scheduled',notes=${AUTO_TRAINING_MARKER},updated_at=created_at WHERE id=${row.id} AND club_id=${team.clubId}`);
    const planned=desired.get(at);
    if(planned&&row.title===title&&!row.protected&&automaticProgramNotes(row.notes)&&row.untouched)await tx.execute(sql`UPDATE training_sessions SET duration_minutes=${planned.duration},location=${planned.location} WHERE id=${row.id} AND club_id=${team.clubId}`);
    desired.delete(at);
  }
  await ensureTrainingSuppressions(tx);
  const suppressed=resultRows<{at:Date|string}>(await tx.execute(sql`SELECT scheduled_at AS at FROM training_session_suppressions WHERE club_id=${team.clubId} AND team_id=${team.id}`));
  const blocked=new Set(suppressed.map(row=>new Date(row.at).toISOString().slice(0,16)));
  const values=[...desired.values()].filter(item=>!blocked.has(item.at.slice(0,16))).map(item=>sql`(${team.clubId},${team.id},${title},${item.at}::timestamptz,${item.duration},${item.location},'scheduled','regular',${AUTO_TRAINING_MARKER},${team.coachId??userId},NOW(),NOW())`);
  if(values.length)await tx.execute(sql`INSERT INTO training_sessions(club_id,team_id,title,scheduled_at,duration_minutes,location,status,session_kind,notes,created_by_user_id,created_at,updated_at) VALUES ${sql.join(values,sql`,`)}`);
  return {created:values.length,reason:null};
}
