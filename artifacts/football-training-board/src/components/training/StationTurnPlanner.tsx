import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { TRAINING_ROTATION_PHASES, initialTrainingRotations, rotationSeconds, rotationRecoverySeconds, rotationPhaseSeconds, validateTrainingRotations, type TrainingRotations, type RotationPhase, type RotationActivity, type RotationTurn } from "@workspace/api-zod";
import { TrainingRosterPicker } from "./TrainingRosterPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { withApi } from "@/lib/api-base";
import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import { MoreHorizontal } from "lucide-react";

type Activity=RotationActivity&{title:string;preview?:string|null;attendanceAdjusted?:boolean;principle?:string|null};
type Player={id:number;firstName:string;lastName:string;teamId:number|null;teamName?:string|null;dateOfBirth?:string|null};
type Content={toolbar:ReactNode;phases:Partial<Record<RotationPhase,ReactNode>>};
const labels={iniziale:"Fase iniziale",centrale:"Fase centrale",finale:"Fase finale"};
const time=(seconds:number)=>seconds%60===0?`${seconds/60} min`:`${Math.floor(seconds/60)} min ${seconds%60} s`;

export function StationTurnPlanner({activities,teamId,teamIds,sessionId,saved,readOnly,onSave,onDirtyChange,version,children,onView,onEdit,onRemove,onPreviewChange,blockedPlayerIds=[],attendanceLoading=false}:{activities:Activity[];sessionId?:number;blockedPlayerIds?:number[];attendanceLoading?:boolean;teamId:number|null;teamIds:number[];saved:TrainingRotations|undefined;readOnly:boolean;onSave:(value:TrainingRotations,recalculate:boolean,version?:string)=>Promise<unknown>;version?:string;onDirtyChange:(dirty:boolean)=>void;children?:(content:Content)=>ReactNode;onPreviewChange?:(value:TrainingRotations|null)=>void;onView?:(id:number)=>void;onEdit?:(id:number)=>void;onRemove?:(id:number)=>void}) {
 const {club,user}=useAuth();
 const [draft,setDraft]=useState<TrainingRotations|null>(saved??null),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [active,setActive]=useState<Partial<Record<RotationPhase,number>>>({});
 const roster=useQuery<Player[]>({queryKey:["station-turn-roster",club?.id,user?.id,teamId,teamIds.join(","),sessionId],enabled:!!teamId,queryFn:async()=>{if(sessionId){const response=await fetch(withApi(`/api/training-sessions/${sessionId}/roster`),{credentials:"include"});if(!response.ok)throw Error("Rosa della seduta non disponibile");return response.json();}const results=await Promise.all((teamIds.length?teamIds:[teamId!]).map(async id=>{const response=await fetch(withApi(`/api/training-rosters/${id}?scope=team`),{credentials:"include"});if(!response.ok)throw Error("Rosa della seduta non disponibile");return (await response.json()).players as Player[];}));return [...new Map(results.flat().map(player=>[player.id,player])).values()];}});
 const players=(roster.data??[]).filter(player=>!blockedPlayerIds.includes(player.id));
 const [draftVersion,setDraftVersion]=useState(version);
 useEffect(()=>{onDirtyChange(dirty);},[dirty,onDirtyChange]);
 useEffect(()=>{onPreviewChange?.(dirty?draft:null);},[dirty,draft,onPreviewChange]);
 useEffect(()=>{if(!dirty){setDraft(saved??null);setDraftVersion(version);}},[saved,dirty,version]);
 function initial():TrainingRotations {
  const seeds=activities.map(activity=>{const first=draft?.[activity.phase as RotationPhase]?.[0]?.stations.find(station=>station.linkId===activity.id);return first?{...activity,playerIds:[...first.playerIds],seconds:first.seconds}:activity;});
  const result=initialTrainingRotations(seeds);
  for(const phase of TRAINING_ROTATION_PHASES){
   const turns=result[phase];if(!turns?.length)continue;
   const groups=turns[0].stations.map(s=>[...s.playerIds]);const assigned=new Set(groups.flat());
   const empty=groups.map((g,i)=>g.length?null:i).filter((i):i is number=>i!==null);
   if(empty.length){const rest=players.filter(p=>!assigned.has(p.id));rest.forEach((p,i)=>groups[empty[i%empty.length]].push(p.id));}
   result[phase]=turns.map((turn,index)=>({...turn,recoverySeconds:index<turns.length-1?(draft?.[phase]?.[index]?.recoverySeconds??0):0,stations:turn.stations.map((station,i)=>({...station,playerIds:[...groups[(i-index+groups.length)%groups.length]]}))}));
  }
  return result;
 }
 function change(next:TrainingRotations){setDraft(next);setDirty(true);setError("");}
 function rebuild(){if(attendanceLoading)return;if((dirty||Object.values(draft??{}).some(turns=>turns.length))&&!window.confirm("Ricreare i turni successivi usando i gruppi e i tempi del primo turno? Le personalizzazioni degli altri turni saranno sostituite."))return;change(initial());setActive({});}
 const issue=draft?validateTrainingRotations(draft,activities,players.map(p=>p.id)):null;
 async function save(recalculate=false){if(!draft||issue||attendanceLoading)return;setBusy(true);setError("");try{await onSave(draft,recalculate,draftVersion);setDirty(false);}catch(error){setError(error instanceof Error?error.message:"Salvataggio non riuscito");}finally{setBusy(false);}}
 function update(phase:RotationPhase,turnIndex:number,stationIndex:number,patch:Partial<{seconds:number;playerIds:number[]}>){if(!draft)return;change({...draft,[phase]:draft[phase]!.map((turn,i)=>i!==turnIndex?turn:{...turn,stations:turn.stations.map((station,j)=>j===stationIndex?{...station,...patch}:station)})});}
 function append(phase:RotationPhase,turn:RotationTurn){if(!draft)return;const turns=[...(draft[phase]??[]),{...turn,id:crypto.randomUUID(),recoverySeconds:0}];change({...draft,[phase]:turns});setActive(old=>({...old,[phase]:turns.length-1}));}
 const phasePanels:Content["phases"]={};
 if(draft)for(const phase of TRAINING_ROTATION_PHASES){
  const turns=draft[phase]??[];if(!turns.length)continue;
  const turnIndex=Math.min(active[phase]??0,turns.length-1),turn=turns[turnIndex];
  const used=new Set(turn.stations.flatMap(s=>s.playerIds));
  const free=players.filter(p=>!used.has(p.id));
  phasePanels[phase]=<div className="space-y-3 px-3 pb-3">
   {turns.length<=5?<div className="flex flex-wrap gap-1" role="group" aria-label={`Turni: ${labels[phase]}`}>{turns.map((t,index)=><Button key={t.id} type="button" size="sm" className="min-h-10 flex-1" variant={index===turnIndex?"default":"outline"} aria-pressed={index===turnIndex} onClick={()=>setActive(old=>({...old,[phase]:index}))}>Turno {index+1}</Button>)}</div>:<ScrollableSelect className="w-full" aria-label={`Turno: ${labels[phase]}`} value={String(turnIndex)} onValueChange={value=>setActive(old=>({...old,[phase]:Number(value)}))}>{turns.map((t,index)=><option key={t.id} value={String(index)}>Turno {index+1} di {turns.length}</option>)}</ScrollableSelect>}
   <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">Turno {turnIndex+1} · {time(Math.max(0,...turn.stations.map(s=>s.seconds)))}</p>{!readOnly&&<DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size="sm" variant="outline" disabled={busy||attendanceLoading} aria-label={`Azioni turno ${turnIndex+1}: ${labels[phase]}`}>Azioni <MoreHorizontal className="ml-1 h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{[{label:"Ripeti turno intero",factor:1},{label:"Ripeti a metà tempo",factor:0.5},{label:"Turno personalizzato",factor:0}].map(option=><DropdownMenuItem key={option.label} onSelect={()=>append(phase,{...turn,stations:turn.stations.map(s=>({...s,seconds:Math.max(1,Math.round(s.seconds*(option.factor||1))),playerIds:option.factor?[...s.playerIds]:[]}))})}>{option.label}</DropdownMenuItem>)}<DropdownMenuItem className="text-destructive" onSelect={()=>{if(!window.confirm(`Rimuovere il turno ${turnIndex+1}?`))return;const next=turns.filter((_,i)=>i!==turnIndex).map((t,i,list)=>i===list.length-1?{...t,recoverySeconds:0}:t);change({...draft,[phase]:next});}}>Rimuovi turno</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</div>
   <div className="divide-y">{turn.stations.map((station,stationIndex)=>{
    const activity=activities.find(a=>a.id===station.linkId),elsewhere=new Set(turn.stations.filter((_,i)=>i!==stationIndex).flatMap(s=>s.playerIds));
    return <article key={station.linkId} className="min-w-0 space-y-2 py-3" aria-label={`Stazione ${stationIndex+1}, turno ${turnIndex+1}`}>
     <div className="flex items-start justify-between gap-2"><h4 className="min-w-0 break-words text-sm font-semibold">{activity?.title??"Stazione rimossa: rigenera i turni"}</h4>{!readOnly&&<DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Azioni stazione: ${activity?.title??station.linkId}`}><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{onView&&activity&&<DropdownMenuItem onSelect={()=>onView(station.linkId)}>Dettagli stazione</DropdownMenuItem>}{onEdit&&activity&&<DropdownMenuItem disabled={dirty} onSelect={()=>onEdit(station.linkId)}>Modifica stazione</DropdownMenuItem>}{[1,0.5].map(factor=><DropdownMenuItem key={factor} onSelect={()=>append(phase,{id:"",stations:[{...station,playerIds:[...station.playerIds],seconds:Math.max(1,Math.round(station.seconds*factor))}]})}>{factor===1?"Ripeti stazione":"Ripeti stazione a metà tempo"}</DropdownMenuItem>)}{onRemove&&<DropdownMenuItem disabled={dirty} className="text-destructive" onSelect={()=>onRemove(station.linkId)}>Rimuovi dalla seduta</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>}</div>
     {activity?.principle&&<p className="text-xs text-primary">{activity.principle}</p>}
     {activity?.attendanceAdjusted&&<p className="text-xs text-muted-foreground">Rosa aggiornata. Riapri e salva la lavagna per aggiornare l’immagine.</p>}
     {activity?.preview&&<button type="button" className="block w-full" onClick={()=>onView?.(station.linkId)} aria-label={`Anteprima: ${activity.title}`}><img src={activity.preview} alt={`Lavagna: ${activity.title}`} className="max-h-32 w-full object-contain"/></button>}
     <p className="break-words text-sm">{station.playerIds.map(id=>{const p=players.find(p=>p.id===id);return p?`${p.lastName} ${p.firstName}`:`Giocatore ${id}`;}).join(" · ")||"Gruppo da assegnare"}</p>
     <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{station.playerIds.length} giocatori</span><label className="flex items-center gap-2 text-xs">Minuti<Input aria-label={`Minuti: ${activity?.title??station.linkId}, turno ${turnIndex+1}`} className="h-9 w-20" type="number" min={1/60} max={300} step="any" disabled={readOnly||busy} value={Number((station.seconds/60).toFixed(3))} onChange={e=>{const value=Number(e.target.value);if(Number.isFinite(value)&&value>0&&value<=300)update(phase,turnIndex,stationIndex,{seconds:Math.max(1,Math.round(value*60))});}}/></label></div>
     {!readOnly&&<TrainingRosterPicker sessionId={sessionId} players={players.filter(p=>!elsewhere.has(p.id))} selectedIds={station.playerIds} teamId={teamId} buttonLabel="Modifica gruppo" showCount={false} excludedIds={blockedPlayerIds} disabled={busy||attendanceLoading} onConfirm={ids=>{if(!busy)update(phase,turnIndex,stationIndex,{playerIds:ids.filter(id=>!elsewhere.has(id)&&players.some(p=>p.id===id))});}}/>}
     {readOnly&&onView&&<Button type="button" size="sm" variant="outline" onClick={()=>onView(station.linkId)}>Dettagli stazione</Button>}
    </article>;
   })}</div>
   {activities.filter(a=>a.phase===phase&&!turns.some(t=>t.stations.some(station=>station.linkId===a.id))).map(a=><div key={a.id} className="rounded-lg border border-dashed p-3 text-sm"><p className="font-medium">{a.title}</p><p className="text-xs text-muted-foreground">Nuova stazione: genera la rotazione per assegnarla ai turni.</p>{onView&&<Button type="button" variant="outline" size="sm" className="mt-2" onClick={()=>onView(a.id)}>Dettagli stazione</Button>}</div>)}
   {turnIndex<turns.length-1&&<label className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">Recupero dopo questo turno<span className="flex items-center gap-2"><Input aria-label={`Recupero dopo turno ${turnIndex+1}: ${labels[phase]}`} className="w-20" type="number" min={0} max={300} step="any" disabled={readOnly||busy} value={Number(((turn.recoverySeconds??0)/60).toFixed(3))} onChange={e=>{const value=Number(e.target.value);if(Number.isFinite(value)&&value>=0&&value<=300)change({...draft,[phase]:turns.map((t,i)=>i===turnIndex?{...t,recoverySeconds:Math.round(value*60)}:t)});}}/>min</span></label>}
   <p className="rounded-lg bg-primary/5 p-2 text-xs" aria-live="polite">{used.size} su {players.length} assegnati · {free.length?`${free.length} da assegnare: ${free.map(p=>`${p.lastName} ${p.firstName}`).join(", ")}`:"Nessun giocatore ripetuto nello stesso turno"}</p>
  </div>;
 }
 const toolbar=<div className="space-y-2 rounded-xl border bg-muted/10 p-3">
  <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Gruppi e rotazioni</h3>{draft&&!readOnly&&<DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size="sm" variant="outline" disabled={attendanceLoading||busy||roster.isLoading} aria-label="Organizza gruppi e rotazioni">Organizza <MoreHorizontal className="ml-1 h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={rebuild}>Genera rotazione completa</DropdownMenuItem><DropdownMenuItem disabled={!!issue} onSelect={()=>void save(true)}>Ricalcola tempi sui turni e salva</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</div>
  {!draft?<><p className="text-xs text-muted-foreground">Questa seduta mantiene l'organizzazione sequenziale salvata.</p>{!readOnly&&<Button type="button" variant="outline" className="h-auto min-h-10 whitespace-normal" disabled={attendanceLoading||roster.isLoading||!activities.length} onClick={rebuild}>Organizza stazioni contemporanee e rotazioni</Button>}</>:<>
   <p className="text-xs text-muted-foreground">Turni: <strong>{time(rotationSeconds(draft))}</strong> · Recuperi tra turni: <strong>{time(rotationRecoverySeconds(draft))}</strong></p>
   {dirty&&<p className="text-xs">Organizzazione da salvare</p>}
   {!readOnly&&dirty&&<Button type="button" className="h-auto min-h-10 w-full whitespace-normal" disabled={attendanceLoading||busy||!!issue||roster.isLoading} onClick={()=>void save()}>Salva organizzazione</Button>}
  </>}
  {issue&&<p role="alert" className="text-sm text-amber-800">{issue}. Dopo aver aggiunto o rimosso stazioni puoi generare nuovamente la rotazione completa.</p>}{roster.error&&<p role="alert" className="text-sm text-destructive">{roster.error.message}</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </div>;
 return children?children({toolbar,phases:phasePanels}):<div className="space-y-3">{toolbar}{TRAINING_ROTATION_PHASES.filter(phase=>phasePanels[phase]).map(phase=><details key={phase} open={phase==="iniziale"} className="rounded-xl border"><DisclosureSummary className="p-3">{labels[phase]} · {time(rotationPhaseSeconds(draft!,phase))}</DisclosureSummary>{phasePanels[phase]}</details>)}</div>;
}
