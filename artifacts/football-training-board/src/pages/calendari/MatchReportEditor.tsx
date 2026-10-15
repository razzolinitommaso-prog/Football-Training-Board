import { analyseMatchReport, type MatchReport } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

export type ReportPlayer = { id: number; name: string };
const selectClass = "h-9 w-full min-w-0 rounded-md border bg-background px-2 text-xs";
const eventId = () => crypto.randomUUID();

function PlayerSelect({ value, players, onChange, label, empty = "Giocatore" }: {
  value: number; players: ReportPlayer[]; onChange: (value: number) => void; label: string; empty?: string;
}) {
  return <label className="min-w-0 space-y-1"><span className="text-[11px]">{label}</span>
    <select aria-label={label} className={selectClass} value={value || ""} onChange={e => onChange(Number(e.target.value))}>
      <option value="">{empty}</option>
      {players.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}
    </select>
  </label>;
}

export function MatchReportSummary({ report, players, limit }: { report: MatchReport; players: ReportPlayer[]; limit: number | number[] }) {
  const name = (id: number) => players.find(player => player.id === id)?.name ?? `Giocatore #${id}`;
  const analysis = analyseMatchReport(report, players.map(player => player.id), limit);
  return <div className="space-y-2 text-xs">
    <p className="font-semibold">Marcatori e minutaggio effettivo</p>
    {report.goals.length === 0 ? <p>Nessun marcatore registrato.</p> : report.goals.map(goal =>
      <p key={goal.id}>{name(goal.playerId)} · {goal.period + 1}° tempo, {goal.minute}′</p>)}
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">{players.map(player =>
      <p key={player.id}>{player.name}: {analysis.errors.length ? "da verificare" : `${analysis.minutes[player.id] ?? 0}′`} · {report.goals.filter(goal => goal.playerId === player.id).length} gol</p>)}</div>
    {report.substitutions.map(change => <p key={change.id} className="break-words">
      {change.period + 1}° tempo, {change.minute}′ · Esce {name(change.outPlayerId)}
      {change.inPlayerId ? ` → entra ${name(change.inPlayerId)}` : " · senza ingresso"}
      {change.notes && ` — ${change.notes}`}
    </p>)}
    {analysis.intervals.map(change => <p key={change.period} className="break-words">
      Intervallo prima del {change.period + 1}° tempo · Escono: {change.outPlayerIds.map(name).join(", ") || "—"}
      {` · Entrano: ${change.inPlayerIds.map(name).join(", ") || "—"}`}{change.notes && ` — ${change.notes}`}
    </p>)}
  </div>;
}

function Timing({ period, minute, periods, onChange: change }: {
    period: number; minute: number; periods: MatchReport["periods"]; onChange: (timing: { period: number; minute: number }) => void;
  }) {
    return <div className="grid grid-cols-2 gap-2">
      <label className="text-[11px]">Tempo<select aria-label="Tempo evento" className={selectClass} value={period}
        onChange={e => change({ period: Number(e.target.value), minute })}>
        {periods.map((_, index) => <option key={index} value={index}>{index + 1}° tempo</option>)}
      </select></label>
      <label className="text-[11px]">Minuto nel tempo<Input aria-label="Minuto nel tempo" type="number" min={0} step="0.5"
        max={periods[period]?.minutes} value={minute} onChange={e => change({ period, minute: Number(e.target.value) })} /></label>
    </div>;
  }

