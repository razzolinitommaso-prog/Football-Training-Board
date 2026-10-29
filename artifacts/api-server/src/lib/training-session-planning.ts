import { type TrainingRotations, TRAINING_ROTATION_PHASES } from "@workspace/api-zod";
import { createHash } from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export type SessionPlan = { rotations?:TrainingRotations; recoveries: [number, number]; timings: Record<string, { seconds: number; stations: number[]; signature: string }> };
export const EMPTY_PLAN: SessionPlan = { recoveries: [0, 0], timings: {} };
let ready: Promise<unknown> | undefined;
export function ensureSessionPlans() {
  return ready ??= db.execute(sql`CREATE TABLE IF NOT EXISTS training_session_plans (
    session_id integer PRIMARY KEY REFERENCES training_sessions(id) ON DELETE CASCADE,
    club_id integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    plan jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
  )`).catch(error => { ready = undefined; throw error; });
}
export const resultRows = <T>(result: unknown): T[] => (Array.isArray(result) ? result : (result as {rows?:T[]}).rows ?? []) as T[];
export async function readSessionPlan(sessionId: number, clubId: number): Promise<SessionPlan> {
  await ensureSessionPlans();
  const [row] = resultRows<{plan:SessionPlan}>(await db.execute(sql`SELECT plan FROM training_session_plans WHERE session_id=${sessionId} AND club_id=${clubId}`));
  return row?.plan ?? {recoveries:[0,0],timings:{}};
}
export type PlanningExercise = { id: number; duration: number | null; description: string | null; title: string | null; phase?:string|null };
export const timingSignature = (exercise: PlanningExercise) => createHash("sha256").update(JSON.stringify([exercise.duration,exercise.description])).digest("hex");
const MARKER = "\n\n[FTB_EXERCISE_STATIONS]";
export function stationMinutes(description: string | null): number[] {
  const index = (description ?? "").indexOf(MARKER);
  if (index < 0) return [];
  try {
    const stations = JSON.parse(description!.slice(index + MARKER.length));
    return Array.isArray(stations) ? stations.map(item => { const value=Number(item.durationMinutes); return Number.isFinite(value)?Math.max(0,value):0; }) : [];
  } catch { return []; }
}
// Integer seconds preserve the exact available total, including fractional-minute averages.
export function distributeSeconds(total: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const sum=weights.reduce((a,b)=>a+b,0);
  const raw=weights.map(weight=>total*(sum>0?weight/sum:1/weights.length));
  const parts=raw.map(Math.floor);
  let remainder=total-parts.reduce((a,b)=>a+b,0);
  const order=raw.map((value,index)=>({index,fraction:value-parts[index]})).sort((a,b)=>b.fraction-a.fraction||a.index-b.index);
  for(let i=0;i<remainder;i++) parts[order[i%order.length].index]++;
  return parts;
}
export function recalculatePlan(duration: number, recoveries: [number,number], exercises: PlanningExercise[]): SessionPlan {
  const available=Math.round((duration-recoveries[0]-recoveries[1])*60);
  if(!Number.isFinite(available)||available<=0||!exercises.length||exercises.some(ex=>!ex.title?.trim())) throw new Error("Durata utile o esercitazioni non valide");
  const allocations=distributeSeconds(available,exercises.map(()=>1));
  if(allocations.some(seconds=>seconds<=0)) throw new Error("Tempo insufficiente per le esercitazioni");
  return {recoveries,timings:Object.fromEntries(exercises.map((exercise,index)=>[String(exercise.id),{seconds:allocations[index],stations:distributeSeconds(allocations[index],stationMinutes(exercise.description)),signature:timingSignature(exercise)}]))};
}

export function recalculateRotationPlan(duration:number,recoveries:[number,number],exercises:PlanningExercise[],rotations:TrainingRotations):SessionPlan {
 const turns=TRAINING_ROTATION_PHASES.flatMap(phase=>rotations[phase]??[]);
 const available=Math.round((duration-recoveries[0]-recoveries[1])*60);
 if(available<=0||!turns.length||exercises.some(ex=>!ex.title?.trim()))throw Error("Tempo utile o stazioni non validi");
 const allocations=distributeSeconds(available,turns.map(()=>1));if(allocations.some(s=>s<=0))throw Error("Tempo insufficiente per i turni");
 let index=0;const next:TrainingRotations={},timings:SessionPlan["timings"]={};
 for(const phase of TRAINING_ROTATION_PHASES)if(rotations[phase])next[phase]=rotations[phase]!.map(turn=>{
  const seconds=allocations[index++];
  return {...turn,stations:turn.stations.map(station=>{const exercise=exercises.find(ex=>ex.id===station.linkId)!;
   timings[String(exercise.id)]??={seconds,stations:distributeSeconds(seconds,stationMinutes(exercise.description)),signature:timingSignature(exercise)};
   return {...station,seconds};
  })};
 });
 return {recoveries,timings,rotations:next};
}

export function planningVersion(plan:SessionPlan):string { return createHash("sha256").update(JSON.stringify(plan)).digest("hex"); }
export function rotationTimings(exercises:PlanningExercise[],rotations:TrainingRotations):SessionPlan["timings"] {
 const timings:SessionPlan["timings"]={};
 for(const phase of TRAINING_ROTATION_PHASES)for(const turn of rotations[phase]??[])for(const station of turn.stations){
  const exercise=exercises.find(ex=>ex.id===station.linkId);if(exercise&&!timings[String(exercise.id)])timings[String(exercise.id)]={seconds:station.seconds,stations:distributeSeconds(station.seconds,stationMinutes(exercise.description)),signature:timingSignature(exercise)};
 }
 return timings;
}
