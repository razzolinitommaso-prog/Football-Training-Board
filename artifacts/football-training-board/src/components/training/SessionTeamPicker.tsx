import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { withApi } from "@/lib/api-base";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
type Team={id:number;name:string};
type Group={id:number;name:string;teamIds:number[]};
export function SessionTeamPicker({teams,teamId,sharedIds,onChange}:{teams:Team[];teamId:number|null;sharedIds:number[];onChange:(teamId:number|null,ids:number[])=>void}) {
 const {club,user}=useAuth();
 const query=useQuery<{sharedGroups:Group[]}>({queryKey:["training-rosters","config",club?.id,user?.id],queryFn:async()=>{const response=await fetch(withApi("/api/training-rosters/config"),{credentials:"include"});if(!response.ok)throw Error("Annate unite non disponibili");return response.json();}});
 const groups=query.data?.sharedGroups.filter(g=>g.teamIds.every(id=>teams.some(t=>t.id===id)))??[];
 const group=sharedIds.length>1?groups.find(g=>g.teamIds.length===sharedIds.length&&g.teamIds.every(id=>sharedIds.includes(id))):undefined;
 const value=group?`group:${group.id}`:sharedIds.length>1?"saved":String(teamId??"");
 return <div className="space-y-1"><ScrollableSelect className="w-full" aria-label="Squadra o annate unite" value={value} onValueChange={value=>{if(!value||value==="saved")return;const g=groups.find(g=>`group:${g.id}`===value);if(g)onChange(teamId&&g.teamIds.includes(teamId)?teamId:g.teamIds[0],g.teamIds);else onChange(value?Number(value):null,value?[Number(value)]:[]);}}>
 <option value="">Seleziona squadra</option>{sharedIds.length>1&&!group&&<option value="saved">Annate unite salvate</option>}
 <optgroup label="Squadre">{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>
 <optgroup label="Unisci annate">{groups.map(g=><option key={g.id} value={`group:${g.id}`}>{g.name} · {g.teamIds.map(id=>teams.find(t=>t.id===id)?.name).join(" + ")}</option>)}</optgroup>
 </ScrollableSelect>{query.error&&<p role="alert" className="text-xs text-destructive">{query.error.message}</p>}<p className="text-xs text-muted-foreground">Le unioni disponibili sono quelle configurate nella gestione squadre. Una sola seduta per le annate selezionate.</p></div>;
}
