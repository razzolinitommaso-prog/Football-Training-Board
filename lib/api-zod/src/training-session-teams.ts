export const SESSION_TEAMS_MARKER="[FTB_SESSION_TEAMS]";
export function sessionTeamIds(teamId:number|null|undefined,notes?:string|null):number[] {
 const line=notes?.split("\n").find(line=>line.startsWith(SESSION_TEAMS_MARKER));
 const ids=line?.slice(SESSION_TEAMS_MARKER.length).split(",").map(Number).filter(id=>Number.isInteger(id)&&id>0)??[];
 return [...new Set([...(teamId?[teamId]:[]),...ids])];
}
export function withSessionTeams(notes:string|null|undefined,ids:number[]):string {
 const base=(notes??"").split("\n").filter(line=>!line.startsWith(SESSION_TEAMS_MARKER)).join("\n").trim();
 const unique=[...new Set(ids)].sort((a,b)=>a-b);
 return unique.length>1?`${base}\n${SESSION_TEAMS_MARKER}${unique.join(",")}`:base;
}
