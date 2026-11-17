import { CallupRulesCard } from "@/components/dashboard/CallupRulesCard";
import {upcomingFirst, isUpcomingMatch} from "@/lib/match-presentation";
import { CompactMatchHeading, CompactMatchDetails } from "@/components/calendar/CompactMatch";
import { AttendanceRegister } from "@/components/training/AttendanceRegister";
import { useState } from "react";
import { analyseMatchReport, type MatchReport, type MatchRotationSummary } from "@workspace/api-zod";
import { MatchRotationComparison } from "@/components/calendar/MatchRotationComparison";
import { MatchReportEditor, MatchReportLineups, MatchReportReviewSummary, MatchReportSummary } from "./calendari/MatchReportEditor";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import { TeamManagerPlayers } from "@/components/calendar/TeamManagerPlayers";
import type { ManagerPlayer } from "@/lib/team-manager-player-status";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { CalendarDays, Users, ClipboardList, ChevronRight } from "lucide-react";
import type { ManagerTrainingCalendar } from "@/lib/team-manager-training-calendar";
import { TeamManagerComparison } from "@/components/calendar/TeamManagerComparison";
import { TeamManagerCalendar } from "@/components/calendar/TeamManagerCalendar";
import { useAuth } from "@/hooks/use-auth";
import { withApi } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { reportLineupAt } from "@/lib/match-period-rotation";

