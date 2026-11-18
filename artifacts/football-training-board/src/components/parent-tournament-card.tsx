import { useEffect, useId, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, Lock, MapPin, Trophy, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { withApi } from "@/lib/api-base";

export type ParentTournament = {
  key:string; name:string; location:string|null; teamId:number; parentPlayerId:number;
  firstDate:string; lastDate:string; matchIds:number[]; hasPreviousMatchReplies:boolean;
  program:{id:string;date:string;homeTeam:string;awayTeam:string;phase:string;group:string;matchId:number|null;ownSide?:string}[];
  parentAvailability:{status:string;reason:string|null;reasonLabel?:string|null;notes:string|null;updatedAt:string|null}|null;
  parentAvailabilityDeadline:string; parentAvailabilityLocked:boolean;
};
const reasons=[['illness','Malattia'],['catechism','Catechismo'],['family','Motivi familiari'],['other','Altro']];
const dayKey=(date:string)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));
export function parentTournamentDays(t:ParentTournament){return [...new Set(t.program.map(e=>dayKey(e.date)))].sort();}
export function ParentTournamentCard({tournament:t,onUpdated,renderMatch}:{tournament:ParentTournament;onUpdated:(next:ParentTournament)=>void;renderMatch?:(id:number)=>React.ReactNode}){
  const reasonId=useId();
  const [choice,setChoice]=useState(t.parentAvailability?.status??'');
  const [reason,setReason]=useState(t.parentAvailability?.reason??'');
  const [notes,setNotes]=useState(t.parentAvailability?.notes??'');
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  useEffect(()=>{setChoice(t.parentAvailability?.status??'');setReason(t.parentAvailability?.reason??'');setNotes(t.parentAvailability?.notes??'');setError('');},[t.key,t.parentAvailability]);
  const days=parentTournamentDays(t),status=t.parentAvailability?.status;
  const tone=status==='available'?'border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200':status==='unavailable'?'border-red-200 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200':'border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200';
  async function save(){
    if(saving||t.parentAvailabilityLocked)return;
    if(!['available','unavailable'].includes(choice)){setError('Indica Disponibile oppure Non disponibile.');return;}
    if(choice==='unavailable'&&(!reason||(reason==='other'&&!notes.trim()))){setError('Indica il motivo dell’indisponibilità.');return;}
    setSaving(true);setError('');
    try{const res=await fetch(withApi('/api/parent/tournaments'),{method:'PATCH',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:t.key,status:choice,reason:choice==='unavailable'?reason:null,notes:choice==='unavailable'?notes:null})});const body=await res.json();if(!res.ok)throw Error(body?.error??'Impossibile registrare la disponibilità.');onUpdated(body);}
    catch(err){setError(err instanceof Error?err.message:'Impossibile registrare la disponibilità.');}finally{setSaving(false);}
  }
  return <article className="min-w-0 space-y-4 rounded-2xl border bg-card p-4 sm:p-5" aria-label={`Torneo ${t.name}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 text-xs text-muted-foreground"><Trophy className="h-4 w-4 text-primary"/>Torneo · {days.length} {days.length===1?'giornata':'giornate'} · {t.matchIds.length} partite della squadra</p><Badge variant="outline" className={tone} aria-live="polite">{status==='available'?'Disponibile':status==='unavailable'?'Non disponibile':'Da indicare'}</Badge></div>
    <div><h3 className="break-words text-lg font-semibold">{t.name}</h3>{t.location&&<p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground"><MapPin className="h-4 w-4 shrink-0"/>{t.location}</p>}</div>
    <div className="grid gap-2 sm:grid-cols-2">{days.map(day=><div key={day} className="rounded-xl border bg-muted/20 p-3"><p className="font-medium">{new Date(day+'T12:00:00').toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p><p className="text-xs text-muted-foreground">{t.program.filter(e=>dayKey(e.date)===day&&e.matchId).length} {t.program.filter(e=>dayKey(e.date)===day&&e.matchId).length===1?"gara":"gare"} della squadra</p></div>)}</div>
    <details className="rounded-xl border bg-muted/10"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 text-sm font-medium"><span className="flex items-center gap-2"><CalendarDays className="h-4 w-4"/>Programma partite per giornata</span><ChevronDown className="h-4 w-4"/></summary><div className="space-y-4 border-t p-3">{days.map(day=><section key={day} className="space-y-2"><h4 className="text-sm font-semibold">{new Date(day+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'})}</h4><ul className="divide-y">{t.program.filter(e=>dayKey(e.date)===day).map(e=><li key={e.id} className="space-y-1 py-2"><div className="flex items-start gap-3 text-sm"><time className="shrink-0 tabular-nums text-muted-foreground">{new Date(e.date).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'})}</time><span className={`min-w-0 break-words ${e.matchId?'font-semibold text-primary':''}`}>{e.homeTeam} – {e.awayTeam}</span></div>{(e.phase||e.group)&&<p className="text-xs text-muted-foreground">{[e.phase,e.group].filter(Boolean).join(' · ')}</p>}{e.matchId&&renderMatch&&<details><summary className="cursor-pointer py-1 text-xs text-primary">Convocazione e dettagli della partita</summary><div className="pt-2">{renderMatch(e.matchId)}</div></details>}</li>)}</ul></section>)}</div></details>
    <div className="space-y-3 border-t pt-4"><h4 className="font-semibold">Disponibilità per tutto il torneo</h4><p className="text-xs text-muted-foreground">Un’unica risposta vale per tutte le giornate e tutte le partite del torneo. La convocazione viene decisa dal mister.</p>
      {t.hasPreviousMatchReplies&&<p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">Sono presenti risposte sulle singole gare. Conferma una risposta unica per tutto il torneo.</p>}
      <p className="flex items-start gap-1 text-xs text-muted-foreground">{t.parentAvailabilityLocked&&<Lock className="h-3.5 w-3.5 shrink-0"/>}{t.parentAvailabilityLocked?'Termine per la risposta scaduto':'Modificabile fino a'} · {new Date(t.parentAvailabilityDeadline).toLocaleString('it-IT',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'})}</p>
      {t.parentAvailabilityLocked?status==='unavailable'&&<p className="text-sm">Motivo: {t.parentAvailability?.reasonLabel??reasons.find(r=>r[0]===t.parentAvailability?.reason)?.[1]}{t.parentAvailability?.notes?` · ${t.parentAvailability.notes}`:''}</p>:<>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label={`Disponibilità per ${t.name}`}><Button variant="outline" disabled={saving} aria-pressed={choice==='available'} onClick={()=>setChoice('available')} className={`gap-2 ${choice==='available'?'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white':''}`}><CheckCircle2 className="h-4 w-4"/>Disponibile</Button><Button variant="outline" disabled={saving} aria-pressed={choice==='unavailable'} onClick={()=>setChoice('unavailable')} className={`gap-2 ${choice==='unavailable'?'border-red-600 bg-red-600 text-white hover:bg-red-700 hover:text-white':''}`}><XCircle className="h-4 w-4"/>Non disponibile</Button></div>
        {choice==='unavailable'&&<div className="space-y-2"><div className="space-y-1"><label htmlFor={reasonId} className="block text-sm">Motivo dell’indisponibilità</label><select id={reasonId} value={reason} disabled={saving} onChange={e=>setReason(e.target.value)} className="h-11 w-full rounded-md border bg-background px-3"><option value="">Seleziona motivo</option>{reasons.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div><label className="block space-y-1 text-sm"><span>{reason==='other'?'Motivazione':'Note per lo staff (facoltative)'}</span><Textarea value={notes} maxLength={2000} disabled={saving} onChange={e=>setNotes(e.target.value)}/></label></div>}
        <Button className="w-full" disabled={saving||!choice} onClick={()=>void save()}>{saving?'Salvataggio…':status?'Aggiorna risposta torneo':'Conferma disponibilità torneo'}</Button>
      </>}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      {status&&<p className="text-sm font-medium" role="status">{status==='available'?'Disponibilità registrata per tutto il torneo.':'Indisponibilità registrata per tutto il torneo.'}</p>}
    </div>
  </article>;
}
