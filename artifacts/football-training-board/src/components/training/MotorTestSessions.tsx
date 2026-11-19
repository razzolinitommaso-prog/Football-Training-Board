import { MotorTestExport } from "./MotorTestExport";
import { MotorTestAssessmentEditor, MotorTestGuide, MotorTestReferences } from "./MotorTestAssessment";
import { MotorTestProgram } from "./MotorTestProgram";
import { Link, useSearch } from "wouter";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react/custom-fetch";
import { motorTestCatalog, motorTestCycles, motorTestCompletion, motorCompletionLabels, summarizeMotorTests, trainingLocalDate, type MotorPlayerResult, type MotorTestId, type MotorTestResult, type MotorTestSession } from "@workspace/api-zod";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollableSelect } from "@/components/ui/scrollable-select";

type Collection = { teams: { id: number; name: string }[]; sessions: MotorTestSession[]; canRecord?: boolean; recordTeamIds?: number[] };
type Context = { trainingSessionId: number | null; presentCount: number; sessions: { id: number; title: string; time: string }[]; players: { id: number; name: string; family: string | null; coach: string | null }[] };
const phaseLabels = { iniziale: "Iniziale", centrale: "Centrale", finale: "Finale" } as const;
const familyLabels: Record<string, string> = { available: "Disponibile", unavailable: "Non disponibile", pending: "In attesa" };
const coachLabels: Record<string, string> = { present: "Presente", absent: "Assente", injured: "Infortunato", requested: "Richiesto" };
const emptyResult: MotorPlayerResult = { height: null, weight: null, tests: {} };
const emptyTest: MotorTestResult = { measurement: null, score: null, notes: "" };
const numberValue = (value: string) => value === "" ? null : Number(value);
const dateLabel = (value: string) => value.split("-").reverse().join("/");

