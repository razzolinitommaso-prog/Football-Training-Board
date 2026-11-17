import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react/custom-fetch";
import { motorTestCatalog, motorTestCycles, summarizeMotorTests, trainingLocalDate, type MotorPlayerResult, type MotorTestId, type MotorTestResult, type MotorTestSession } from "@workspace/api-zod";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollableSelect } from "@/components/ui/scrollable-select";

type Collection = { teams: { id: number; name: string }[]; sessions: MotorTestSession[] };
type Context = { sessions: { id: number; title: string; time: string }[]; players: { id: number; name: string; family: string | null; coach: string | null }[] };
const phaseLabels = { iniziale: "Iniziale", centrale: "Centrale", finale: "Finale" } as const;
const familyLabels: Record<string, string> = { available: "Disponibile", unavailable: "Non disponibile", pending: "In attesa" };
const coachLabels: Record<string, string> = { present: "Presente", absent: "Assente", injured: "Infortunato", requested: "Richiesto" };
const emptyResult: MotorPlayerResult = { height: null, weight: null, tests: {} };
const emptyTest: MotorTestResult = { measurement: null, score: null, notes: "" };
const numberValue = (value: string) => value === "" ? null : Number(value);
const dateLabel = (value: string) => value.split("-").reverse().join("/");