export function MatchReportEditor({ value, onChange, players, limit }: {
  value: MatchReport; onChange: (report: MatchReport) => void; players: ReportPlayer[]; limit: number | number[];
}) {
  const analysis = analyseMatchReport(value, players.map(player => player.id), limit);
  const updatePeriod = (index: number, patch: Partial<MatchReport["periods"][number]>) =>
    onChange({ ...value, periods: value.periods.map((period, i) => i === index ? { ...period, ...patch } : period) });
  return <section className="space-y-3 rounded-md border p-2">
    <h4 className="text-sm font-semibold">Marcatori, minuti e sostituzioni</h4>
    <p className="text-[11px] text-muted-foreground">Seleziona i titolari effettivi di ogni tempo. Durata effettiva e minuti sono riferiti al singolo tempo, recupero incluso. I convocati mai entrati hanno 0 minuti.</p>
    {!players.length && <p className="text-xs text-amber-700">Salva prima le convocazioni per compilare il resoconto.</p>}
    {value.periods.map((period, index) => <details key={index} className="rounded border p-2">
      <summary className="cursor-pointer text-xs font-semibold">{index + 1}° tempo · {period.minutes}′ · {period.starters.length} titolari</summary>
      <label className="mt-2 block text-xs">Durata effettiva (recupero incluso)
        <Input type="number" min={1} max={180} step="0.5" value={period.minutes} onChange={e => updatePeriod(index, { minutes: Number(e.target.value) })} />
      </label>
      {index > 0 && <label className="mt-2 block text-[11px]">Motivazione / note cambi all’intervallo
        <Textarea rows={2} maxLength={2000} value={period.intervalNotes ?? ""} onChange={e => updatePeriod(index, { intervalNotes: e.target.value })} />
      </label>}
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">{players.map(player => <label key={player.id} className="flex min-w-0 items-center gap-2 text-xs">
        <Checkbox checked={period.starters.includes(player.id)} onCheckedChange={checked => updatePeriod(index, {
          starters: checked ? [...period.starters, player.id] : period.starters.filter(id => id !== player.id),
        })} />{player.name}
      </label>)}</div>
    </details>)}
    <div className="space-y-2"><h5 className="text-xs font-semibold">Marcatori · {value.goals.length} gol</h5>
      {value.goals.map(goal => <div key={goal.id} className="space-y-2 rounded border p-2">
        <PlayerSelect label="Marcatore" value={goal.playerId} players={players} onChange={playerId => onChange({ ...value, goals: value.goals.map(g => g.id === goal.id ? { ...g, playerId } : g) })} />
        <Timing {...goal} periods={value.periods} onChange={timing => onChange({ ...value, goals: value.goals.map(g => g.id === goal.id ? { ...g, ...timing } : g) })} />
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...value, goals: value.goals.filter(g => g.id !== goal.id) })}>Rimuovi gol</Button>
      </div>)}
      <Button type="button" variant="outline" size="sm" disabled={!players.length} onClick={() => onChange({ ...value, goals: [...value.goals, { id: eventId(), playerId: 0, period: 0, minute: 0 }] })}>Aggiungi gol</Button>
    </div>
    <div className="space-y-2"><h5 className="text-xs font-semibold">Sostituzioni / uscite</h5>
      {value.substitutions.map(change => {
        const update = (patch: Partial<typeof change>) => onChange({ ...value, substitutions: value.substitutions.map(item => item.id === change.id ? { ...item, ...patch } : item) });
        return <div key={change.id} className="space-y-2 rounded border p-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <PlayerSelect label="Giocatore uscito" value={change.outPlayerId} players={players} onChange={outPlayerId => update({ outPlayerId })} />
            <PlayerSelect label="Giocatore entrato" empty="Nessun ingresso (es. espulsione)" value={change.inPlayerId ?? 0} players={players} onChange={id => update({ inPlayerId: id || null })} />
          </div>
          <Timing {...change} periods={value.periods} onChange={update} />
          <label className="block text-[11px]">Motivazione / note sostituzione
            <Textarea rows={2} maxLength={2000} value={change.notes} onChange={e => update({ notes: e.target.value })} placeholder="Es. scelta tattica, infortunio, affaticamento…" />
          </label>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...value, substitutions: value.substitutions.filter(item => item.id !== change.id) })}>Rimuovi cambio</Button>
        </div>;
      })}
      <Button type="button" variant="outline" size="sm" disabled={!players.length} onClick={() => onChange({ ...value, substitutions: [...value.substitutions, { id: eventId(), outPlayerId: 0, inPlayerId: null, period: 0, minute: 0, notes: "" }] })}>Aggiungi sostituzione / uscita</Button>
    </div>
    {analysis.errors.length > 0 && <p role="alert" className="text-xs text-destructive">{analysis.errors.join(" ")}</p>}
    <MatchReportSummary report={value} players={players} limit={limit} />
  </section>;
}
