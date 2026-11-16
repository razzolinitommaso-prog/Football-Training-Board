import { useState } from "react";
import { isPlannedFractionChange, reportLineupAt, setReportUnitLineup, synchronizeReportFractions, type ReportFractionBoundary } from "@/lib/match-period-rotation";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import { matchMinutesLabel } from "@/components/calendar/MatchRotationComparison";
import { analyseMatchReport, type MatchRotationSummary, type RotationSummaryUnit, type MatchReport } from "@workspace/api-zod";
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

export function MatchReportSummary({ report, players, limit, rotation, showChanges = true, manualChangesOnly = false }: { report: MatchReport; players: ReportPlayer[]; limit: number | number[]; rotation?: MatchRotationSummary; showChanges?: boolean; manualChangesOnly?: boolean }) {
  const name = (id: number) => players.find(player => player.id === id)?.name ?? `Giocatore #${id}`;
  const analysis = analyseMatchReport(report, players.map(player => player.id), limit);
  const validMinutes = !analysis.errors.length && report.periods.every(period => period.starters.length > 0);
  const changes = [
    ...report.substitutions.filter(change => !manualChangesOnly || !change.id.startsWith("planned-") ||
      report.fractionOverrides?.some(key => change.id.startsWith("planned-" + key + "-"))).map(change => ({ period: change.period, minute: change.minute, key: change.id, change, interval: null })),
    ...(!manualChangesOnly ? analysis.intervals : []).map(interval => ({ period: interval.period, minute: 0, key: "interval-" + interval.period, interval, change: null })),
  ].sort((a, b) => a.period - b.period || a.minute - b.minute || Number(!!b.interval) - Number(!!a.interval));
  return <div className="space-y-2 text-xs">
    <p className="font-semibold">Marcatori e minutaggio effettivo</p>
    {report.goals.length === 0 ? <p>Nessun marcatore registrato.</p> : report.goals.map(goal =>
      <p key={goal.id}>{name(goal.playerId)} · {goal.period + 1}° tempo, {goal.minute}′</p>)}
    {rotation ? <table className="w-full table-fixed text-left text-sm">
      <thead className="bg-muted/50 text-xs text-muted-foreground">
        <tr><th scope="col" className="w-1/2 break-words p-2">Giocatore</th><th scope="col" className="break-words p-2 text-right">Pianificati</th><th scope="col" className="break-words p-2 text-right">Effettivi</th></tr>
      </thead>
      <tbody>{rotation.rows.map(row => {
        const actual = validMinutes ? analysis.minutes[row.playerId] ?? 0 : null;
        const difference = actual === null ? 0 : Math.round((actual - row.plannedMinutes) * 60) / 60;
        return <tr key={row.playerId} className="border-b align-top">
          <th scope="row" className="break-words p-2 font-medium">{row.name}</th>
          <td className="p-2 text-right text-muted-foreground">{matchMinutesLabel(row.plannedMinutes, true)}</td>
          <td className="p-2 text-right font-semibold">
            {actual === null ? "—" : matchMinutesLabel(actual, true)}
            {difference !== 0 && <span className="block text-xs font-normal text-muted-foreground">
              {difference > 0 ? "+" : "−"}{matchMinutesLabel(Math.abs(difference), true)} sul piano
            </span>}
          </td>
        </tr>;
      })}</tbody>
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

type ReportUnit = Pick<RotationSummaryUnit, "key" | "periodIndex" | "start" | "minutes" | "label">;

function ReportLineupLists({ players, rotation, unit, actual, onToggle, coachReport }: {
  players: ReportPlayer[];
  rotation?: MatchRotationSummary;
  unit: ReportUnit;
  actual: number[];
  onToggle?: (id: number, checked: boolean) => void;
  coachReport?: MatchReport;
}) {
  const coachLineup = coachReport ? new Set(reportLineupAt(coachReport, unit.periodIndex, unit.start)) : null;
  const status = coachLineup ? new Map(players.map(({ id }) => [id, coachLineup.has(id) ? "T" : "P"]))
    : new Map(rotation?.rows.map(row => [row.playerId, row.cells.find(cell => cell.key === unit.key)?.status ?? "—"]));
  const rank = (id: number) => status.get(id) === "T" ? 0 : status.get(id) === "P" ? 1 : 2;
  const ordered = [...players].sort((first, second) => rank(first.id) - rank(second.id));
  const plannedCount = ordered.filter(player => status.get(player.id) === "T").length;
  const reserveCount = ordered.filter(player => status.get(player.id) === "P").length;
  const differences = ordered.filter(player => status.has(player.id) && status.get(player.id) !== "—"
    && (status.get(player.id) === "T") !== actual.includes(player.id)).length;
  return <div className="rounded-lg border text-sm">
    <div className="grid grid-cols-2 gap-px border-b bg-border text-xs font-semibold sm:text-sm">
      <span className="bg-muted p-2 sm:p-3">{coachReport ? "Resoconto del mister" : "Formazione del mister"}</span>
      <span className="bg-muted p-2 sm:p-3">{coachReport ? "Verifica del dirigente" : "Formazione effettiva"}</span>
    </div>
    <ul className="divide-y">{ordered.map(player => {
      const planned = status.get(player.id);
      const checked = actual.includes(player.id);
      const comparison = planned === "T" || planned === "P" ? checked === (planned === "T") : null;
      return <li key={player.id} className="grid grid-cols-2 divide-x">
        <div className="min-w-0 p-2 sm:flex sm:items-center sm:justify-between sm:gap-2 sm:p-3">
          <span className="block break-words font-medium">{player.name}</span>
          <span className="block text-xs text-muted-foreground">{planned === "T" ? "Titolare" : planned === "P" ? "Riserva" : "Non assegnato"}</span>
        </div>
        <div className="min-w-0 space-y-1 p-2 sm:flex sm:items-center sm:justify-between sm:gap-2 sm:space-y-0 sm:p-3">
          <label className="flex min-w-0 items-center gap-2">
            <Checkbox checked={checked} disabled={!onToggle} aria-label={"Titolare effettivo: " + player.name}
              onCheckedChange={next => onToggle?.(player.id, next === true)} />
            <span className="break-words">{player.name}</span>
          </label>
          {comparison !== null && <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${comparison
            ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
            : "bg-red-500/10 text-red-800 dark:text-red-300"}`}>
            {comparison ? "✓ Coincide" : "× Diverso"}
          </span>}
        </div>
      </li>;
    })}</ul>
    <div className="grid grid-cols-2 divide-x border-t text-xs text-muted-foreground">
      <span className="p-2 sm:p-3">{plannedCount} titolari · {reserveCount} riserve</span>
      <span className="p-2 sm:p-3">{actual.length} titolari · {ordered.length - actual.length} riserve
        {differences > 0 && <strong className="ml-2 text-destructive">{differences} {differences === 1 ? "differenza" : "differenze"}</strong>}
      </span>
    </div>
  </div>;
}

function reportUnits(report: MatchReport, rotation?: MatchRotationSummary): ReportUnit[] {
  return rotation?.units.length ? rotation.units.filter(unit => Boolean(report.periods[unit.periodIndex]))
    : report.periods.map((period, index) => ({
      key: "t" + (index + 1), periodIndex: index, start: 0, minutes: period.minutes, label: (index + 1) + "° tempo",
    }));
}

function ReportUnitPicker({ units, active, onSelect, disabled }: {
  units: ReportUnit[]; active: ReportUnit; onSelect: (key: string) => void; disabled?: boolean;
}) {
  return <nav aria-label="Tempi e frazioni" className="flex flex-wrap gap-2">
    {units.map(unit => <Button type="button" key={unit.key} size="sm" aria-pressed={unit.key === active.key}
      disabled={disabled && unit.key !== active.key} variant={unit.key === active.key ? "secondary" : "outline"}
      onClick={() => onSelect(unit.key)}>{unit.label} · {matchMinutesLabel(unit.minutes, true)}</Button>)}
  </nav>;
}

export function MatchReportLineups({ rotation, report, players, coachReport }: {
  rotation: MatchRotationSummary;
  report?: MatchReport;
  coachReport?: MatchReport;
  players: ReportPlayer[];
}) {
  const [selected, setSelected] = useState("");
  if (!report) return null;
  const units = reportUnits(report, rotation);
  const unit = units.find(item => item.key === selected) ?? units[0];
  if (!unit) return null;
  const played = unit.start < report.periods[unit.periodIndex].minutes;
  return <section className="space-y-2" aria-label="Verifica formazione">
    <h4 className="text-base font-semibold">Verifica formazione</h4>
    <ReportUnitPicker units={units} active={unit} onSelect={setSelected} />
    {played ? <ReportLineupLists players={players} rotation={rotation} unit={unit} coachReport={coachReport} actual={reportLineupAt(report, unit.periodIndex, unit.start)} />
      : <p className="text-sm text-amber-700 dark:text-amber-300">Questa frazione è fuori dalla durata registrata.</p>}
  </section>;
}

type Substitution = MatchReport["substitutions"][number];
const minuteLabel = (minute: number) => {
  const seconds = Math.round(minute * 60);
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
};

export function MatchReportReviewSummary({ report, reviewed, players, limit, rotation, notes }: {
  report: MatchReport; reviewed: MatchReport; players: ReportPlayer[];
  limit: number | number[]; rotation?: MatchRotationSummary; notes?: string;
}) {
  const ids = players.map(player => player.id);
  const coach = analyseMatchReport(report, ids, limit);
  const manager = analyseMatchReport({ ...reviewed, goals: [] }, ids, limit);
  const valid = !coach.errors.length && !manager.errors.length && reviewed.periods.every(period => period.starters.length > 0);
  const names = new Map(players.map(player => [player.id, player.name]));
  const name = (id: number) => names.get(id) ?? "Giocatore #" + id;
  const changeKey = ({ period, minute, outPlayerId, inPlayerId, notes }: Substitution) =>
    JSON.stringify([period, minute, outPlayerId, inPlayerId, notes]);
  const differences = (from: MatchReport, to: MatchReport) => {
    const otherKeys = new Set(to.substitutions.map(changeKey));
    return from.substitutions.filter(change => !otherKeys.has(changeKey(change)))
      .sort((a, b) => a.period - b.period || a.minute - b.minute);
  };
  const coachChanges = differences(report, reviewed);
  const managerChanges = differences(reviewed, report);
  const units = reportUnits(report, rotation);
  const renderChange = (change: Substitution) => {
    const unit = units.filter(item => item.periodIndex === change.period && item.start <= change.minute).at(-1);
    const label = unit ? unit.label + " · " + minuteLabel(change.minute - unit.start) : (change.period + 1) + "° tempo · " + minuteLabel(change.minute);
    return <li key={change.id} className="break-words"><strong>{label}</strong> · Esce {name(change.outPlayerId)}
      {change.inPlayerId ? " · Entra " + name(change.inPlayerId) : " · Senza ingresso"}{change.notes && " · " + change.notes}</li>;
  };
  return <section className="min-w-0 space-y-2 rounded-lg border p-2 sm:p-3" aria-label="Riepilogo finale">
    <h4 className="font-semibold">Riepilogo finale</h4>
    <p className="text-xs text-muted-foreground">Minuti effettivi complessivi</p>
    <table className="w-full table-fixed text-left text-xs sm:text-sm">
      <thead className="bg-muted/50"><tr>
        <th scope="col" className="w-[36%] break-words p-1.5">Giocatore</th>
        <th scope="col" className="break-words p-1.5 text-right">Mister</th>
        <th scope="col" className="break-words p-1.5 text-right">Dirigente</th>
        <th scope="col" className="break-words p-1.5 text-right">Scarto</th>
      </tr></thead>
      <tbody>{players.map(player => {
        const first = coach.minutes[player.id] ?? 0;
        const second = manager.minutes[player.id] ?? 0;
        const delta = Math.round((second - first) * 60) / 60;
        return <tr className="border-b" key={player.id}>
          <th scope="row" className="break-words p-1.5 font-medium">{player.name}</th>
          <td className="p-1.5 text-right">{matchMinutesLabel(first, true)}</td>
          <td className="p-1.5 text-right">{valid ? matchMinutesLabel(second, true) : "—"}</td>
          <td className="p-1.5 text-right font-medium">{!valid ? "—" : delta === 0 ? "0′" :
            (delta > 0 ? "+" : "−") + matchMinutesLabel(Math.abs(delta), true)}</td>
        </tr>;
      })}</tbody>
    </table>
    {report.periods.map((period, index) => {
      const actual = reviewed.periods[index];
      if (!actual || (actual.minutes === period.minutes && actual.intervalNotes === period.intervalNotes)) return null;
      return <p key={index} className="break-words text-xs"><strong>{index + 1}° tempo</strong> · Mister {matchMinutesLabel(period.minutes, true)}
        {period.intervalNotes && " (" + period.intervalNotes + ")"} · Dirigente {matchMinutesLabel(actual.minutes, true)}
        {actual.intervalNotes && " (" + actual.intervalNotes + ")"}</p>;
    })}
    {units.map(unit => {
      const first = unit.start < report.periods[unit.periodIndex].minutes ? reportLineupAt(report, unit.periodIndex, unit.start) : [];
      const second = unit.start < reviewed.periods[unit.periodIndex].minutes ? reportLineupAt(reviewed, unit.periodIndex, unit.start) : [];
      const coachOnly = first.filter(id => !second.includes(id));
      const managerOnly = second.filter(id => !first.includes(id));
      return (coachOnly.length > 0 || managerOnly.length > 0) && <p key={unit.key} className="break-words text-xs">
        <strong>{unit.label} · Titolari diversi</strong> · Mister {coachOnly.map(name).join(", ") || "—"} · Dirigente {managerOnly.map(name).join(", ") || "—"}
      </p>;
    })}
    {(coachChanges.length > 0 || managerChanges.length > 0) && <div className="space-y-1 text-xs">
      <h5 className="font-semibold">Sostituzioni con differenze</h5>
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0"><p className="font-medium">Mister</p>{coachChanges.length ? <ul className="space-y-1">{coachChanges.map(renderChange)}</ul> : "—"}</div>
        <div className="min-w-0"><p className="font-medium">Dirigente</p>{managerChanges.length ? <ul className="space-y-1">{managerChanges.map(renderChange)}</ul> : "—"}</div>
      </div>
    </div>}
    {notes && <p className="whitespace-pre-wrap break-words text-xs"><strong>Nota dirigente</strong> · {notes}</p>}
  </section>;
}
export function MatchReportEditor({ value, onChange, players, limit, rotation, planned, boundaries, onPendingLineupChange, coachReport }: {
  value: MatchReport;
  onChange: (report: MatchReport) => void;
  players: ReportPlayer[];
  limit: number | number[];
  rotation?: MatchRotationSummary;
  planned: MatchReport | null;
  boundaries: ReportFractionBoundary[];
  onPendingLineupChange: (pending: boolean) => void;
  coachReport?: MatchReport;
}) {
  const [selectedUnit, setSelectedUnit] = useState("");
  const [draftStarters, setDraftStarters] = useState<number[] | null>(null);
  const [expandedChange, setExpandedChange] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState("");
  const analysis = analyseMatchReport(coachReport ? { ...value, goals: [] } : value, players.map(player => player.id), limit);
  const name = (id: number) => players.find(player => player.id === id)?.name ?? (id ? "Giocatore #" + id : "Da scegliere");
  const units = reportUnits(value, rotation);
  const unit = units.find(item => item.key === selectedUnit) ?? units[0];
  const period = unit && value.periods[unit.periodIndex];
  const boundary = unit && boundaries.find(item => item.key === unit.key);
  const actual = unit ? reportLineupAt(value, unit.periodIndex, unit.start) : [];
  const canEditLineup = !!unit && !!period && (unit.start === 0 || !!boundary) && unit.start < period.minutes;
  const periodLimit = unit && (typeof limit === "number" ? limit : limit[unit.periodIndex] ?? 11);
  const shortDuration = period && units.some(item => item.periodIndex === unit.periodIndex && item.start >= period.minutes);
  function updateDraft(next: number[] | null) {
    setDraftStarters(next);
    onPendingLineupChange(next !== null);
    setUpdateError("");
  }
  function applyLineup(starters: number[]) {
    if (!unit || !periodLimit || !starters.length || starters.length > periodLimit) return;
    try {
      onChange(setReportUnitLineup(value, unit, starters, boundaries));
      updateDraft(null);
    } catch (error) {
      setUpdateError((error as Error).message);
    }
  }
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
  function addChange(period: number, minute: number) {
    const id = eventId();
    setExpandedChange(id);
    apply({ ...value, substitutions: [...value.substitutions, { id, outPlayerId: 0, inPlayerId: null, period, minute, notes: "" }] });
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

  const substitutions = value.substitutions
    .filter(change => {
      const source = boundaries.find(item => isPlannedFractionChange(change, item));
      if (!source || value.fractionOverrides?.includes(source.key)) return true;
      if (value.automaticFractions) return false;
      return !planned?.substitutions.some(item => item.id === change.id && item.period === change.period &&
        item.minute === change.minute && item.outPlayerId === change.outPlayerId && item.inPlayerId === change.inPlayerId);
    })
    .sort((first, second) => first.period - second.period || first.minute - second.minute);

  return <section className="space-y-4">
    {unit && period && <>
      <h4 className="font-semibold">Verifica formazione</h4>
      <ReportUnitPicker units={units} active={unit} onSelect={setSelectedUnit} disabled={draftStarters !== null} />
      <p className="text-sm text-muted-foreground">{coachReport ? "Spunta a destra chi è partito in campo secondo il dirigente." : "Spunta a destra chi è partito in campo. Le rotazioni del mister sono già precompilate."}</p>
      {unit.start < period.minutes ? <ReportLineupLists players={players} rotation={rotation} unit={unit}
        coachReport={coachReport} actual={draftStarters ?? actual} onToggle={canEditLineup ? (id, checked) => {
          const next = new Set(draftStarters ?? actual);
          if (checked) next.add(id); else next.delete(id);
          const starters = [...next];
          if (starters.length === actual.length && starters.every(playerId => actual.includes(playerId))) {
            updateDraft(null);
            return;
          }
          updateDraft(starters);
          if (starters.length > 0 && starters.length === actual.length) applyLineup(starters);
        } : undefined} /> : null}
      {draftStarters && <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={!periodLimit || !draftStarters.length || draftStarters.length > periodLimit} onClick={() => applyLineup(draftStarters)}>Applica formazione</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => updateDraft(null)}>Annulla modifiche alla formazione</Button>
        {periodLimit && draftStarters.length > periodLimit && <p role="status" className="text-sm text-destructive">Massimo {periodLimit} titolari.</p>}
      </div>}
      {shortDuration && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
        La durata del {unit.periodIndex + 1}° tempo lascia fuori almeno una frazione. Verifica la durata dell’intero tempo.
      </p>}
      <details open={shortDuration || undefined} className="rounded-lg border p-3">
        <DisclosureSummary className="text-sm">Durata e note del {unit.periodIndex + 1}° tempo</DisclosureSummary>
        <div className="mt-2 space-y-2">
          <label className="block text-xs">Durata effettiva dell’intero tempo, recupero incluso
            <Input type="number" min={1} max={180} step="0.5" value={period.minutes}
              onChange={event => updatePeriod(unit.periodIndex, { minutes: Number(event.target.value) })} />
          </label>
          {planned?.periods[unit.periodIndex] && planned.periods[unit.periodIndex].minutes !== period.minutes &&
            <Button type="button" size="sm" variant="outline" onClick={() =>
              updatePeriod(unit.periodIndex, { minutes: planned.periods[unit.periodIndex].minutes })}>
              Usa durata pianificata · {matchMinutesLabel(planned.periods[unit.periodIndex].minutes, true)}
            </Button>}
          {unit.periodIndex > 0 && <label className="block text-xs">Note all’intervallo
            <Textarea rows={2} maxLength={2000} value={period.intervalNotes ?? ""}
              onChange={event => updatePeriod(unit.periodIndex, { intervalNotes: event.target.value })} />
          </label>}
        </div>
      </details>
    </>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="font-semibold">Sostituzioni durante il gioco</h4>
      <Button type="button" variant="outline" size="sm" disabled={!players.length || !unit}
        onClick={() => unit && addChange(unit.periodIndex, unit.start)}>Registra sostituzione</Button>
    </div>
    {substitutions.map(renderChange)}
    {!coachReport && <div className="space-y-2"><h5 className="text-sm font-semibold">Marcatori · {value.goals.length} gol</h5>
      {value.goals.map(goal => <div key={goal.id} className="space-y-2 rounded border p-2">
        <PlayerSelect label="Marcatore" value={goal.playerId} players={players} onChange={playerId => apply({ ...value, goals: value.goals.map(g => g.id === goal.id ? { ...g, playerId } : g) })} />
        <Timing {...goal} periods={value.periods} onChange={timing => apply({ ...value, goals: value.goals.map(g => g.id === goal.id ? { ...g, ...timing } : g) })} />
        <Button type="button" variant="ghost" size="sm" onClick={() => apply({ ...value, goals: value.goals.filter(g => g.id !== goal.id) })}>Rimuovi gol</Button>
      </div>)}
      <Button type="button" variant="outline" size="sm" disabled={!players.length} onClick={() => apply({ ...value, goals: [...value.goals, { id: eventId(), playerId: 0, period: 0, minute: 0 }] })}>Aggiungi gol</Button>
    </div>}
    {(updateError || analysis.errors.length > 0) && <p role="alert" className="text-sm text-destructive">{updateError || analysis.errors.join(" ")}</p>}
    {coachReport
      ? <MatchReportReviewSummary report={coachReport} reviewed={value} players={players} limit={limit} rotation={rotation} />
      : <MatchReportSummary report={value} players={players} limit={limit} rotation={rotation} showChanges={false} />}
  </section>;
}
