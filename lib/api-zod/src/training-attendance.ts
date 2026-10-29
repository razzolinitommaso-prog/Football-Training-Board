import { TRAINING_ROTATION_PHASES, type TrainingRotations } from "./training-rotations";

export type SessionAttendanceRow={id:number;playerId:number;status:string;notes?:string|null};
export function sessionAttendanceState(rows:SessionAttendanceRow[]) {
 const records=new Map<number,string>();
 for(const row of [...rows].sort((a,b)=>a.id-b.id)){
  if((row.notes??"").startsWith("Genitore:")&&["requested","absent"].includes(row.status))continue;
  if(!records.has(row.playerId))records.set(row.playerId,row.status);
 }
 return {blockedPlayerIds:[...records].filter(([,s])=>s==="absent"||s==="injured").map(([id])=>id),presentPlayerIds:[...records].filter(([,s])=>s==="present").map(([id])=>id),recordedPlayerIds:[...records].filter(([,s])=>["present","absent","injured"].includes(s)).map(([id])=>id)};
}
export function excludeTrainingPlayers(rotations:TrainingRotations,excluded:number[]):TrainingRotations {
 const blocked=new Set(excluded);
 return Object.fromEntries(TRAINING_ROTATION_PHASES.filter(phase=>rotations[phase]).map(phase=>[phase,rotations[phase]!.map(turn=>({...turn,stations:turn.stations.map(station=>({...station,playerIds:station.playerIds.filter(id=>!blocked.has(id))}))}))]));
}
/** Remove attributed markers in the board and its animation frames; keep generic objects. */
export function excludeTrainingBoardPlayers(raw:string|null|undefined,excluded:number[]):string|null|undefined {
 if(!raw||!excluded.length)return raw;
 try{
  const source=JSON.parse(raw),blocked=new Set(excluded);let changed=false;
  const visit=(value:unknown,key=""):unknown=>{
   if(Array.isArray(value))return value.filter(item=>{const remove=(item&&typeof item==="object"&&blocked.has(Number(item.playerId)))||(["playerIds","rosterPlayerIds","selectedPlayerIds"].includes(key)&&blocked.has(Number(item)));if(remove)changed=true;return !remove;}).map(item=>visit(item));
   if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v,k)]));
   return value;
  };
  const next=visit(source);return changed?JSON.stringify(next):raw;
 }catch{return raw;}
}
export function attendanceExerciseView<T extends {selectedPlayerIdsJson?:string|null;playersRequired?:number|null;statoLavagnaJson?:string|null;drawingElementsJson?:string|null;drawingData?:string|null;immagineAnteprima?:string|null}>(exercise:T,excluded:number[]):T&{attendanceAdjusted?:boolean} {
 if(!excluded.length)return exercise;
 const blocked=new Set(excluded);let ids:number[]|undefined;
 try{const value=JSON.parse(exercise.selectedPlayerIdsJson??"null");if(Array.isArray(value))ids=value.map(Number).filter(Number.isInteger);}catch{/* preserve old manual counts */}
 const nextIds=ids?.filter(id=>!blocked.has(id));
 const state=excludeTrainingBoardPlayers(exercise.statoLavagnaJson,excluded),elements=excludeTrainingBoardPlayers(exercise.drawingElementsJson,excluded);
 const adjusted=Boolean(ids&&nextIds?.length!==ids.length)||state!==exercise.statoLavagnaJson||elements!==exercise.drawingElementsJson;
 return {...exercise,...(ids?{selectedPlayerIdsJson:JSON.stringify(nextIds),playersRequired:nextIds!.length}:{}),statoLavagnaJson:state,drawingElementsJson:elements,...(adjusted?{drawingData:null,immagineAnteprima:null,attendanceAdjusted:true}:{})};
}