export function MotorTestSessions({ canEdit, scopedTeam }: { canEdit: boolean; scopedTeam?: number }) {
  const { club, user, role } = useAuth();
  const cache = useQueryClient();
  const [draft, setDraft] = useState<MotorTestSession>();
  const [playerId, setPlayerId] = useState<number>();
  const [stage, setStage] = useState<"session" | "results">("session");
  const [newItem, setNewItem] = useState<MotorTestId>();
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
  });
  const save = useMutation({
    mutationFn: (data: MotorTestSession) => customFetch<MotorTestSession>("/api/motor-tests/" + data.id, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: saved => {
      setDraft(saved);
      setNotice("Sessione salvata.");
      void cache.invalidateQueries({ queryKey: ["/api/motor-tests"] });
      void cache.invalidateQueries({ queryKey: ["/api/training-sessions"] });
      void cache.invalidateQueries({ queryKey: ["/api/exercises"] });
      void cache.invalidateQueries({ queryKey: ["/api/players"] });
    },
    onError: error => setNotice(error instanceof Error ? error.message : "Sessione non salvata."),
  });
  const teams = (collection.data?.teams ?? []).filter(team => !scopedTeam || team.id === scopedTeam);
  const names = new Map(teams.map(team => [team.id, team.name]));
  const sessions = collection.data?.sessions.filter(session => names.has(session.teamId)) ?? [];
  const otherTests = motorTestCatalog.filter(item => !draft?.tests.some(test => test.id === item.id));
  const roster = context.data?.players ?? [];
  const selected = roster.find(player => player.id === playerId) ?? roster[0];
  const result = selected && draft ? draft.results[selected.id] ?? emptyResult : emptyResult;
  const scored = summarizeMotorTests(draft && selected && Object.values(result.tests).some(row => row?.score != null) ? [
    { date: draft.date, id: draft.id, cycle: draft.cycle, result },
    ...sessions.filter(session => session.id !== draft.id && session.teamId === draft.teamId && session.date < draft.date && !!session.results[selected.id])
      .map(session => ({ date: session.date, id: session.id, cycle: session.cycle, result: session.results[selected.id] })),
  ] : []);
  const readOnly = !canEdit || save.isPending;
  const linked = !!draft && Object.keys(draft.exerciseIds).length > 0;
  const canSave = !!draft?.teamId && !!draft.date && !!draft.tests.length && (!draft.tests.some(test => test.link) || !!draft.trainingSessionId);
  function open(session: MotorTestSession) {
    setDraft(session); setPlayerId(undefined); setStage("session"); setNewItem(undefined); setNotice("");
  }
  function updatePlayer(patch: Partial<MotorPlayerResult>) {
    if (draft && selected) setDraft({ ...draft, results: { ...draft.results, [selected.id]: { ...result, ...patch } } });
  }
  function updateTest(id: MotorTestId, patch: Partial<MotorTestResult>) {
    updatePlayer({ tests: { ...result.tests, [id]: { ...(result.tests[id] ?? emptyTest), ...patch } } });
  }
  const selectClass = "mt-1 block w-full";
  return <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">Sessioni di test motori</h2>
      {canEdit && !draft && <Button type="button" disabled={!teams.length} onClick={() => open({
        id: crypto.randomUUID(), revision: 0, teamId: teams[0]?.id ?? 0, date: trainingLocalDate(), cycle: "start", trainingSessionId: null,
        tests: motorTestCatalog.map(item => ({ id: item.id, minutes: item.minutes, link: false, phase: "centrale" })), results: {}, exerciseIds: {},
      })}>Aggiungi sessione test</Button>}
    </div>
    {collection.isError && <p role="alert" className="text-sm text-destructive">Sessioni non disponibili. <button type="button" className="underline" onClick={() => void collection.refetch()}>Riprova</button></p>}
    {collection.isPending && <p className="text-sm text-muted-foreground">Caricamento sessioni…</p>}
    {!draft && !collection.isPending && !collection.isError && (sessions.length ? <ul className="divide-y rounded-lg border px-3">
      {sessions.map(session => <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={session.id}>
        <div><strong>{names.get(session.teamId)} · {dateLabel(session.date)}</strong><p className="text-xs text-muted-foreground">{motorTestCycles[session.cycle]} · {session.tests.length} prove</p></div>
        <Button type="button" variant="outline" size="sm" onClick={() => open(session)}>{canEdit ? "Apri sessione" : "Consulta"}</Button>
      </li>)}
    </ul> : <p className="text-sm text-muted-foreground">Nessuna sessione di test motori nell’ambito selezionato.</p>)}
    {draft && <>
      <div className="flex flex-wrap gap-2 border-b pb-3">
        <Button type="button" size="sm" variant={stage === "session" ? "default" : "outline"} aria-pressed={stage === "session"} onClick={() => setStage("session")}>Sessione</Button>
        <Button type="button" size="sm" variant={stage === "results" ? "default" : "outline"} aria-pressed={stage === "results"} onClick={() => setStage("results")}>Presenze e valutazioni</Button>
      </div>
      {stage === "session" ? <>
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
            <option value="">Sessione autonoma</option>
            {draft.trainingSessionId && !context.data?.sessions.some(session => session.id === draft.trainingSessionId) && <option value={draft.trainingSessionId}>Seduta collegata</option>}
            {context.data?.sessions.map(session => <option key={session.id} value={session.id}>{session.time} · {session.title}</option>)}
          </ScrollableSelect></label>
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
        <ul className="divide-y rounded-lg border px-3">
          {draft.tests.map(test => {
            const definition = motorTestCatalog.find(item => item.id === test.id)!;
            const alreadyLinked = !!draft.exerciseIds[test.id];
            const hasResults = Object.values(draft.results).some(result => result.tests[test.id] != null || (test.id === "anthropometry" && (result.height != null || result.weight != null)));
            function update(patch: Partial<typeof test>) {
              setDraft({ ...draft!, tests: draft!.tests.map(row => row.id === test.id ? { ...row, ...patch } : row) });
            }
            return <li key={test.id} className="grid items-end gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_6rem_auto]">
              <div><strong className="text-sm">{definition.title}</strong><p className="text-xs text-muted-foreground">{definition.principle}</p>
                <details className="mt-1 text-xs"><summary className="cursor-pointer">Modalità di esecuzione</summary><p>{definition.instructions}</p></details>
              </div>
              <label className="text-xs">Minuti<Input className="mt-1" type="number" min={1} max={180} value={test.minutes || ""} disabled={readOnly || alreadyLinked} onChange={event => update({ minutes: Number(event.target.value) })} /></label>
              {!readOnly && !alreadyLinked && !hasResults && <Button type="button" size="sm" variant="ghost" onClick={() => setDraft({ ...draft, tests: draft.tests.filter(row => row.id !== test.id) })}>Rimuovi</Button>}
              <div className="flex flex-wrap items-end gap-3 sm:col-span-3">
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={test.link} disabled={readOnly || alreadyLinked || !draft.trainingSessionId} onChange={event => update({ link: event.target.checked })} />
                  {alreadyLinked ? "Già inserita nella seduta" : "Aggiungi come esercitazione alla seduta"}</label>
                {test.link && <label className="text-xs">Fase<ScrollableSelect aria-label={"Fase di " + definition.title} className={selectClass} value={test.phase} disabled={readOnly || alreadyLinked} onValueChange={value => update({ phase: value as typeof test.phase })}>
                  {Object.entries(phaseLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}
                </ScrollableSelect></label>}
              </div>
            </li>;
          })}
        </ul>
        <p className="rounded-lg bg-muted p-3 text-sm font-medium">{draft.tests.length} prove · {draft.tests.reduce((total, test) => total + test.minutes, 0)} minuti complessivi</p>
      </> : <>
        {context.isPending && <p className="text-sm text-muted-foreground">Caricamento rosa…</p>}
        {!context.isPending && !context.isError && !selected && <p className="text-sm text-muted-foreground">Nessun giocatore per questa annata.</p>}
        {selected && <>
          <label className="block text-sm">Giocatore<ScrollableSelect aria-label="Giocatore da valutare" value={selected.id} className={selectClass} onValueChange={value => setPlayerId(Number(value))}>
            {roster.map(player => <option key={player.id} value={player.id}>{player.name}{draft.results[player.id] ? " · rilevato" : ""}</option>)}
          </ScrollableSelect></label>
          <div className="grid gap-2 rounded-lg bg-muted p-3 text-sm sm:grid-cols-2">
            <p>Disponibilità famiglia <strong className="block">{selected.family ? familyLabels[selected.family] ?? selected.family : "—"}</strong></p>
            <p>Appello del mister <strong className="block">{selected.coach ? coachLabels[selected.coach] ?? selected.coach : "Da registrare"}</strong></p>
          </div>
          <ul className="grid gap-2">
            {draft.tests.map(test => {
              const definition = motorTestCatalog.find(item => item.id === test.id)!;
              const value = result.tests[test.id] ?? emptyTest;
              return <li key={test.id} className="grid gap-2 rounded-lg border p-3">
                <div className="grid gap-2 max-sm:grid-cols-[minmax(0,1fr)_6rem] sm:grid-cols-[minmax(0,1fr)_9rem_7rem]">
                  <div className="max-sm:col-span-2"><strong className="text-sm">{definition.title}</strong><p className="text-xs text-muted-foreground">{definition.principle}</p></div>
                  {test.id === "anthropometry" ? <>
                    <label className="text-xs">Statura · cm<Input className="mt-1" type="number" min={1} max={300} step="any" value={result.height ?? ""} disabled={readOnly} onChange={event => updatePlayer({ height: numberValue(event.target.value) })} /></label>
                    <label className="text-xs">Peso · kg<Input className="mt-1" type="number" min={1} max={400} step="any" value={result.weight ?? ""} disabled={readOnly} onChange={event => updatePlayer({ weight: numberValue(event.target.value) })} /></label>
                  </> : <>
                    <label className="text-xs">Misura · {definition.unit}<Input className="mt-1" type="number" min={0} step="any" value={value.measurement ?? ""} disabled={readOnly} onChange={event => updateTest(test.id, { measurement: numberValue(event.target.value) })} /></label>
                    <label className="text-xs">Voto 1–10<Input className="mt-1" type="number" min={1} max={10} value={value.score ?? ""} disabled={readOnly} onChange={event => updateTest(test.id, { score: numberValue(event.target.value) })} /></label>
                  </>}
                </div>
                <label className="text-xs">Note sulla prova<Textarea rows={2} maxLength={1000} className="mt-1" value={value.notes} disabled={readOnly} onChange={event => updateTest(test.id, { notes: event.target.value })} /></label>
              </li>;
            })}
          </ul>
          <p className="rounded-lg bg-muted p-3 text-sm">Indice attuale <strong>{scored.index == null ? "—" : scored.index + "%"}</strong>{scored.growth != null && <> · Crescita <strong>{scored.growth > 0 ? "+" : ""}{scored.growth} p.p.</strong> su {scored.comparable} prove</>}</p>
        </>}
      </>}
      {context.isError && <p role="alert" className="text-sm text-destructive">Rosa e sedute non disponibili. <button type="button" className="underline" onClick={() => void context.refetch()}>Riprova</button></p>}
      {notice && <p role={save.isError ? "alert" : "status"} className={save.isError ? "text-sm text-destructive" : "text-sm text-primary"}>{notice}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={save.isPending} onClick={() => { setDraft(undefined); setNotice(""); }}>Chiudi</Button>
        {canEdit && <Button type="button" disabled={!canSave || save.isPending} onClick={() => { setNotice(""); save.mutate(draft); }}>{save.isPending ? "Salvataggio…" : "Salva sessione"}</Button>}
      </div>
    </>}
  </section>;
}
