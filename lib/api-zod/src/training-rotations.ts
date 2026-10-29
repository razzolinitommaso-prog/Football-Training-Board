export const TRAINING_ROTATION_PHASES=["iniziale","centrale","finale"] as const;
export type RotationPhase=typeof TRAINING_ROTATION_PHASES[number];
export type RotationStation={linkId:number;playerIds:number[];seconds:number};
export type RotationTurn={id:string;stations:RotationStation[]};
export type TrainingRotations=Partial<Record<RotationPhase,RotationTurn[]>>;
export type RotationActivity={id:number;phase:string|null;seconds:number;playerIds:number[]};
export function rotationSeconds(rotations:TrainingRotations):number {
 return TRAINING_ROTATION_PHASES.reduce((sum,phase)=>sum+(rotations[phase]??[]).reduce((s,turn)=>s+Math.max(0,...turn.stations.map(station=>station.seconds)),0),0);
}
export function initialTrainingRotations(activities:RotationActivity[]):TrainingRotations {
 const result:TrainingRotations={};
 for(const phase of TRAINING_ROTATION_PHASES){
  const items=activities.filter(item=>item.phase===phase);if(!items.length)continue;
  const used=new Set<number>();const groups=items.map(item=>item.playerIds.filter(id=>{if(used.has(id))return false;used.add(id);return true;}));
  result[phase]=items.map((_,turn)=>({id:`${phase}-${turn+1}`,stations:items.map((item,index)=>({linkId:item.id,seconds:Math.max(1,Math.round(item.seconds||900)),playerIds:[...groups[(index-turn+items.length)%items.length]]}))}));
 }
 return result;
}
/** Validate both time and exclusive player assignment within each simultaneous turn. */
export function validateTrainingRotations(value:unknown,activities:{id:number;phase:string|null}[],allowedPlayerIds:number[]):string|null {
 if(!value||typeof value!=="object"||Array.isArray(value))return "Organizzazione non valida";
 const rotations=value as TrainingRotations,allowed=new Set(allowedPlayerIds),seenLinks=new Set<number>();
 if(Object.keys(rotations).some(key=>!TRAINING_ROTATION_PHASES.includes(key as RotationPhase)))return "Fase non valida";
 for(const phase of TRAINING_ROTATION_PHASES){
  const turns=rotations[phase]??[];if(!Array.isArray(turns)||turns.length>100)return "Troppi turni";
  const turnIds=new Set<string>();
  for(const turn of turns){
   if(!turn||typeof turn.id!=="string"||!turn.id||turn.id.length>100||turnIds.has(turn.id)||!Array.isArray(turn.stations)||turn.stations.length>100)return "Turno non valido";
   turnIds.add(turn.id);const used=new Set<number>(),stationIds=new Set<number>();
   for(const station of turn.stations){
    if(!station||!Number.isInteger(station.linkId)||stationIds.has(station.linkId)||!activities.some(item=>item.id===station.linkId&&item.phase===phase))return "Stazione non appartenente alla fase della seduta";
    stationIds.add(station.linkId);seenLinks.add(station.linkId);
    if(!Number.isInteger(station.seconds)||station.seconds<=0||station.seconds>18000)return "Durata del turno non valida";
    if(!Array.isArray(station.playerIds)||station.playerIds.length>500)return "Gruppo non valido";
    for(const id of station.playerIds){if(!Number.isInteger(id)||!allowed.has(id))return "Giocatore non appartenente alla rosa della seduta";if(used.has(id))return "Un giocatore non può occupare due stazioni nello stesso turno";used.add(id);}
   }
  }
 }
 if(activities.some(item=>!seenLinks.has(item.id)))return "Assegna tutte le stazioni a una fase e a un turno";
 return null;
}
