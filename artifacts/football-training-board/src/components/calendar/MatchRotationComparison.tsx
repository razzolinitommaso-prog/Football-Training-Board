import { useState, type ReactNode } from "react";
import type {
  MatchRotationSummary,
  RotationSummaryUnit,
} from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import "./match-comparison.css";
import { Checkbox } from "@/components/ui/checkbox";
type RosterPlayer = {
  id: number;
  name: string;
  called: boolean;
  disabled?: boolean;
  note?: string;
};
const number = (n: number) =>
  n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
export function matchMinutesLabel(minutes: number, compact = false) {
  const seconds = Math.round(minutes * 60);
  const whole = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return compact ? whole + "′" + (remainder ? String(remainder).padStart(2, "0") + "″" : "")
    : whole + " min" + (remainder ? " " + remainder + " s" : "");
}

function SummaryPitch({
  summary,
  unit,
  enlarged = false,
}: {
  summary: MatchRotationSummary;
  unit: RotationSummaryUnit;
  enlarged?: boolean;
}) {
  const starters = summary.rows.filter(
    (row) => row.cells.find((c) => c.key === unit.key)?.status === "T",
  );
  return (
    <>
      <div
        className={
          "relative mx-auto aspect-[3/4] w-full overflow-hidden rounded-lg border-4 border-emerald-300 bg-green-700 " +
          (enlarged ? "max-w-md" : "max-w-56")
        }
        aria-label={"Schieramento " + unit.label}
      >
        <div className="absolute inset-[7%] border border-white/70" />
        <div className="absolute left-[7%] right-[7%] top-1/2 border-t border-white/70" />
        <div className="absolute left-[30%] top-[35%] h-[30%] w-[40%] rounded-full border border-white/70" />
        <div className="absolute left-[25%] right-[25%] top-[7%] h-[15%] border border-white/70" />
        <div className="absolute left-[25%] right-[25%] bottom-[7%] h-[15%] border border-white/70" />
        {starters.map((row, index) => {
          const point = row.cells.find((c) => c.key === unit.key)?.position;
          const left = point
              ? point.y
              : starters.length === 1
                ? 50
                : 20 + (index % 3) * 30,
            top = point
              ? 100 - point.x
              : index === 0
                ? 85
                : 25 + Math.floor((index - 1) / 3) * 25;
          return (
            <span
              key={row.playerId}
              title={row.name}
              className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-blue-500 text-[11px] font-semibold text-white"
              style={{ left: left + "%", top: top + "%" }}
            >
              {row.jerseyNumber ??
                row.name
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")}
                <span className="absolute top-full mt-0.5 max-w-24 truncate rounded bg-green-950/90 px-1 text-[10px] leading-tight">
                {row.name}
              </span>
            </span>
          );
        })}
      </div>
      {starters.some(
        (row) => !row.cells.find((cell) => cell.key === unit.key)?.position,
      ) && (
        <p className="text-[10px] text-muted-foreground">
          Disposizione indicativa dove le posizioni non sono state salvate.
        </p>
      )}
    </>
  );
}

export function MatchRotationComparison({
  summary,
  roster,
  onCallup,
  onStatus,
  onBenchAll,
  renderPitch,
  timing,
  controls,
  footer,
  automatic = false,
  title = "Confronto tempi e minutaggio",
}: {
  summary: MatchRotationSummary;
  roster?: RosterPlayer[];
  onCallup?: (id: number, called: boolean) => void;
  onStatus?: (id: number, key: string, reserve: boolean) => void;
  onBenchAll?: () => void;
  renderPitch?: (unit: RotationSummaryUnit) => ReactNode;
  timing?: ReactNode;
  controls?: ReactNode;
  footer?: ReactNode;
  title?: string;
  automatic?: boolean;
}) {
  const [enlarged, setEnlarged] = useState<RotationSummaryUnit | null>(null);
  const [search, setSearch] = useState("");
  const [all, setAll] = useState(false);
  const [unitPage, setUnitPage] = useState(0);
  const pageSize = 8;
  const lastPage = Math.max(0, Math.ceil(summary.units.length / pageSize) - 1);
  const page = Math.min(lastPage, unitPage);
  const units = summary.units.slice(page * pageSize, (page + 1) * pageSize);
  const periodHeadings: { key: string; count: number; label: string }[] = [];
  for (const unit of units) {
    const previous = periodHeadings.at(-1);
    if (previous?.key === unit.periodKey) previous.count++;
    else periodHeadings.push({ key: unit.periodKey, count: 1, label: unit.periodKey.slice(1) + "° tempo" });
  }

  const called = roster?.filter((p) => p.called) ?? [];
  const rosterVisible = roster?.filter(
    (p) =>
      (all || p.called || !called.length) &&
      p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const values = summary.rows.map((row) => row.plannedMinutes);
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 0;
  return (
    <section className="match-comparison space-y-3" aria-label={title}>
      <Dialog
        open={!!enlarged}
        onOpenChange={(open) => {
          if (!open) setEnlarged(null);
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Schieramento · {enlarged?.label}</DialogTitle>
            <DialogDescription>
              Anteprima in sola lettura dei giocatori consultabili dal tuo
              profilo.
            </DialogDescription>
          </DialogHeader>
          {enlarged && (
            <SummaryPitch summary={summary} unit={enlarged} enlarged />
          )}
        </DialogContent>
      </Dialog>
      <div className={renderPitch ? "match-comparison-layout match-comparison-layout--editor" : "match-comparison-layout"}>
        <div className="min-w-0 space-y-3">
          {roster && (
            <section
              className="rounded-xl border bg-background p-3"
              aria-label="Convocati"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">
                  Convocati · {called.length}
                </h4>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  aria-expanded={all}
                  onClick={() => setAll(!all)}
                >
                  {all ? "Mostra convocati" : "Modifica convocati"}
                </Button>
              </div>
              {(all || !called.length) && (
                <Input
                  className="mb-2 h-8 text-xs"
                  aria-label="Cerca convocato"
                  placeholder="Cerca giocatore…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              )}
              <div
                className={
                  all || !called.length
                    ? "grid gap-x-3 sm:grid-cols-2"
                    : "flex flex-wrap gap-1.5"
                }
              >
                {rosterVisible?.map((p) => (
                  <label
                    key={p.id}
                    className={
                      (all || !called.length
                        ? "min-h-9 py-1"
                        : "rounded-md border px-2 py-1.5") +
                      " flex items-center gap-2 text-xs"
                    }
                  >
                    <Checkbox
                      checked={p.called}
                      disabled={p.disabled || !onCallup}
                      aria-label={"Convoca " + p.name}
                      onCheckedChange={(v) => {
                        if (!called.length) setAll(true);
                        onCallup?.(p.id, v === true);
                      }}
                    />
                    <span className="min-w-0 break-words">
                      {p.name}
                      {(all || !called.length) && p.note && (
                        <span className="block text-[10px] text-muted-foreground">
                          {p.note}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}
          <section className="min-w-0 rounded-xl border bg-background p-2 sm:p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">{title}</h4>
              {onStatus && automatic && (
                <span className="rounded bg-emerald-50 px-2 py-1 text-[10px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                  Alternanza automatica · Scuola Calcio
                </span>
              )}
            </div>
            {timing}
            {onBenchAll && (
              <Button type="button" variant="outline" size="sm" className="mb-2" disabled={!summary.rows.length} onClick={onBenchAll}>
                Tutti in panchina
              </Button>
            )}
            <p className="mb-2 text-[11px] text-muted-foreground">
              {onStatus && automatic
                ? "Scegli i titolari: le celle non fissate si riequilibrano. Le formazioni manuali nelle alternative restano protette."
                : onStatus
                  ? "Tocca una cella per cambiare titolare e panchina."
                  : "Consultazione in sola lettura."}
            </p>
            {!!values.length && (
              <div
                className={`mb-3 flex-wrap gap-x-4 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs ${values.length === 1 ? "hidden md:flex" : "flex"}`}
                aria-label="Riepilogo minutaggio previsto"
              >
                <span>
                  Minuti previsti:{" "}
                  <strong>
                    {minimum === maximum ? matchMinutesLabel(minimum, true) : `${matchMinutesLabel(minimum, true)}–${matchMinutesLabel(maximum, true)}`}
                  </strong>
                </span>
                {values.length > 1 && (
                  <span>
                    Differenza: <strong>{number(maximum - minimum)}′</strong>
                  </span>
                )}
                <span>
                  {values.length}{" "}
                  {values.length === 1 ? "giocatore" : "giocatori"} nel
                  riepilogo
                </span>
              </div>
            )}
            {lastPage > 0 && <nav className="mb-2 flex flex-wrap items-center gap-2 text-xs" aria-label="Pagine delle frazioni">
              <Button type="button" size="sm" variant="outline" disabled={page === 0} onClick={() => setUnitPage(page - 1)}>Precedenti</Button>
              <span>Frazioni {page * pageSize + 1}–{page * pageSize + units.length} di {summary.units.length}</span>
              <Button type="button" size="sm" variant="outline" disabled={page === lastPage} onClick={() => setUnitPage(page + 1)}>Successive</Button>
            </nav>}
            <table className="match-minute-grid w-full border-collapse text-xs">
              <thead>
                <tr className="bg-muted/40 text-left">
                  <th rowSpan={2} className="match-player-column p-2">Giocatore</th>
                  {periodHeadings.map(group => <th key={group.key} colSpan={group.count} scope="colgroup" className="border-l p-1 text-center text-[10px]">{group.label}</th>)}
                  <th rowSpan={2} className="match-planned-column p-1 text-center">Previsti</th>
                  <th rowSpan={2} className="match-eq-column p-1 text-center">Tempi eq.</th>
                  {summary.hasReport && <th rowSpan={2} className="match-actual-column p-1 text-center">Eff.′</th>}
                </tr>
                <tr className="border-t bg-muted/40">
                  {units.map(unit => <th key={unit.key} className="match-unit-column p-1 text-center" scope="col">
                    {unit.label.replace(" tempo", "")}
                    <span className="block text-[10px] font-normal text-muted-foreground">{matchMinutesLabel(unit.minutes, true)}</span>
                  </th>)}
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row) => (
                  <tr key={row.playerId} className="border-b last:border-0">
                    <th scope="row" className="break-words p-1 text-left font-medium sm:p-2">
                      {row.name}
                      <span className="match-mobile-only mt-1 text-xs font-normal text-muted-foreground">
                        <strong className="font-semibold text-foreground">{matchMinutesLabel(row.plannedMinutes, true)} previsti</strong>
                        {" · "}{number(row.plannedPeriods)} tempi eq.
                        {summary.hasReport && (
                          <span>
                            {" "}
                            · Eff.{" "}
                            {row.actualMinutes === null
                              ? "non registrati"
                              : matchMinutesLabel(row.actualMinutes, true)}
                          </span>
                        )}
                      </span>
                    </th>
                    {row.cells.slice(page * pageSize, (page + 1) * pageSize).map((cell, index) => (
                      <td key={cell.key} className="p-0.5 text-center">
                        <span className="match-mobile-only mb-1 text-xs font-medium" aria-hidden="true">
                          {units[index]?.label.replace(" tempo", "")}
                          <span className="block font-normal text-muted-foreground">{units[index] && matchMinutesLabel(units[index].minutes, true)}</span>
                        </span>
                        <button
                          type="button"
                          disabled={!onStatus}
                          aria-label={
                            row.name +
                            ", " +
                            summary.units.find((u) => u.key === cell.key)
                              ?.label +
                            ": " +
                            (cell.status === "T"
                              ? "titolare"
                              : cell.status === "P"
                                ? "panchina"
                                : "non assegnato")
                          }
                          title={
                            cell.fixed ? "Scelta fissata dal mister" : undefined
                          }
                          aria-pressed={cell.status === "T"}
                          onClick={() =>
                            onStatus?.(
                              row.playerId,
                              cell.key,
                              cell.status === "T",
                            )
                          }
                          className={
                            "min-h-8 w-full rounded px-1 font-semibold " +
                            (cell.fixed
                              ? "ring-1 ring-primary ring-inset "
                              : "") +
                            (cell.status === "T"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                              : "bg-muted/60 text-muted-foreground")
                          }
                        >
                          {cell.status}
                          {summary.hasReport && (
                            <small className="block text-[9px] font-normal">
                              {matchMinutesLabel(cell.actualMinutes ?? 0, true)} eff.
                            </small>
                          )}
                        </button>
                      </td>
                    ))}
                    <td className="match-planned-column p-1 text-center font-semibold tabular-nums">
                      {matchMinutesLabel(row.plannedMinutes, true)}
                    </td>
                    <td className="match-eq-column p-1 text-center text-muted-foreground">
                      {number(row.plannedPeriods)}
                    </td>
                    {summary.hasReport && (
                      <td className="match-actual-column p-1 text-center font-semibold">
                        {row.actualMinutes === null
                          ? "—"
                          : matchMinutesLabel(row.actualMinutes, true)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">
              T = titolare · P = panchina · — = non assegnato. Le lettere indicano
              le frazioni di ogni tempo. I minuti effettivi provengono dal resoconto.
            </p>
            {!summary.hasReport && (
              <p className="mt-1 text-xs text-muted-foreground">
                Minuti effettivi non registrati: i dati mancanti non valgono
                zero.
              </p>
            )}
          </section>
        </div>
        <section
          className="match-comparison-pitches min-w-0 rounded-xl border bg-background p-2 sm:p-3"
          aria-label="Schieramenti in tempo reale"
        >
          <h4 className="mb-2 text-sm font-semibold">
            Schieramenti in tempo reale
          </h4>
          <div className="match-pitch-grid">
            {units.map((unit) => (
              <article
                key={unit.key}
                className="min-w-0 space-y-2 rounded-lg border p-2 sm:p-3"
              >
                <h5 className="text-xs font-semibold">
                  {unit.label.replace(" tempo", "")} · {matchMinutesLabel(unit.minutes, true)}
                </h5>
                {renderPitch ? (
                  renderPitch(unit)
                ) : (
                  <>
                    <SummaryPitch summary={summary} unit={unit} />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="min-h-10 w-full px-0 text-xs"
                      onClick={() => setEnlarged(unit)}
                    >
                      Ingrandisci
                    </Button>
                  </>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
      {controls && (
        <details className="rounded-lg border bg-background p-3">
          <DisclosureSummary className="text-xs font-semibold">
            Strumenti per gli schieramenti
          </DisclosureSummary>
          <div className="mt-3">{controls}</div>
        </details>
      )}
      {footer}
    </section>
  );
}
