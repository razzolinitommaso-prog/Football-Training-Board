import { useState } from "react";
import { isPlannedFractionChange, synchronizeReportFractions, type ReportFractionBoundary } from "@/lib/match-period-rotation";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import { matchMinutesLabel } from "@/components/calendar/MatchRotationComparison";
import { analyseMatchReport, type MatchRotationSummary, type MatchReport } from "@workspace/api-zod";
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
    <ScrollableSelect aria-label={label} className={selectClass} value={value || ""} onValueChange={e => onChange(Number(e))}>
      <option value="">{empty}</option>
      {players.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}
    </ScrollableSelect>
  </label>;
}

export function MatchReportSummary({ report, players, limit, rotation, showChanges = true }: { report: MatchReport; players: ReportPlayer[]; limit: number | number[]; rotation?: MatchRotationSummary; showChanges?: boolean }) {
  const name = (id: number) => players.find(player => player.id === id)?.name ?? `Giocatore #${id}`;
  const analysis = analyseMatchReport(report, players.map(player => player.id), limit);
  const validMinutes = !analysis.errors.length && report.periods.every(period => period.starters.length > 0);
  const changes = [
    ...report.substitutions.map(change => ({ period: change.period, minute: change.minute, key: change.id, change, interval: null })),
    ...analysis.intervals.map(interval => ({ period: interval.period, minute: 0, key: "interval-" + interval.period, interval, change: null })),
  ].sort((a, b) => a.period - b.period || a.minute - b.minute || Number(!!b.interval) - Number(!!a.interval));
  return <div className="space-y-2 text-xs">
    <p className="font-semibold">Marcatori e minutaggio effettivo</p>
    {report.goals.length === 0 ? <p>Nessun marcatore registrato.</p> : report.goals.map(goal =>
      <p key={goal.id}>{name(goal.playerId)} · {goal.period + 1}° tempo, {goal.minute}′</p>)}
    {rotation ? <table className="w-full table-fixed text-left text-sm">
      <thead className="bg-muted/50 text-xs text-muted-foreground">
        <tr><th scope="col" className="w-1/2 break-words p-2">Giocatore</th><th scope="col" className="break-words p-2 text-right">Pianificati</th><th scope="col" className="break-words p-2 text-right">Effettivi</th></tr>
      </thead>
      <tbody>{rotation.rows.map(row => <tr key={row.playerId} className="border-b">
        <th scope="row" className="break-words p-2 font-medium">{row.name}</th>
        <td className="p-2 text-right text-muted-foreground">{matchMinutesLabel(row.plannedMinutes, true)}</td>
        <td className="p-2 text-right font-semibold">{validMinutes ? matchMinutesLabel(analysis.minutes[row.playerId] ?? 0, true) : "—"}</td>
      </tr>)}</tbody>
    </table> : <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">{players.map(player =>
      <p key={player.id}>{player.name}: {!validMinutes ? "da verificare" : `${analysis.minutes[player.id] ?? 0}′`} · {report.goals.filter(goal => goal.playerId === player.id).length} gol</p>)}</div>}
    {showChanges && changes.length > 0 && <div className="space-y-1">
      <h5 className="text-sm font-semibold">Cambi registrati</h5>
      {changes.map(({ period, minute, key, change, interval }) => {
        const unit = rotation?.units.find(item => item.periodIndex === period && item.start > 0 && item.start === minute);
        const title = interval ? "Inizio " + (period + 1) + "° tempo · 0:00"
          : unit ? "Inizio " + unit.label + " · " + minuteLabel(minute) + " del " + (period + 1) + "° tempo"
            : (period + 1) + "° tempo · " + minuteLabel(minute);
        return <p key={key} className="break-words"><strong>{title}</strong>
          {interval && ` · Escono: ${interval.outPlayerIds.map(name).join(", ") || "—"} · Entrano: ${interval.inPlayerIds.map(name).join(", ") || "—"}`}
          {change && (" · Esce " + name(change.outPlayerId) + (change.inPlayerId ? " → entra " + name(change.inPlayerId) : " · senza ingresso"))}
          {(interval?.notes || change?.notes) && " · " + (interval?.notes || change?.notes)}
        </p>;
      })}
    </div>}
  </div>;
}

