import type { SharedTournamentPhase } from "@workspace/api-zod";
import type { MatchPdfImportResult } from "./match-calendar-pdf";

export type SharedProgramImportEntry = {
  id:string; date:string; homeTeam:string; awayTeam:string; phase:string; group:string;
  ownSide:"none"|"home"|"away"; matchId?:number; tournamentPhaseId?:string; finalsPolicy?:"program-only";
};
const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
const identity=(entry:{date:string;homeTeam:string;awayTeam:string})=>[new Date(entry.date).toISOString(),normalize(entry.homeTeam),normalize(entry.awayTeam)].join("|");

/** Map outcomes already recognized by the existing parser; no new society/alias matching. */
export function mergeSharedTournamentImport(parsed:MatchPdfImportResult, existing:SharedProgramImportEntry[], phases:SharedTournamentPhase[], clubName:string) {
  const source=parsed.tournamentProgram?.length?parsed.tournamentProgram:parsed.recognized.map(row=>({
    date:row.date,homeTeam:row.homeAway==="home"?clubName:row.opponent,awayTeam:row.homeAway==="home"?row.opponent:clubName,phase:"Gironi",group:"",
  }));
  if(!source.length)throw Error("Nessuna gara riconosciuta nel documento.");
  const result=[...existing],byKey=new Map(result.map((entry,index)=>[identity(entry),index]));
  let added=0,matched=0;
  for(const entry of source){
    if(("kind" in entry && entry.kind==="composition")||!entry.date||!entry.homeTeam||!entry.awayTeam)continue;
    if(!Number.isFinite(new Date(entry.date).getTime()))throw Error("Una gara non ha una data valida. Verifica il documento prima di importare.");
    const key=identity(entry),index=byKey.get(key),previous=index===undefined?undefined:result[index];
    const recognized=parsed.recognized.find(row=>row.date===entry.date&&(
      row.homeAway==="home"?normalize(row.opponent)===normalize(entry.awayTeam):normalize(row.opponent)===normalize(entry.homeTeam)) &&
      source.filter(candidate=>candidate.date===row.date && (row.homeAway==="home"?normalize(candidate.awayTeam)===normalize(row.opponent):normalize(candidate.homeTeam)===normalize(row.opponent))).length===1);
    const day=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Rome"}).format(new Date(entry.date));
    const compatible=phases.filter(phase=>day>=phase.startDate&&day<=phase.endDate);
    const next:SharedProgramImportEntry={
      ...previous,id:previous?.id??crypto.randomUUID(),date:entry.date,homeTeam:entry.homeTeam,awayTeam:entry.awayTeam,
      phase:entry.phase??"Gironi",group:entry.group??"",ownSide:previous?.ownSide??("kind" in entry && entry.kind==="fixture_placeholder"?"none":recognized?.homeAway??"none"),
      tournamentPhaseId:previous?.tournamentPhaseId??(compatible.length===1?compatible[0].id:undefined),
      ...("finalsPolicy" in entry&&entry.finalsPolicy==="program-only"?{finalsPolicy:"program-only" as const}:{}),
    };
    if(index===undefined){byKey.set(key,result.length);result.push(next);added++;}else{result[index]=next;matched++;}
  }
  if(!added&&!matched)throw Error("Il documento non contiene gare con data e squadre riconoscibili.");
  if(result.length>250)throw Error("Il programma supera 250 gare. Importa un documento dedicato a questa annata.");
  return {program:result,added,matched};
}
