import { parentTrainingOccurrence } from "./parent-activity";
import { sessionTeamIds } from "./training-session-teams";
type Slot={day:string;startTime:string;endTime:string};
export type SharedTrainingSession={teamId:number|null;notes:string|null;scheduledAt:Date|string;durationMinutes:number|null;location?:string|null};
const minutes=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3,5));
export function trainingLocalSlot(at:Date|string){const key=parentTrainingOccurrence(1,new Date(at));return {date:key.slice(2,12),start:key.slice(-5)};}
export function trainingReplyMatches(occurrenceId:string,session:SharedTrainingSession,schedule:Slot[]):boolean {
 const match=/^\d+-(\d{4}-\d{2}-\d{2})-(\d{2}:\d{2})$/.exec(occurrenceId);if(!match)return false;
 const {date,start}=trainingLocalSlot(session.scheduledAt);if(match[1]!==date)return false;if(match[2]===start)return true;
 const days=['domenica','lunedi','martedi','mercoledi','giovedi','venerdi','sabato'];const day=days[new Date(`${date}T12:00:00Z`).getUTCDay()];
 return schedule.some(slot=>slot.day.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()===day&&slot.startTime===match[2]&&minutes(slot.startTime)<minutes(start)+(session.durationMinutes??90)&&minutes(slot.endTime)>minutes(start));
}
/** Preserve the parent's original occurrence ID, so an existing reply is retained. */
export function overlaySharedTrainingRows(rows:Record<string,unknown>[],sessions:SharedTrainingSession[],teamId:number,teamName:string):Record<string,unknown>[] {
 let result=[...rows];
 for(const session of sessions){
  if(sessionTeamIds(session.teamId,session.notes).length<2||!sessionTeamIds(session.teamId,session.notes).includes(teamId))continue;
  const {date,start}=trainingLocalSlot(session.scheduledAt);const end=trainingLocalSlot(new Date(new Date(session.scheduledAt).getTime()+(session.durationMinutes??90)*60000)).start;
  const matches=result.filter(row=>String(row.date)===date&&(String(row.startTime)===start||(minutes(String(row.startTime))<minutes(start)+(session.durationMinutes??90)&&minutes(String(row.endTime??row.startTime))>minutes(start))));
  const original=matches[0];const ids=new Set(matches.map(row=>row.id));result=result.filter(row=>!ids.has(row.id));
  result.push({...original,id:original?.id??`${teamId}-${date}-${start}`,source:"shared_training_session",title:"Allenamento annate unite",teamId,teamName,date,startTime:start,endTime:end,scheduledAt:new Date(session.scheduledAt).toISOString(),campo:session.location??original?.campo??null});
 }
 return result.sort((a,b)=>String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
}