function Timing({ period, minute, periods, onChange: change }: {
    period: number; minute: number; periods: MatchReport["periods"]; onChange: (timing: { period: number; minute: number }) => void;
  }) {
    return <div className="grid grid-cols-2 gap-2">
      <label className="text-[11px]">Tempo<ScrollableSelect aria-label="Tempo evento" className={selectClass} value={period}
        onValueChange={e => change({ period: Number(e), minute })}>
        {periods.map((_, index) => <option key={index} value={index}>{index + 1}° tempo</option>)}
      </ScrollableSelect></label>
      <label className="text-[11px]">Minuto nel tempo<Input aria-label="Minuto nel tempo" type="number" min={0} step="any"
        max={periods[period]?.minutes} value={minute} onChange={e => change({ period, minute: Number(e.target.value) })} /></label>
    </div>;
  }

export function MatchReportLineups({ rotation }: { rotation: MatchRotationSummary }) {
  if (!rotation.units.length || !rotation.rows.length) return null;
  return <section className="space-y-2" aria-label="Schieramenti del mister">
    <h4 className="text-base font-semibold">Schieramenti del mister</h4>
    <div role="region" aria-label="Titolari e panchina per frazione" tabIndex={0} className="max-w-full overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-muted"><tr>
          <th scope="col" className="sticky left-0 z-10 min-w-36 bg-muted px-3 py-2">Giocatore</th>
          {rotation.units.map(unit => <th scope="col" key={unit.key} className="whitespace-nowrap px-3 py-2">
            {unit.label}<span className="ml-1 font-normal text-muted-foreground">{matchMinutesLabel(unit.minutes, true)}</span>
          </th>)}
        </tr></thead>
        <tbody>{rotation.rows.map(row => <tr key={row.playerId} className="border-t">
          <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 font-medium">{row.name}</th>
          {row.cells.map(cell => <td key={cell.key} className="px-3 py-2">
            {cell.status === "T" ? <span className="rounded bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">Titolare</span>
              : <span className="text-xs text-muted-foreground">{cell.status === "P" ? "Panchina" : "—"}</span>}
          </td>)}
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}

type Substitution = MatchReport["substitutions"][number];
const minuteLabel = (minute: number) => {
  const seconds = Math.round(minute * 60);
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
};

export function MatchReportEditor({ value, onChange, players, limit, rotation, planned, boundaries }: {
  value: MatchReport;
  onChange: (report: MatchReport) => void;
  players: ReportPlayer[];
  limit: number | number[];
  rotation?: MatchRotationSummary;
  planned: MatchReport | null;
  boundaries: ReportFractionBoundary[];
}) {
  const [expandedChange, setExpandedChange] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState("");
  const analysis = analyseMatchReport(value, players.map(player => player.id), limit);
  const name = (id: number) => players.find(player => player.id === id)?.name ?? (id ? "Giocatore #" + id : "Da scegliere");
  const names = (ids: number[]) => ids.map(name).join(", ") || "—";
  function apply(report: MatchReport) {
    try {
      onChange(synchronizeReportFractions(report, boundaries));
      setUpdateError("");
    } catch (error) {
      setUpdateError((error as Error).message);
    }
  }
  const updatePeriod = (index: number, patch: Partial<MatchReport["periods"][number]>) =>
    apply({ ...value, periods: value.periods.map((period, i) => i === index ? { ...period, ...patch } : period) });
  function overrideBoundary(boundary: ReportFractionBoundary, remove = false) {
    apply({ ...value,
      fractionOverrides: [...new Set([...(value.fractionOverrides ?? []), boundary.key])],
      substitutions: remove ? value.substitutions.filter(change => !isPlannedFractionChange(change, boundary)) : value.substitutions,
    });
  }
  function restoreBoundary(boundary: ReportFractionBoundary) {
    const source = value.automaticFractions ? [] : planned?.substitutions.filter(change => isPlannedFractionChange(change, boundary)) ?? [];
    apply({ ...value,
      fractionOverrides: value.fractionOverrides?.filter(key => key !== boundary.key),
      substitutions: [...value.substitutions.filter(change => !isPlannedFractionChange(change, boundary)), ...source],
    });
  }
  function addChange(period: number, minute: number, boundary?: ReportFractionBoundary) {
    const id = boundary ? "planned-" + boundary.key + "-" + eventId() : eventId();
    setExpandedChange(id);
    apply({ ...value, substitutions: [...value.substitutions, { id, outPlayerId: 0, inPlayerId: null, period, minute, notes: "" }] });
  }

  function followsPlan(boundary: ReportFractionBoundary) {
    if (value.fractionOverrides?.includes(boundary.key)) return false;
    if (value.automaticFractions) return true;
    const transitions = (report: MatchReport | null) => report?.substitutions.filter(change => isPlannedFractionChange(change, boundary))
      .map(change => [change.period, change.minute, change.outPlayerId, change.inPlayerId]).sort();
    return planned !== null && JSON.stringify(transitions(value)) === JSON.stringify(transitions(planned));
  }

  function renderChange(change: Substitution) {
    const update = (patch: Partial<Substitution>) => apply({ ...value, substitutions: value.substitutions.map(item => item.id === change.id ? { ...item, ...patch } : item) });
    return <details key={change.id} open={expandedChange === change.id || undefined} className="rounded-lg border bg-background p-3">
      <DisclosureSummary className="text-sm">
        <span><strong>{change.period + 1}° tempo · {minuteLabel(change.minute)}</strong><span className="block text-muted-foreground">
          Esce {name(change.outPlayerId)} · {change.inPlayerId ? "Entra " + name(change.inPlayerId) : "Senza ingresso"}
        </span></span>
      </DisclosureSummary>
      <div className="mt-3 space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <PlayerSelect label="Giocatore uscito" value={change.outPlayerId} players={players} onChange={outPlayerId => update({ outPlayerId })} />
          <PlayerSelect label="Giocatore entrato" empty="Nessun ingresso (es. espulsione)" value={change.inPlayerId ?? 0} players={players} onChange={id => update({ inPlayerId: id || null })} />
        </div>
        <Timing {...change} periods={value.periods} onChange={update} />
        <label className="block text-xs">Note sul cambio
          <Textarea rows={2} maxLength={2000} value={change.notes} onChange={e => update({ notes: e.target.value })} />
        </label>
        <Button type="button" variant="ghost" size="sm" onClick={() => apply({ ...value, substitutions: value.substitutions.filter(item => item.id !== change.id) })}>Rimuovi cambio</Button>
      </div>
    </details>;
  }

  return <section className="space-y-4">
    {rotation && <MatchReportLineups rotation={rotation} />}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="font-semibold">Cambi e minuti effettivi</h4>
      <Button type="button" variant="outline" size="sm" disabled={!players.length} onClick={() => addChange(0, 0)}>Registra cambio</Button>
    </div>
    {value.periods.map((period, index) => {
      const original = planned?.periods[index];
      const same = original?.starters.length === period.starters.length && period.starters.every(id => original.starters.includes(id));
      const interval = analysis.intervals.find(event => event.period === index);
      const fractionRows = boundaries.filter(boundary => boundary.period === index);
      const rows = [
        ...fractionRows.map(boundary => ({ minute: boundary.minute, boundary, change: null })),
        ...value.substitutions.filter(change => change.period === index &&
          !fractionRows.some(boundary => followsPlan(boundary) && isPlannedFractionChange(change, boundary)))
          .map(change => ({ minute: change.minute, change, boundary: null })),
      ].sort((a, b) => a.minute - b.minute);
      return <div key={index} className="space-y-2">
        <details className="rounded-lg border bg-muted/30 p-3">
          <DisclosureSummary className="text-sm">
            <span><strong>Inizio {index + 1}° tempo · 0:00</strong>
              <span className="block text-xs text-muted-foreground">{matchMinutesLabel(period.minutes, true)} · {period.starters.length} titolari
                {original?.starters.length ? same ? " · Come da piano" : " · Formazione modificata" : " · Formazione da verificare"}
              </span>
              {interval && <span className="block break-words text-xs text-muted-foreground">Escono {names(interval.outPlayerIds)} · Entrano {names(interval.inPlayerIds)}</span>}
            </span>
          </DisclosureSummary>
          <div className="mt-3 space-y-2">
            <label className="block text-xs">Durata effettiva (recupero incluso)
              <Input type="number" min={1} max={180} step="0.5" value={period.minutes} onChange={e => updatePeriod(index, { minutes: Number(e.target.value) })} />
            </label>
            {index > 0 && <label className="block text-xs">Note sui cambi all’intervallo
              <Textarea rows={2} maxLength={2000} value={period.intervalNotes ?? ""} onChange={e => updatePeriod(index, { intervalNotes: e.target.value })} />
            </label>}
            <p className="text-xs font-medium">Titolari effettivi</p>
            <div className="grid gap-2 sm:grid-cols-2">{players.map(player => <label key={player.id} className="flex min-w-0 items-center gap-2 text-sm">
              <Checkbox checked={period.starters.includes(player.id)} onCheckedChange={checked => updatePeriod(index, {
                starters: checked ? [...period.starters, player.id] : period.starters.filter(id => id !== player.id),
              })} />{player.name}
            </label>)}</div>
            {original?.starters.length && !same ? <Button type="button" variant="outline" size="sm"
              onClick={() => updatePeriod(index, { starters: original.starters })}>Ripristina titolari del mister</Button> : null}
          </div>
        </details>
        {rows.map(({ boundary, change }) => {
          if (change) return renderChange(change);
          if (!boundary) return null;
          const overridden = !followsPlan(boundary);
          const changes = value.substitutions.filter(item => isPlannedFractionChange(item, boundary));
          const label = rotation?.units.find(unit => unit.key === boundary.key)?.label ?? "frazione";
          return <div key={boundary.key} className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><strong>Inizio {label} · {minuteLabel(boundary.minute)} del {index + 1}° tempo</strong>
                <p className="text-xs text-muted-foreground">{overridden ? "Rotazione modificata" : "Come da piano"}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {overridden
                  ? <><Button type="button" size="sm" variant="outline" onClick={() => addChange(index, boundary.minute, boundary)}>Registra cambio</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => restoreBoundary(boundary)}>Ripristina piano</Button></>
                  : <><Button type="button" size="sm" variant="outline" onClick={() => overrideBoundary(boundary)}>Modifica</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => overrideBoundary(boundary, true)}>Annulla rotazione</Button></>}
              </div>
            </div>
            {!overridden && <p className="mt-2 break-words text-sm">{changes.length
              ? `Escono ${names(changes.map(item => item.outPlayerId))} · Entrano ${names(changes.flatMap(item => item.inPlayerId === null ? [] : [item.inPlayerId]))}`
              : "Nessun cambio registrato a questo minuto."}</p>}
          </div>;
        })}
      </div>;
    })}
    <div className="space-y-2"><h5 className="text-sm font-semibold">Marcatori · {value.goals.length} gol</h5>
      {value.goals.map(goal => <div key={goal.id} className="space-y-2 rounded border p-2">
        <PlayerSelect label="Marcatore" value={goal.playerId} players={players} onChange={playerId => apply({ ...value, goals: value.goals.map(g => g.id === goal.id ? { ...g, playerId } : g) })} />
        <Timing {...goal} periods={value.periods} onChange={timing => apply({ ...value, goals: value.goals.map(g => g.id === goal.id ? { ...g, ...timing } : g) })} />
        <Button type="button" variant="ghost" size="sm" onClick={() => apply({ ...value, goals: value.goals.filter(g => g.id !== goal.id) })}>Rimuovi gol</Button>
      </div>)}
      <Button type="button" variant="outline" size="sm" disabled={!players.length} onClick={() => apply({ ...value, goals: [...value.goals, { id: eventId(), playerId: 0, period: 0, minute: 0 }] })}>Aggiungi gol</Button>
    </div>
    {(updateError || analysis.errors.length > 0) && <p role="alert" className="text-sm text-destructive">{updateError || analysis.errors.join(" ")}</p>}
    <MatchReportSummary report={value} players={players} limit={limit} rotation={rotation} showChanges={false} />
  </section>;
}
