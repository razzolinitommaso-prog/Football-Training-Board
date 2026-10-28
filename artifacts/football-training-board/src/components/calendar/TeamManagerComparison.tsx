import { ScrollableSelect } from "@/components/ui/scrollable-select";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { withApi } from "@/lib/api-base";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { managerComparisonRows, type ManagerComparison, type ComparisonState } from "@/lib/team-manager-comparison";
import type { ManagerTrainingCalendar } from "@/lib/team-manager-training-calendar";
const labels:Record<ComparisonState,string>={present:"Presente",absent:"Assente",unavailable:"Indisponibilità registrata",unknown:"Non registrato",upcoming:"Da svolgere",conflict:"Da verificare"};
function Status({state,availability}:{state:ComparisonState;availability:"available"|"unavailable"|null}) {
  return <span className="inline-flex flex-col gap-1"><span className={`rounded px-2 py-1 text-xs ${state==="present"?"bg-emerald-50 text-emerald-800":state==="absent"?"bg-red-50 text-red-800":"bg-muted text-muted-foreground"}`}>{labels[state]}</span>{availability&&<span className="text-[11px] text-muted-foreground">Genitore: {availability==="available"?"disponibile":"non disponibile"}</span>}</span>;
}
export function TeamManagerComparison({teamId,matchId,date}:{teamId:number;matchId:number;date:string|null}) {
  const {club,user,section}=useAuth();
  const [open,setOpen]=useState(false),[period,setPeriod]=useState<"week"|"four">("week");
  const {data,isLoading,error,refetch}=useQuery<{comparison:ManagerComparison;trainingCalendar:ManagerTrainingCalendar|null}>({
    queryKey:["/api/dirigenti/overview","comparison",club?.id,user?.id,section,teamId,matchId],enabled:open&&Boolean(date),
    queryFn:async()=>{const response=await fetch(withApi(`/api/dirigenti/overview?teamId=${teamId}&comparisonMatchId=${matchId}`),{credentials:"include"});if(!response.ok)throw new Error("Confronto presenze non disponibile");return response.json();},
  });
  const model=data&&date?managerComparisonRows(data.comparison,data.trainingCalendar,date,period):null;
  return <div className="space-y-3 border-t pt-3">
    <Button type="button" variant="outline" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?"Chiudi confronto":"Confronta presenze"}</Button>
    {open&&<div className="space-y-3">
      <h3 className="font-semibold">Allenamenti e convocazione salvata</h3>
      {!date?<p>Data della gara da definire: confronto non disponibile.</p>:<>
        <label className="block text-sm">Periodo<ScrollableSelect className="mt-1 block min-h-11 w-full rounded-lg border bg-background px-3" value={period} onValueChange={event=>setPeriod(event as "week"|"four")}><option value="week">Settimana della partita</option><option value="four">Quattro settimane prima della partita</option></ScrollableSelect></label>
        <p className="text-xs text-muted-foreground">Rosa attuale e convocati salvati. Disponibilità dei genitori e appello restano distinti.</p>
        {isLoading&&<p role="status">Caricamento confronto...</p>}
        {error&&<div role="alert"><p>{error.message}</p><Button variant="outline" onClick={()=>void refetch()}>Riprova</Button></div>}
        {model&&!model.events.length&&<p className="rounded-lg bg-muted p-3">Nessun allenamento nel periodo selezionato.</p>}
        {model&&model.events.length>0&&<>
          <p className="text-xs text-muted-foreground">{model.events.length} allenamenti · P = presente · A = assente. Non registrato non significa assente.</p>
          <div role="region" aria-label="Tabella presenze: scorri orizzontalmente per tutte le date" tabIndex={0} className="hidden max-w-full overflow-x-auto rounded-xl border sm:block"><table className="text-xs" style={{tableLayout:"fixed",width:384+model.events.length*112,minWidth:"100%",overflowWrap:"normal"}}><caption className="sr-only">Confronto presenze allenamenti e convocazione</caption><thead><tr className="border-b bg-muted/30"><th className="sticky left-0 z-10 bg-muted p-2 text-left" style={{width:160}}>Giocatore</th><th className="whitespace-nowrap p-2" style={{width:124}}>Convocazione</th>{model.events.map(event=><th key={event.id} className="whitespace-nowrap p-2" style={{width:112}}>{format(new Date(event.date!),"EEE d/M",{locale:it})}<span className="block font-normal">{format(new Date(event.date!),"HH:mm")}</span></th>)}<th className="whitespace-nowrap p-2" style={{width:100}}>Riepilogo</th></tr></thead><tbody>{model.players.map(player=><tr key={player.id} className="border-b last:border-b-0"><th className="sticky left-0 z-10 bg-card p-2 text-left font-medium" style={{width:160}}>{player.lastName} {player.firstName}</th><td className="whitespace-nowrap p-2">{player.called?"Convocato":"Non convocato"}</td>{player.cells.map((cell,index)=><td key={model.events[index].id} className="p-2 text-center"><Status {...cell}/></td>)}<td className="whitespace-nowrap p-2">{player.present} P · {player.absent} A</td></tr>)}</tbody></table></div>
          <ul className="divide-y rounded-xl border px-3 sm:hidden">
            {model.players.map(player=><li key={player.id} className="space-y-2 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="font-medium">{player.lastName} {player.firstName}</p><p className={`text-xs ${player.called?"text-primary":"text-muted-foreground"}`}>{player.called?"Convocato":"Non convocato nella lista salvata"}</p></div>
                <span className="shrink-0 whitespace-nowrap text-xs font-medium">{player.present} P · {player.absent} A</span>
              </div>
              <ul className="grid grid-cols-2 gap-2">
                {player.cells.map((cell,index)=><li key={model.events[index].id} className="min-w-0 space-y-1 rounded-lg bg-muted/20 p-2">
                  <p className="text-[11px] text-muted-foreground">{format(new Date(model.events[index].date!),"EEE d/M · HH:mm",{locale:it})}</p>
                  <Status {...cell}/>
                </li>)}
              </ul>
            </li>)}
          </ul>
        </>}
      </>}
    </div>}
  </div>;
}
