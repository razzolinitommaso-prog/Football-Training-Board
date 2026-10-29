import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TRAINING_ROTATION_PHASES, initialTrainingRotations, rotationSeconds, validateTrainingRotations, type TrainingRotations, type RotationPhase, type RotationActivity } from "@workspace/api-zod";
import { TrainingRosterPicker } from "./TrainingRosterPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { withApi } from "@/lib/api-base";
import { DisclosureSummary } from "@/components/ui/disclosure-summary";
type Activity=RotationActivity&{title:string};
type Player={id:number;firstName:string;lastName:string;teamId:number|null;teamName?:string|null;dateOfBirth?:string|null};
const labels={iniziale:"Fase iniziale",centrale:"Fase centrale",finale:"Fase finale"};
export function StationTurnPlanner({activities,teamId,teamIds,saved,readOnly,onSave,onDirtyChange,version}:{activities:Activity[];teamId:number|null;teamIds:number[];saved:TrainingRotations|undefined;readOnly:boolean;onSave:(value:TrainingRotations,recalculate:boolean,version?:string)=>Promise<unknown>;version?:string;onDirtyChange:(dirty:boolean)=>void}) {
 const {club,user}=useAuth();
 const [draft,setDraft]=useState<TrainingRotations|null>(saved??null),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const roster=useQuery<Player[]>({queryKey:["station-turn-roster",club?.id,user?.id,teamId,teamIds.join(",")],enabled:!!teamId,queryFn:async()=>{const results=await Promise.all((teamIds.length?teamIds:[teamId!]).map(async id=>{const response=await fetch(withApi(`/api/training-rosters/${id}?scope=team`),{credentials:"include"});if(!response.ok)throw Error("Rosa della seduta non disponibile");return (await response.json()).players as Player[];}));return [...new Map(results.flat().map(player=>[player.id,player])).values()];}});
 const players=roster.data??[];
 const [draftVersion,setDraftVersion]=useState(version);
 useEffect(()=>{onDirtyChange(dirty);},[dirty,onDirtyChange]);
 useEffect(()=>{if(!dirty){setDraft(saved??null);setDraftVersion(version);}},[saved,dirty,version]);
 function initial():TrainingRotations {
  const seeds=activities.map(activity=>{const first=draft?.[activity.phase as RotationPhase]?.[0]?.stations.find(station=>station.linkId===activity.id);return first?{...activity,playerIds:[...first.playerIds],seconds:first.seconds}:activity;});
  const result=initialTrainingRotations(seeds);
  for(const phase of TRAINING_ROTATION_PHASES){
   const turns=result[phase];if(!turns?.length)continue;
   const groups=turns[0].stations.map(s=>[...s.playerIds]);const assigned=new Set(groups.flat());
   const empty=groups.map((g,i)=>g.length?null:i).filter((i):i is number=>i!==null);
   if(empty.length){const rest=players.filter(p=>!assigned.has(p.id));rest.forEach((p,i)=>groups[empty[i%empty.length]].push(p.id));}
   result[phase]=turns.map((turn,index)=>({...turn,stations:turn.stations.map((station,i)=>({...station,playerIds:[...groups[(i-index+groups.length)%groups.length]]}))}));
  }
  return result;
 }
 function change(next:TrainingRotations){setDraft(next);setDirty(true);setError("");}
 function rebuild(){if(dirty&&!window.confirm("Ricreare i turni successivi usando i gruppi e i tempi del primo turno? Le personalizzazioni degli altri turni saranno sostituite."))return;change(initial());}
 const issue=draft?validateTrainingRotations(draft,activities,players.map(p=>p.id)):null;
 async function save(recalculate=false){if(!draft||issue)return;setBusy(true);setError("");try{await onSave(draft,recalculate,draftVersion);setDirty(false);}catch(error){setError(error instanceof Error?error.message:"Salvataggio non riuscito");}finally{setBusy(false);}}
 function update(phase:RotationPhase,turnIndex:number,stationIndex:number,patch:Partial<{seconds:number;playerIds:number[]}>){if(!draft)return;change({...draft,[phase]:draft[phase]!.map((turn,i)=>i!==turnIndex?turn:{...turn,stations:turn.stations.map((station,j)=>j===stationIndex?{...station,...patch}:station)})});}
 return <section className="space-y-3 rounded-xl border bg-muted/10 p-3"><h3 className="font-semibold">Stazioni, gruppi e rotazioni</h3><p className="text-xs text-muted-foreground">Le stazioni dello stesso turno si svolgono insieme. I turni si susseguono. Ogni gruppo può ruotare su tutte le stazioni.</p>
 {!draft?<><p className="text-sm">Questa seduta mantiene l'organizzazione sequenziale salvata.</p>{!readOnly&&<Button type="button" variant="outline" disabled={roster.isLoading||!activities.length} onClick={rebuild}>Organizza stazioni contemporanee e rotazioni</Button>}</>:<>
 <p className="text-sm">Tempo dei turni: <strong>{Math.round(rotationSeconds(draft)/60*100)/100} min</strong>{dirty&&" · Organizzazione da salvare"}</p>
 {!readOnly&&<Button type="button" variant="outline" onClick={rebuild} disabled={roster.isLoading}>Genera rotazione completa</Button>}
 {TRAINING_ROTATION_PHASES.map(phase=><details key={phase} open={phase==="iniziale"} className="rounded-lg border p-3"><DisclosureSummary>{labels[phase]}</DisclosureSummary><div className="mt-3 space-y-3">{(draft[phase]??[]).map((turn,turnIndex)=><div key={turn.id} className="space-y-2 rounded-lg border bg-background p-3"><p className="text-sm font-medium">Turno {turnIndex+1} · {Math.max(0,...turn.stations.map(s=>s.seconds))/60} min</p><div className="grid gap-3 md:grid-cols-2">{turn.stations.map((station,stationIndex)=>{
 const activity=activities.find(a=>a.id===station.linkId);const elsewhere=new Set(turn.stations.filter((_,i)=>i!==stationIndex).flatMap(s=>s.playerIds));
 return <div key={station.linkId} className="min-w-0 space-y-2 rounded-lg border p-3"><p className="break-words text-sm font-medium">{activity?.title??"Stazione rimossa: rigenera i turni"}</p><label className="flex items-center gap-2 text-xs">Minuti<Input className="w-24" type="number" min={1/60} max={300} step="any" disabled={readOnly} value={Number((station.seconds/60).toFixed(3))} onChange={e=>update(phase,turnIndex,stationIndex,{seconds:Math.max(1,Math.round(Number(e.target.value)*60))})}/></label><p className="break-words text-xs">{station.playerIds.map(id=>{const p=players.find(p=>p.id===id);return p?`${p.lastName} ${p.firstName}`:`Giocatore ${id}`;}).join(", ")||"Gruppo da assegnare"}</p>
 {!readOnly&&<><TrainingRosterPicker players={players.filter(p=>!elsewhere.has(p.id))} selectedIds={station.playerIds} teamId={teamId} onConfirm={ids=>update(phase,turnIndex,stationIndex,{playerIds:ids})}/><div className="flex flex-wrap gap-2">{[1,0.5].map(factor=><Button key={factor} type="button" size="sm" variant="ghost" onClick={()=>change({...draft,[phase]:[...(draft[phase]??[]),{id:crypto.randomUUID(),stations:[{...station,playerIds:[...station.playerIds],seconds:Math.max(1,Math.round(station.seconds*factor))}]}]})}>{factor===1?"Ripeti stazione":"Ripeti stazione a metà tempo"}</Button>)}</div></>}
 </div>;})}</div>{!readOnly&&<div className="flex flex-wrap gap-2">{[{label:"Ripeti turno intero",factor:1},{label:"Ripeti a metà tempo",factor:0.5},{label:"Turno personalizzato",factor:0}].map(option=><Button key={option.label} type="button" size="sm" variant="outline" onClick={()=>change({...draft,[phase]:[...(draft[phase]??[]),{id:crypto.randomUUID(),stations:turn.stations.map(s=>({...s,seconds:Math.max(1,Math.round(s.seconds*(option.factor||1))),playerIds:option.factor?[...s.playerIds]:[]}))}]})}>{option.label}</Button>)}<Button type="button" size="sm" variant="ghost" onClick={()=>change({...draft,[phase]:draft[phase]!.filter((_,i)=>i!==turnIndex)})}>Rimuovi turno</Button></div>}</div>)}{!draft[phase]?.length&&<p className="text-xs">Nessun turno: aggiungi le stazioni della fase e genera la rotazione.</p>}</div></details>)}
 {issue&&<p role="alert" className="text-sm text-amber-800">{issue}. Dopo aver aggiunto o rimosso stazioni puoi generare nuovamente la rotazione completa.</p>}
 {!readOnly&&<div className="flex flex-wrap gap-2"><Button type="button" disabled={busy||!!issue||roster.isLoading||!dirty} onClick={()=>void save()}>Salva organizzazione</Button><Button type="button" variant="outline" disabled={busy||!!issue||roster.isLoading} onClick={()=>void save(true)}>Ricalcola tempi sui turni e salva</Button></div>}
 </>}{roster.error&&<p role="alert" className="text-sm text-destructive">{roster.error.message}</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}</section>;
}