export function MotorTestSessions({ canEdit, scopedTeam }: { canEdit: boolean; scopedTeam?: number }) {
  const { club, user, role } = useAuth();
  const search=useSearch();const openedFromLink=useRef("");
  const cache = useQueryClient();
  const [draft, setDraft] = useState<MotorTestSession>();
  const [playerId, setPlayerId] = useState<number>();
  const [stage, setStage] = useState<"session" | "results" | "references">("session");
  const [activeTest,setActiveTest] = useState<MotorTestId>();
  const [newItem, setNewItem] = useState<MotorTestId>();
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const [notice, setNotice] = useState("");
  const collection = useQuery({
    queryKey: ["/api/motor-tests", club?.id, user?.id, role],
    queryFn: () => customFetch<Collection>("/api/motor-tests"),
    enabled: !!user,
  });
  const context = useQuery({
    queryKey: ["/api/motor-tests/context", club?.id, user?.id, role, draft?.teamId, draft?.date, draft?.trainingSessionId],
    queryFn: () => customFetch<Context>("/api/motor-tests/context?" + new URLSearchParams({
      teamId: String(draft!.teamId), date: draft!.date, trainingSessionId: draft!.trainingSessionId ? String(draft!.trainingSessionId) : "",
    })),
    enabled: !!draft?.teamId && !!draft.date,
    refetchOnWindowFocus: "always",
    refetchInterval: 15000,
  });
  const save = useMutation({
    mutationFn: (data: MotorTestSession) => customFetch<MotorTestSession>("/api/motor-tests/" + data.id, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: saved => {
      setDraft(saved);
      setNotice(!canEdit ? "Rilevazioni salvate nella sessione e nella scheda del giocatore." : saved.stationId ? "Sessione salvata. Programma e ordine aggiornati nella stazione Test motori della seduta." : "Sessione salvata. Il programma è pronto da inserire nella seduta del mister.");
      void cache.invalidateQueries({ queryKey: ["/api/motor-tests"] });
      void cache.invalidateQueries({ queryKey: ["/api/training-sessions"] });
      void cache.invalidateQueries({ queryKey: ["/api/exercises"] });
      void cache.invalidateQueries({ queryKey: ["/api/players"] });
    },
    onError: error => setNotice(error instanceof Error ? error.message : "Sessione non salvata."),
  });
  const teams = (collection.data?.teams ?? []).filter(team => !scopedTeam || team.id === scopedTeam);
  useEffect(()=>{const params=new URLSearchParams(search),id=params.get("motorSession");if(!id||openedFromLink.current===id||!collection.data)return;const session=collection.data.sessions.find(s=>s.id===id&&(!scopedTeam||s.teamId===scopedTeam));if(!session)return;openedFromLink.current=id;setDraft(session);setStage("results");const test=params.get("test");if(session.tests.some(t=>t.id===test))setActiveTest(test as MotorTestId)},[search,collection.data,scopedTeam]);
  const names = new Map(teams.map(team => [team.id, team.name]));
  const sessions = collection.data?.sessions.filter(session => names.has(session.teamId)) ?? [];
  const otherTests = motorTestCatalog.filter(item => !draft?.tests.some(test => test.id === item.id));
  const roster = context.data?.players ?? [];
  const effectiveSession = draft?.trainingSessionId ?? context.data?.trainingSessionId;
  const selectable = effectiveSession && !showAllPlayers ? roster.filter(player => player.coach === "present") : roster;
  const selected = selectable.find(player => player.id === playerId) ?? selectable[0];
  const result = selected && draft ? draft.results[selected.id] ?? emptyResult : emptyResult;
  const scored = summarizeMotorTests(draft && selected && Object.values(result.tests).some(row => row?.score != null) ? [
    { date: draft.date, id: draft.id, cycle: draft.cycle, result },
    ...sessions.filter(session => session.id !== draft.id && session.teamId === draft.teamId && session.date < draft.date && !!session.results[selected.id])
      .map(session => ({ date: session.date, id: session.id, cycle: session.cycle, result: session.results[selected.id] })),
  ] : []);
  const readOnly = !canEdit || save.isPending;
  const canRecord = canEdit || (!!draft&&collection.data?.recordTeamIds?.includes(draft.teamId)===true);
  const assessmentReadOnly = !canRecord || save.isPending || context.isError || (!!effectiveSession && selected?.coach !== "present");
  const legacyLinks = !!draft && Object.keys(draft.exerciseIds).length > 0;
  const linked = legacyLinks || !!draft?.stationId;
  const canSave = !!draft?.teamId && !!draft.date && !!draft.tests.length && (!draft.tests.some(test => test.link) || !!draft.trainingSessionId || !!draft.linkProgram) &&
    (!draft.linkProgram || !!draft.trainingSessionId || context.data?.sessions.length === 1);
  function open(session: MotorTestSession) {
    setDraft(session); setPlayerId(undefined); setStage("session"); setShowAllPlayers(false); setNewItem(undefined); setActiveTest(undefined); setNotice("");
  }
  function updatePlayer(patch: Partial<MotorPlayerResult>) {
    if (draft && selected && !assessmentReadOnly) setDraft({ ...draft, results: { ...draft.results, [selected.id]: { ...result, ...patch } } });
  }
  function updateTest(id: MotorTestId, patch: Partial<MotorTestResult>) {
    updatePlayer({ tests: { ...result.tests, [id]: { ...(result.tests[id] ?? emptyTest), ...patch } } });
  }
  const selectClass = "mt-1 block w-full";
  return <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">Sessioni di test motori</h2>
      {canEdit && !draft && <Button type="button" disabled={!teams.length} onClick={() => open({
        id: crypto.randomUUID(), revision: 0, teamId: teams[0]?.id ?? 0, date: trainingLocalDate(), cycle: "start", trainingSessionId: null, linkProgram: false, programPhase: "centrale",
        tests: motorTestCatalog.map(item => ({ id: item.id, minutes: item.minutes, link: false, phase: "centrale" })), results: {}, exerciseIds: {},
      })}>Aggiungi sessione test</Button>}
    </div>
    {collection.isError && <p role="alert" className="text-sm text-destructive">Sessioni non disponibili. <button type="button" className="underline" onClick={() => void collection.refetch()}>Riprova</button></p>}
    {collection.isPending && <p className="text-sm text-muted-foreground">Caricamento sessioni…</p>}
    {!draft && !collection.isPending && !collection.isError && (sessions.length ? <ul className="divide-y rounded-lg border px-3">
      {sessions.map(session => <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={session.id}>
        <div><strong>{names.get(session.teamId)} · {dateLabel(session.date)}</strong><p className="text-xs text-muted-foreground">{motorTestCycles[session.cycle]} · {session.tests.length} prove</p>
<p className={"mt-1 text-xs " + (session.stationId ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>
{session.stationId ? "Stazione inserita nella seduta" : Object.keys(session.exerciseIds).length ? "Prove singole inserite nella seduta" : "Programma da inserire nella seduta"}
</p></div>
        <Button type="button" variant="outline" size="sm" onClick={() => open(session)}>{canEdit ? "Apri sessione" : "Consulta"}</Button>
      </li>)}
    </ul> : <p className="text-sm text-muted-foreground">Nessuna sessione di test motori nell’ambito selezionato.</p>)}
    {draft && <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={stage === "session" ? "default" : "outline"} aria-pressed={stage === "session"} onClick={() => setStage("session")}>Sessione</Button>
        <Button type="button" size="sm" variant={stage === "results" ? "default" : "outline"} aria-pressed={stage === "results"} onClick={() => setStage("results")}>Presenze e valutazioni</Button>
        <Button type="button" size="sm" variant={stage === "references" ? "default" : "outline"} aria-pressed={stage === "references"} onClick={() => setStage("references")}>Riferimenti e risultati</Button>
        </div>
        {context.isSuccess && <MotorTestExport session={draft} roster={roster} team={names.get(draft.teamId) ?? "Annata"} />}
      </div>
      <div className="space-y-3 rounded-lg border p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-xs text-muted-foreground">Appello del mister</p>
          <p>{effectiveSession ? <>Seduta delle {context.data?.sessions.find(session => session.id === effectiveSession)?.time ?? ""} · <strong>{context.data?.presentCount ?? "…"} presenti</strong></> : "Scegli una seduta del giorno per collegare le presenze."}</p></div>
          {!!effectiveSession && <Link className="text-primary underline" href={"/training?sessionId=" + effectiveSession}>Apri seduta</Link>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div><p className="text-xs text-muted-foreground">Programma nella seduta</p>
          <strong className={draft.stationId ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}>
            {draft.stationId ? "Stazione Test motori inserita" : legacyLinks ? "Prove singole inserite" : "Programma ancora da inserire"}
          </strong></div>
          {canEdit && !draft.stationId && !legacyLinks && <Button type="button" size="sm"
            disabled={readOnly || !effectiveSession || !canSave || context.isFetching || context.isError}
            onClick={() => { setNotice(""); save.mutate({ ...draft, trainingSessionId: effectiveSession ?? null, linkProgram: true, programPhase: draft.programPhase ?? "centrale" }); }}>
            {save.isPending ? "Inserimento…" : "Inserisci programma nella seduta"}
          </Button>}
        </div>
        {!canEdit && !draft.stationId && !legacyLinks && <p className="text-xs text-muted-foreground">Il preparatore può inserire il programma dalla sessione test.</p>}
      </div>
      {stage === "references" ? <MotorTestReferences/> : stage === "session" ? <>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Annata<ScrollableSelect aria-label="Annata della sessione" value={String(draft.teamId)} disabled={readOnly || draft.revision > 0 || !!Object.keys(draft.results).length}
            onValueChange={value => { setDraft({ ...draft, teamId: Number(value), trainingSessionId: null }); setPlayerId(undefined); }} className={selectClass}>
            {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
          </ScrollableSelect></label>
          <label className="text-sm">Giorno<Input className="mt-1" type="date" value={draft.date} disabled={readOnly || draft.revision > 0} onChange={event => setDraft({ ...draft, date: event.target.value, trainingSessionId: null })} /></label>
          <label className="text-sm">Ciclo<ScrollableSelect aria-label="Ciclo dei test" value={draft.cycle} className={selectClass} disabled={readOnly || draft.revision > 0}
            onValueChange={value => setDraft({ ...draft, cycle: value as MotorTestSession["cycle"] })}>
            {Object.entries(motorTestCycles).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </ScrollableSelect></label>
          <label className="text-sm">Seduta del mister<ScrollableSelect aria-label="Seduta del mister" value={draft.trainingSessionId ?? ""} className={selectClass}
            disabled={readOnly || linked || context.isError} onValueChange={value => setDraft({ ...draft, trainingSessionId: Number(value) || null,
              tests: draft.tests.map(test => value ? test : { ...test, link: false }) })}>
            <option value="">{context.data?.trainingSessionId || draft.linkProgram ? "Seduta del giorno (automatica)" : "Sessione autonoma"}</option>
            {draft.trainingSessionId && !context.data?.sessions.some(session => session.id === draft.trainingSessionId) && <option value={draft.trainingSessionId}>Seduta collegata</option>}
            {context.data?.sessions.map(session => <option key={session.id} value={session.id}>{session.time} · {session.title}</option>)}
          </ScrollableSelect></label>
        </div>
        <div className="space-y-2 rounded-lg border bg-muted/35 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={!!draft.linkProgram} disabled={readOnly || linked}
              onChange={event => setDraft({ ...draft, linkProgram: event.target.checked })} />
            {draft.stationId ? "Stazione Test motori inserita nella seduta" : "Aggiungi il programma alla seduta del giorno"}
          </label>
          {legacyLinks && <p className="text-xs text-muted-foreground">Le prove già collegate singolarmente si gestiscono dalla pagina Sedute.</p>}
          {draft.linkProgram && !draft.stationId && <>
            <label className="block max-w-48 text-xs">Fase della stazione<ScrollableSelect aria-label="Fase della stazione" className={selectClass} value={draft.programPhase ?? "centrale"}
              disabled={readOnly} onValueChange={value => setDraft({ ...draft, programPhase: value as MotorTestSession["programPhase"] })}>
              {Object.entries(phaseLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
            </ScrollableSelect></label>
            {context.isSuccess && !draft.trainingSessionId && <p className="text-xs text-muted-foreground">{context.data.sessions.length === 1
              ? "Collegamento automatico alla seduta delle " + context.data.sessions[0].time + "."
              : context.data.sessions.length ? "Scegli una seduta tra quelle del giorno." : "Nessuna seduta per l’annata nel giorno selezionato."}</p>}
          </>}
        </div>
        <h3 className="text-sm font-semibold">Prove e durata</h3>
        {!readOnly && !!otherTests.length && <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-sm">Prova da aggiungere<ScrollableSelect aria-label="Prova da aggiungere" className={selectClass} value={newItem ?? otherTests[0].id} onValueChange={value => setNewItem(value as MotorTestId)}>
            {otherTests.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </ScrollableSelect></label>
          <Button type="button" variant="outline" onClick={() => {
            const item = otherTests.find(item => item.id === newItem) ?? otherTests[0];
            setDraft({ ...draft, tests: [...draft.tests, { id: item.id, minutes: item.minutes, phase: "centrale", link: false }] }); setNewItem(undefined);
          }}>Aggiungi prova</Button>
        </div>}
        <MotorTestProgram draft={draft} disabled={readOnly} onChange={setDraft}/>
      </> : <>
        {context.isPending && <p className="text-sm text-muted-foreground">Caricamento rosa…</p>}
        {!!effectiveSession && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showAllPlayers} onChange={event => { setShowAllPlayers(event.target.checked); setPlayerId(undefined); }} />Mostra anche assenti e appelli da completare</label>}
        {!context.isPending && !context.isError && !selected && <p className="text-sm text-muted-foreground">{effectiveSession ? "Nessun presente registrato. Completa l’appello della seduta per iniziare le valutazioni." : "Nessun giocatore per questa annata."}</p>}
        {selected && <>
          <label className="block text-sm">Giocatore<ScrollableSelect aria-label="Giocatore da valutare" value={selected.id} className={selectClass} onValueChange={value => setPlayerId(Number(value))}>
            {selectable.map(player => { const completion = motorTestCompletion(draft.tests, draft.results[player.id]); return <option key={player.id} value={player.id}>{player.name} · {motorCompletionLabels[completion.status]} ({completion.completed}/{completion.total})</option>; })}
          </ScrollableSelect></label>
          <div className="grid gap-2 rounded-lg bg-muted p-3 text-sm sm:grid-cols-2">
            <p>Disponibilità famiglia <strong className="block">{selected.family ? familyLabels[selected.family] ?? selected.family : "—"}</strong></p>
            <p>Appello del mister <strong className="block">{selected.coach ? coachLabels[selected.coach] ?? selected.coach : "Da registrare"}</strong></p>
          </div>
          {!!effectiveSession && selected.coach !== "present" && <p role="status" className="text-sm text-amber-700">Giocatore non presente nell’appello. Risultati consultabili. Il mister deve correggere la presenza prima di inserire valutazioni.</p>}
          <label className="block text-sm">Esercizio da rilevare<ScrollableSelect aria-label="Esercizio da rilevare" className={selectClass} value={activeTest&&draft.tests.some(t=>t.id===activeTest)?activeTest:draft.tests[0]?.id} onValueChange={v=>setActiveTest(v as MotorTestId)}>{draft.tests.map((test,index)=><option key={test.id} value={test.id}>{index+1}. {motorTestCatalog.find(item=>item.id===test.id)!.title}</option>)}</ScrollableSelect></label>
          <ul className="grid gap-2">
            {draft.tests.filter(test=>test.id===(activeTest&&draft.tests.some(t=>t.id===activeTest)?activeTest:draft.tests[0]?.id)).map(test => {
              const definition = motorTestCatalog.find(item => item.id === test.id)!;
              const value = result.tests[test.id] ?? emptyTest;
              return <li key={test.id} className="grid gap-3 rounded-lg border p-3">
                <MotorTestGuide id={test.id} minutes={test.minutes}/>
                <div className="grid gap-2 max-sm:grid-cols-[minmax(0,1fr)_6rem] sm:grid-cols-[minmax(0,1fr)_9rem_7rem]">
                  <div className="max-sm:col-span-2"><strong className="text-sm">{definition.title}</strong><p className="text-xs text-muted-foreground">{definition.principle}</p></div>
                  {test.id === "anthropometry" ? <>
                    <label className="text-xs">Statura · cm<Input className="mt-1" type="number" min={1} max={300} step="any" value={result.height ?? ""} disabled={assessmentReadOnly} onChange={event => updatePlayer({ height: numberValue(event.target.value) })} /></label>
                    <label className="text-xs">Peso · kg<Input className="mt-1" type="number" min={1} max={400} step="any" value={result.weight ?? ""} disabled={assessmentReadOnly} onChange={event => updatePlayer({ weight: numberValue(event.target.value) })} /></label>
                  </> : <>
                    {value.score!=null&&<p className="text-xs text-muted-foreground">Voto storico conservato: {value.score}/10 · non è un punteggio TGMD-3.</p>}
                  </>}
                </div>
                {test.id!=="anthropometry"&&<MotorTestAssessmentEditor key={selected.id+":"+test.id} id={test.id} value={value} disabled={assessmentReadOnly} onChange={patch=>updateTest(test.id,patch)}/>}
                <label className="text-xs">Note aggiuntive sulla prova<Textarea rows={2} maxLength={1000} className="mt-1" value={value.notes} disabled={assessmentReadOnly} onChange={event => updateTest(test.id, { notes: event.target.value })} /></label>
              </li>;
            })}
          </ul>
          {scored.index!=null&&<p className="rounded-lg bg-muted p-3 text-xs">Indice dei voti storici 1–10: {scored.index}%. Non è un percentile o un indice TGMD-3.</p>}
        </>}
      </>}
      {context.isError && <p role="alert" className="text-sm text-destructive">Rosa e sedute non disponibili. <button type="button" className="underline" onClick={() => void context.refetch()}>Riprova</button></p>}
      {notice && <p role={save.isError ? "alert" : "status"} className={save.isError ? "text-sm text-destructive" : "text-sm text-primary"}>{notice}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={save.isPending} onClick={() => { setDraft(undefined); setNotice(""); }}>Chiudi</Button>
        {canRecord && <Button type="button" disabled={!canSave || save.isPending || context.isFetching || context.isError} onClick={() => { setNotice(""); save.mutate({ ...draft, trainingSessionId: canEdit ? effectiveSession ?? null : draft.trainingSessionId }); }}>{save.isPending ? "Salvataggio…" : canEdit ? "Salva sessione" : "Salva rilevazioni"}</Button>}
      </div>
    </>}
  </section>;
}
