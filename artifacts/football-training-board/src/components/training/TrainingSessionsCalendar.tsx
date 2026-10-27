import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { withApi } from "@/lib/api-base";
import { sessionCalendarRows, type CalendarSession, type SessionCalendarTeam, type SessionCalendarRow } from "@/lib/training-session-calendar";
import type { ManagerTrainingCalendar } from "@/lib/team-manager-training-calendar";

const dayKey = (date: Date) => format(date, "yyyy-MM-dd");
const label = (row: SessionCalendarRow) => row.status === "complete" ? "Preparazione completa" : row.status === "pending" ? "Da completare" : row.status === "planned" ? "Sessione da creare" : row.status === "cancelled" ? "Annullato" : row.status === "unknown" ? "Preparazione da verificare" : "Spostato / congiunto";
const tone = (row: SessionCalendarRow) => row.status === "complete" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : row.status === "pending" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-border bg-muted/30 text-muted-foreground";

type Props = { teams: SessionCalendarTeam[]; sessions: CalendarSession[]; section?: string; canCreate: boolean; loading: boolean; error: boolean; onRetry:()=>void; onOpen:(id:number)=>void; onCreate:(draft:{teamId:number;date:string;start:string;durationMinutes?:number})=>void; focusSession?: CalendarSession | null };