type Player = ManagerPlayer & { teamName?: string };
type Team = {id:number;name:string;category:string|null;clubSection:string};
type Match = {preparationStatus?:"empty"|"partial"|"complete";rotation?:MatchRotationSummary;reportRotation?:MatchRotationSummary;reportPlayers?:Pick<Player,"id"|"firstName"|"lastName">[];report?:MatchReport;review?:{confirmedAt:string;report?:MatchReport;notes?:string};id:number;opponent:string;date:string;location:string|null;competition:string|null;homeAway:string;result:string|null;convocationAt:string|null;convocationPlace:string|null;isPostponed:boolean;rescheduleDate:string|null;rescheduleTbd:boolean;callups:Pick<Player,"id"|"firstName"|"lastName">[]};
type Training = {id:number;title:string;scheduledAt:string;location:string|null;durationMinutes:number|null;status:string};
type Overview = {teams:Team[];selectedTeamId:number|null;players:Player[];rosterTeams?:{ id:number; name:string }[];matches:Match[];training:Training[];trainingCalendar?:ManagerTrainingCalendar|null};
const when = (value:string|null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("it-IT",{weekday:"short",day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}) : "Da definire";
const matchDate = (match:Match) => match.isPostponed ? match.rescheduleTbd ? null : match.rescheduleDate : match.date;
const paths = [{path:"presenze",label:"Presenze",Icon:ClipboardList},{path:"calendario",label:"Calendario",Icon:CalendarDays},{path:"convocazioni",label:"Convocazioni",Icon:ClipboardList},{path:"squadra",label:"Squadra",Icon:Users}];
function ReportConfirmation({ match, onConfirmed }: { match: Match; onConfirmed: () => void }) {
  const [draft, setDraft] = useState<MatchReport | null>(null);
  const [notes, setNotes] = useState("");
  const [pendingLineup, setPendingLineup] = useState(false);
  const confirmation = useMutation({
    mutationFn: async ({ managerReport, notes }: { managerReport?: MatchReport; notes?: string }) => {
      const response = await fetch(withApi(`/api/matches/${match.id}/report-confirmation`), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: match.report, managerReport, notes }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error ?? "Impossibile confermare il resoconto.");
      }
    },
    onSuccess: () => {
      setDraft(null);
      setNotes("");
      onConfirmed();
    },
  });
  const date = matchDate(match);
  const report = match.report;
  const rotation = match.reportRotation ?? match.rotation;
  const players = (match.reportPlayers ?? match.callups).map(player => ({ id: player.id, name: `${player.lastName} ${player.firstName}`.trim() }));
  const limits = report?.periods.map((_, index) => rotation?.units.find(unit => unit.periodIndex === index)?.formation?.capacity ?? 11) ?? [];
  const errors = report ? analyseMatchReport(report, players.map(player => player.id), limits).errors : [];
  const ready = report && !errors.length && report.periods.every(period => period.starters.length > 0) && rotation?.hasReport;
  const canReview = ready && date && Date.parse(date) +
    report.periods.reduce((sum, period) => sum + period.minutes, 0) * 60_000 <= Date.now();
  const review = match.review;
  const boundaries = report && rotation ? rotation.units.filter(unit => unit.start > 0 && unit.start < (report.periods[unit.periodIndex]?.minutes ?? 0))
    .map(unit => ({
      key: unit.key, period: unit.periodIndex, minute: unit.start,
      starters: reportLineupAt(report, unit.periodIndex, unit.start),
    })) : [];
  const reviewed = review?.report ?? report;
  const draftErrors = draft ? analyseMatchReport({ ...draft, goals: [] }, players.map(player => player.id), limits).errors : [];
  const hasChanges = draft && JSON.stringify(draft) !== JSON.stringify(report);
  return <section className="min-w-0 space-y-3 rounded-lg border p-2 sm:p-4" aria-label="Resoconto da verificare">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h3 className="text-base font-semibold">Resoconto</h3>
      {review && <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
        {review.report ? "Avallato con differenze" : "Avallato dal dirigente"}
      </span>}
    </div>
    {match.result && <p className="text-sm">Risultato finale <strong>{match.result}</strong></p>}
    {!report && <p className="text-muted-foreground">In attesa che il mister salvi e confermi il resoconto.</p>}
    {report && !ready && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
      Il resoconto del mister richiede una verifica prima dell’avallo. {errors[0] ?? "Controlla gli schieramenti di tutti i tempi e le convocazioni."}
    </p>}
    {report && ready && !canReview && !review && <p className="text-muted-foreground">L’avallo è disponibile a partita conclusa.</p>}
    {report && rotation && !draft && <>
      <MatchReportLineups rotation={rotation} report={reviewed} coachReport={report} players={players} />
      {review && reviewed
        ? <MatchReportReviewSummary report={report} reviewed={reviewed} players={players} limit={limits} rotation={rotation} notes={review.notes} />
        : <MatchReportSummary report={report} rotation={rotation} players={players} limit={limits} manualChangesOnly />}
    </>}
    {report && rotation && draft && <fieldset className="min-w-0 space-y-3" disabled={confirmation.isPending}>
      <MatchReportEditor value={draft} onChange={setDraft} players={players} limit={limits} rotation={rotation}
        planned={null} coachReport={report} boundaries={boundaries} onPendingLineupChange={setPendingLineup} />
      <label className="block text-sm">Nota del dirigente
        <Textarea className="mt-1" value={notes} onChange={event => setNotes(event.target.value)} maxLength={2000} rows={2} />
      </label>
    </fieldset>}
    {confirmation.isSuccess && !review && <p role="status" className="text-primary">Avallo registrato.</p>}
    {report && canReview && !review && !confirmation.isSuccess && <div className="flex flex-wrap gap-2">
      {draft ? <>
        <Button type="button" disabled={confirmation.isPending || pendingLineup || !!draftErrors.length || (!hasChanges && !notes.trim())}
          onClick={() => confirmation.mutate({ managerReport: hasChanges ? draft : undefined, notes })}>
          {hasChanges ? "Salva e avalla con differenze" : "Salva nota e avalla"}
        </Button>
        <Button type="button" variant="outline" disabled={confirmation.isPending} onClick={() => {
          setDraft(null); setNotes(""); setPendingLineup(false); confirmation.reset();
        }}>Annulla correzioni</Button>
      </> : <>
        <Button type="button" disabled={confirmation.isPending} onClick={() => confirmation.mutate({})}>Conferma resoconto del mister</Button>
        <Button type="button" variant="outline" disabled={confirmation.isPending} onClick={() => {
          confirmation.reset();
          setDraft(report);
        }}>Apporta modifiche</Button>
      </>}
    </div>}
    {confirmation.error && <p role="alert" className="text-destructive">{confirmation.error.message}</p>}
  </section>;
}
export default function TeamManagerArea() {
  const {club,user,section} = useAuth();
  const [location,setLocation] = useLocation(); const search=useSearch(); const params=new URLSearchParams(search);
  const teamId=params.get("teamId") ?? ""; const view=location.split("/")[2] ?? "";
  const {data,error,isLoading,refetch}=useQuery<Overview>({queryKey:["/api/dirigenti/overview",club?.id,user?.id,section,teamId],queryFn:async()=>{const response=await fetch(withApi(`/api/dirigenti/overview${teamId?`?teamId=${encodeURIComponent(teamId)}`:""}`),{credentials:"include"});if(!response.ok)throw new Error("Impossibile caricare le squadre assegnate. Riprova o verifica l'assegnazione con la società.");return response.json();}});
  const team=data?.teams.find(item=>item.id===data.selectedTeamId);
  const href=(path:string)=>`/dirigenti/${path}${data?.selectedTeamId?`?teamId=${data.selectedTeamId}`:""}`;
  if(isLoading)return <p role="status" className="py-12 text-center text-muted-foreground">Caricamento area dirigenti...</p>;
  if(error)return <div role="alert" className="mx-auto max-w-2xl space-y-3 rounded-xl border bg-card p-5"><p>{error.message}</p><button type="button" className="rounded-lg border px-4 py-2" onClick={()=>void refetch()}>Riprova</button></div>;
  if (!data) return null;
  const events=(data.matches??[]).map(item=>({id:`match-${item.id}`,title:`Partita vs ${item.opponent}`,kind:"Partita",date:matchDate(item),location:item.location})).filter(item=>item.date && Number.isFinite(Date.parse(item.date))).sort((a,b)=>Date.parse(a.date!)-Date.parse(b.date!));
  return <div className={"mx-auto space-y-5 "+(["convocazioni","presenze"].includes(view)?"max-w-6xl":"max-w-2xl")}>
    <div><h1 className="text-2xl font-bold">Area Dirigenti</h1><p className="mt-1 text-sm text-muted-foreground">{club?.name} · Dirigente accompagnatore</p></div>
    {Boolean(data?.teams.length)&&<label className="block space-y-2 text-sm font-medium">Squadra<ScrollableSelect aria-label="Squadra assegnata" value={data?.selectedTeamId??""} onValueChange={event=>{const next=new URLSearchParams(search);next.set("teamId",event);setLocation(`${location}?${next}`);}} className="block min-h-11 w-full rounded-xl border bg-background px-3">{data?.teams.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</ScrollableSelect></label>}
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">{paths.map(({path,label,Icon})=><Link key={path} href={href(path)} aria-current={view===path?"page":undefined} className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-2 text-center text-xs shadow-sm sm:text-sm ${view===path?"border-primary bg-primary/5":""}`}><Icon className="h-6 w-6 text-primary"/>{label}</Link>)}</div>
    {(!view || view === "convocazioni") && data?.selectedTeamId && <CallupRulesCard teamId={data.selectedTeamId} />}
    {!data?.teams.length && view!=="calendario"?<div className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">Nessuna squadra assegnata in questa sezione. Chiedi alla società di associarti alla squadra dalla sezione Membri.</div>:!view?<div className="rounded-2xl border bg-card p-5"><h2 className="font-semibold">{team?.name}</h2><p className="mt-2 text-sm text-muted-foreground">Consulta gli appuntamenti, i ritrovi e le convocazioni predisposte dallo staff.</p><Link href={href("calendario")} className="mt-4 flex items-center gap-2 text-sm font-medium text-primary">Apri calendario<ChevronRight className="h-4 w-4"/></Link></div>:view==="presenze"?<AttendanceRegister lockTeam compactOverview key={data.selectedTeamId} initialTeamId={String(data.selectedTeamId)} />:view==="calendario"?<TeamManagerCalendar key={data.selectedTeamId} events={events} training={data.training} trainingCalendar={data.trainingCalendar}/>:view==="convocazioni"?<section className="space-y-3"><h2 className="text-lg font-semibold">Convocazioni</h2>{upcomingFirst(data.matches.filter(match=>match.callups.length>0 || !!match.report)).map((match,index)=><article key={match.id} className="compact-match-card border bg-card"><CompactMatchHeading preparationStatus={match.preparationStatus} nextMatch={index===0&&isUpcomingMatch(match)} date={matchDate(match)} home={match.homeAway==="home"?team?.name:match.opponent} away={match.homeAway==="home"?match.opponent:team?.name} result={match.result} metadata={<><span className="match-location-tag rounded border">{match.homeAway==="home"?"Casa":"Trasferta"}</span>{match.competition&&<span>{match.competition}</span>}{match.isPostponed&&<span className="text-amber-700">Rinviata</span>}{match.location&&<span>{match.location}</span>}</>} indicators={<span>{match.callups.length} convocati</span>}/><CompactMatchDetails label="Convocazione, ritrovo e minutaggi"><div className="space-y-3 border-t p-4 text-sm"><p>Campo: {match.location||"Da definire"}</p><p>Ritrovo: {when(match.convocationAt)}</p><p className="break-words">Luogo convocazione: {match.convocationPlace||"Da definire"}</p><ul className="divide-y rounded-xl border px-3">{match.callups.map(player=><li key={player.id} className="py-2">{player.lastName} {player.firstName}</li>)}</ul><ReportConfirmation key={JSON.stringify(match.report)} match={match} onConfirmed={() => void refetch()}/>{match.rotation&&<details className="rounded-lg border p-2"><DisclosureSummary className="font-medium">Minutaggio e lavagne del piano</DisclosureSummary><div className="mt-3"><MatchRotationComparison summary={match.rotation} showActual={false}/></div></details>}<TeamManagerComparison teamId={data.selectedTeamId!} matchId={match.id} date={matchDate(match)}/></div></CompactMatchDetails></article>)}{!data.matches.some(match=>match.callups.length>0 || !!match.report)&&<p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Nessuna convocazione disponibile.</p>}</section>:<section className="space-y-3"><h2 className="text-lg font-semibold">{team?.name}</h2><p className="text-sm text-muted-foreground">{data.rosterTeams && data.rosterTeams.length > 1 ? "Rosa congiunta · " + data.rosterTeams.map(item => item.name).join(" e ") : "Rosa principale"} · {data.players.length} giocatori</p><TeamManagerPlayers key={data.selectedTeamId} players={data.players}/></section>}
  </div>;
}