export function TrainingSessionsCalendar(props: Props) {
  const {club,user,role,section:activeSection} = useAuth();
  const [scope,setScope] = useState("");
  const [month,setMonth] = useState(()=>startOfMonth(new Date()));
  const [selected,setSelected] = useState(()=>dayKey(new Date()));
  const lastFocus = useRef<number|null>(null);
  const options = useMemo(()=>{
    const map = new Map<string,SessionCalendarTeam|null>(props.teams.map(team=>[String(team.id),team]));
    for(const session of props.sessions.filter(session=>session.sessionKind==="regular")) {
      const key = session.teamId === null ? "none" : String(session.teamId);
      if(!map.has(key)) map.set(key,session.teamId === null ? null : {id:session.teamId,name:(session as CalendarSession & {teamName?:string}).teamName || `Squadra ${session.teamId}`});
    }
    return [...map].sort((a,b)=>(a[1]?.name??"Senza squadra").localeCompare(b[1]?.name??"Senza squadra","it"));
  },[props.teams,props.sessions]);
  const selectedScope = options.some(([key])=>key===scope) ? scope : options[0]?.[0] ?? "";
  const team = options.find(([key])=>key===selectedScope)?.[1] ?? null;
  useEffect(()=>{
    const focus=props.focusSession;
    if(!focus || focus.id===lastFocus.current || !Number.isFinite(Date.parse(focus.scheduledAt))) return;
    const key = focus.teamId === null ? "none" : String(focus.teamId);
    if(!options.some(([value])=>value===key)) return;
    lastFocus.current=focus.id;setScope(key);setMonth(startOfMonth(new Date(focus.scheduledAt)));setSelected(dayKey(new Date(focus.scheduledAt)));
  },[props.focusSession,options]);
  const from=startOfWeek(month,{weekStartsOn:1}), to=endOfWeek(endOfMonth(month),{weekStartsOn:1});
  const fromKey=dayKey(from),toKey=dayKey(to);
  const changesQuery=useQuery<ManagerTrainingCalendar["changes"]>({
    queryKey:["/api/training-calendar-overrides","session-calendar",club?.id,user?.id,role,props.section??activeSection,team?.id,fromKey,toKey],
    queryFn:async()=>{const query=new URLSearchParams({from:fromKey,to:toKey,calendarTeamId:String(team!.id)});if(props.section)query.set("section",props.section);const response=await fetch(withApi(`/api/training-calendar-overrides?${query}`),{credentials:"include"});if(!response.ok)throw new Error("Programmazione non disponibile");return response.json();},
    enabled:!props.loading&&!props.error&&Boolean(team&&props.teams.some(item=>item.id===team.id)),
  });
  const scheduleReady = changesQuery.isSuccess;
  const rows=sessionCalendarRows(team,props.sessions,changesQuery.data??[],from,to,scheduleReady);
  const byDay=new Map<string,SessionCalendarRow[]>();for(const row of rows)byDay.set(row.date,[...(byDay.get(row.date)??[]),row]);
  const days=eachDayOfInterval({start:from,end:to});
  const createAllowed=props.canCreate&&Boolean(team&&props.teams.some(item=>item.id===team.id))&&scheduleReady&&!props.loading&&!props.error;
  const activate=(row:SessionCalendarRow)=>{
    setSelected(row.date);
    if(row.sessionId)props.onOpen(row.sessionId);
    else if(row.status==="planned"&&createAllowed&&team) {
      const minutes=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3,5));
      const duration=row.endTime ? minutes(row.endTime)-minutes(row.time) : 0;
      props.onCreate({teamId:team.id,date:row.date,start:row.time,durationMinutes:duration>0?duration:undefined});
    }
  };
  const move=(amount:number)=>{const next=addMonths(month,amount);setMonth(next);setSelected(dayKey(next));};
  const today=dayKey(new Date());
  return <section className="space-y-4" aria-label="Calendario sessioni per squadra">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {options.map(([key,item])=><button key={key} type="button" aria-pressed={selectedScope===key} onClick={()=>setScope(key)} className={`min-h-20 min-w-0 rounded-xl border p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${selectedScope===key?"border-primary bg-primary/5":"bg-card"}`}><span className="block break-words text-sm font-semibold">{item?.name??"Senza squadra"}</span><span className="mt-1 block text-[11px] text-muted-foreground">{selectedScope===key?"Squadra selezionata":"Apri calendario sessioni"}</span></button>)}
    </div>
    {props.loading ? <p role="status" className="rounded-xl border p-5 text-sm">Caricamento sessioni e squadre...</p> : props.error ? <div role="alert" className="rounded-xl border p-5 text-sm"><p>Impossibile caricare il calendario. Nessuna sessione è stata modificata.</p><Button type="button" variant="outline" className="mt-2" onClick={props.onRetry}>Riprova</Button></div> : !options.length ? <p className="rounded-xl border p-5 text-sm text-muted-foreground">Nessuna squadra o sessione disponibile per il tuo accesso.</p> : <div className="rounded-2xl border bg-card p-2 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold capitalize">{format(month,"MMMM yyyy",{locale:it})} · {team?.name??"Senza squadra"}</h2><div className="flex gap-1"><Button type="button" size="icon" variant="outline" aria-label="Mese precedente" onClick={()=>move(-1)}><ChevronLeft className="h-4 w-4"/></Button><Button type="button" size="sm" variant="outline" onClick={()=>{setMonth(startOfMonth(new Date()));setSelected(today);}}>Oggi</Button><Button type="button" size="icon" variant="outline" aria-label="Mese successivo" onClick={()=>move(1)}><ChevronRight className="h-4 w-4"/></Button></div></div>
      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground"><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500"/>Preparazione completa</span><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500"/>Da completare</span>{props.canCreate&&<span>＋ Sessione da creare</span>}</div>
      {team&&changesQuery.isLoading&&<p role="status" className="mb-3 text-xs text-muted-foreground">Caricamento orari e variazioni...</p>}
      {changesQuery.isError&&<div role="alert" className="mb-3 rounded border p-2 text-xs">Orari e variazioni non disponibili. Sono visibili soltanto le sessioni salvate; creazione dal calendario sospesa.<Button type="button" variant="link" size="sm" onClick={()=>void changesQuery.refetch()}>Riprova</Button></div>}
      <div className="grid grid-cols-7 text-center text-[10px] uppercase text-muted-foreground">{["Lun","Mar","Mer","Gio","Ven","Sab","Dom"].map(day=><div key={day} className="pb-2">{day}</div>)}</div>
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border-l border-t">{days.map(day=>{
        const date=dayKey(day),events=byDay.get(date)??[];
        return <div key={date} className={`min-h-24 min-w-0 border-b border-r p-0.5 sm:min-h-32 sm:p-1.5 ${isSameMonth(day,month)?"":"bg-muted/20 text-muted-foreground"} ${selected===date?"bg-primary/[0.04]":""}`}><button type="button" aria-label={format(day,"EEEE d MMMM yyyy",{locale:it})} aria-pressed={selected===date} aria-current={today===date?"date":undefined} onClick={()=>setSelected(date)} className={`mb-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs ${today===date?"bg-primary text-primary-foreground":""}`}>{day.getDate()}</button><div className="space-y-1">{events.map(row=><button type="button" key={row.id} disabled={!row.sessionId&&!(row.status==="planned"&&createAllowed)} onClick={()=>activate(row)} aria-label={`${row.time} ${row.title}: ${label(row)}, ${date}`} className={`block min-h-10 w-full min-w-0 rounded-md border p-0.5 text-left text-[10px] sm:p-1.5 ${row.status==="planned"?"border-dashed border-primary/30 bg-primary/[0.03] text-primary":tone(row)}`}><span className="block text-center font-semibold sm:text-left">{row.status==="planned"&&createAllowed?<Plus aria-hidden="true" className="mx-auto h-4 w-4 sm:mx-0"/>:<>{row.status === "cancelled" ? "× " : row.status === "relocated" ? "↗ " : ""}{row.time}</>}</span><span className="hidden break-words font-medium leading-snug sm:block">{row.title}</span><span className="hidden text-[9px] sm:block">{label(row)}</span></button>)}</div></div>;
      })}</div>
      <div className="mt-4 space-y-2" aria-live="polite"><h3 className="text-sm font-semibold capitalize">{format(new Date(`${selected}T12:00:00`),"EEEE d MMMM",{locale:it})}</h3>{(byDay.get(selected)??[]).map(row=><div key={row.id} className={`rounded-xl border p-3 text-sm ${tone(row)}`}><p className="font-semibold">{row.time} · {row.title}</p><p className="mt-1 text-xs">{label(row)}{row.exerciseCount!==undefined?` · ${row.exerciseCount} esercitazioni`:""}</p>{row.detail&&<p className="mt-1 text-xs">{row.detail}</p>}{(row.sessionId||(row.status==="planned"&&createAllowed))&&<Button type="button" variant="outline" size="sm" className="mt-2" onClick={()=>activate(row)}>{row.sessionId?"Apri scheda sessione":"Crea sessione"}</Button>}</div>)}{!(byDay.get(selected)?.length)&&<p className="text-xs text-muted-foreground">{team&&!scheduleReady?"Nessuna sessione salvata per questa data; gli orari non sono disponibili.":"Nessuna sessione o appuntamento previsto per questa data."}</p>}</div>
    </div>}
  </section>;
}
