import "@/components/training/mobile-player-table.css";
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
          (enlarged ? "max-w-md" : "max-w-48")
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
              <span className="absolute top-full mt-0.5 max-w-20 truncate rounded bg-green-950/90 px-1 text-[8px] leading-tight">
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
  renderPitch,
  controls,
  footer,
  title = "Confronto tempi e minutaggio",
}: {
  summary: MatchRotationSummary;
  roster?: RosterPlayer[];
  onCallup?: (id: number, called: boolean) => void;
  onStatus?: (id: number, key: string, reserve: boolean) => void;
  renderPitch?: (unit: RotationSummaryUnit) => ReactNode;
  controls?: ReactNode;
  footer?: ReactNode;
  title?: string;
}) {
  const [enlarged, setEnlarged] = useState<RotationSummaryUnit | null>(null);
  const [search, setSearch] = useState(""),
    [all, setAll] = useState(false);
  const rosterVisible = roster?.filter(
    (p) =>
      (all || p.called || !roster.some((r) => r.called)) &&
      p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <section className="space-y-3" aria-label={title}>
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
      {controls}
      <div
        className={
          "grid min-w-0 gap-3 " +
          (roster ? "lg:grid-cols-[minmax(190px,0.8fr)_minmax(0,3fr)]" : "")
        }
      >
        {roster && (
          <section className="order-1 min-w-0 rounded-xl border bg-background p-3">
            <h4 className="mb-2 font-semibold">
              Convocati ({roster.filter((p) => p.called).length})
            </h4>
            <Input
              className="mb-2 h-8 text-xs"
              aria-label="Cerca convocato"
              placeholder="Cerca giocatore…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="divide-y">
              {rosterVisible?.map((p) => (
                <label
                  key={p.id}
                  className="flex min-h-9 items-center gap-2 py-1 text-xs"
                >
                  <Checkbox
                    checked={p.called}
                    disabled={p.disabled}
                    aria-label={"Convoca " + p.name}
                    onCheckedChange={(v) => {
                      if (!roster?.some((r) => r.called)) setAll(true);
                      onCallup?.(p.id, v === true);
                    }}
                  />
                  <span className="min-w-0 break-words">
                    {p.name}
                    {p.note && (
                      <span className="block text-[10px] text-muted-foreground">
                        {p.note}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-2 w-full text-xs"
              onClick={() => setAll(!all)}
            >
              {all ? "Mostra convocati" : "Aggiungi / modifica convocati"}
            </Button>
          </section>
        )}
        <div className="order-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:order-2">
          {summary.units.map((unit, index) => (
            <article
              key={unit.key}
              className="min-w-0 space-y-2 rounded-xl border bg-background p-2"
            >
              <h4 className="text-xs font-semibold">
                {unit.label} · {number(unit.minutes)} min
              </h4>
              {renderPitch ? (
                renderPitch(unit)
              ) : (
                <>
                  <SummaryPitch summary={summary} unit={unit} />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="w-full text-xs"
                    onClick={() => setEnlarged(unit)}
                  >
                    Ingrandisci
                  </Button>
                </>
              )}
            </article>
          ))}
        </div>
        <section
          className={
            "order-2 min-w-0 rounded-xl border bg-background p-2 sm:p-3 lg:order-3 " +
            (roster ? "lg:col-span-2" : "")
          }
        >
          <h4 className="mb-1 text-sm font-semibold">{title}</h4>
          <p className="mb-2 text-[11px] text-muted-foreground">
            {onStatus
              ? "Tocca una cella per cambiare titolare/panchina. Il calcolo resta modificabile."
              : "Consultazione in sola lettura."}
          </p>
          <div className="min-w-0 max-w-full md:overflow-x-auto">
            {" "}
            <table className="mobile-player-table mobile-rotation-table w-full border-collapse text-xs md:min-w-max md:whitespace-nowrap">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="w-[28%] p-1 sm:p-2">Giocatore</th>
                  {summary.units.map((u) => (
                    <th key={u.key} className="p-1 text-center sm:p-2">
                      {u.label.replace(" tempo", "")}
                      <span className="block text-[10px] font-normal">
                        {number(u.minutes)}′
                      </span>
                    </th>
                  ))}
                  <th
                    className="p-1 text-center"
                    aria-label="Tempi equivalenti"
                  >
                    Tempi eq.
                  </th>
                  <th className="p-1 text-center" aria-label="Minuti previsti">
                    Prev.′
                  </th>
                  {summary.hasReport && (
                    <th
                      className="p-1 text-center"
                      aria-label="Minuti effettivi"
                    >
                      Eff.′
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row) => (
                  <tr key={row.playerId} className="border-b">
                    <th className="break-words p-1 text-left font-medium sm:p-2">
                      {row.name}
                    </th>
                    {row.cells.map((cell) => (
                      <td key={cell.key} className="p-0.5 text-center">
                        <span
                          aria-hidden="true"
                          className="mobile-cell-label hidden"
                        >
                          {
                            summary.units.find((unit) => unit.key === cell.key)
                              ?.label
                          }
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
                            (cell.status === "T"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-600")
                          }
                        >
                          {cell.status}
                          {summary.hasReport && (
                            <small className="block text-[9px] font-normal">
                              {number(cell.actualMinutes ?? 0)}′
                            </small>
                          )}
                        </button>
                      </td>
                    ))}
                    <td className="p-1 text-center font-semibold">
                      <span
                        aria-hidden="true"
                        className="mobile-cell-label hidden"
                      >
                        Tempi eq.
                      </span>
                      {number(row.plannedPeriods)}
                    </td>
                    <td className="p-1 text-center font-semibold">
                      <span
                        aria-hidden="true"
                        className="mobile-cell-label hidden"
                      >
                        Previsti
                      </span>
                      {number(row.plannedMinutes)}′
                    </td>
                    {summary.hasReport && (
                      <td className="p-1 text-center font-semibold">
                        <span
                          aria-hidden="true"
                          className="mobile-cell-label hidden"
                        >
                          Effettivi
                        </span>
                        {row.actualMinutes === null
                          ? "—"
                          : number(row.actualMinutes) + "′"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            T = titolare · P = panchina · — = non assegnato. Tempi eq. somma le
            quote previste: due metà valgono un tempo. Prev. indica i minuti
            previsti e Eff. quelli effettivi. I minuti sotto T/P sono effettivi.
            Previsti e tempi eq. sono il piano; gli effettivi provengono dal
            resoconto.
          </p>
          {!summary.hasReport && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Minuti effettivi non registrati: i dati mancanti non valgono zero.
            </p>
          )}
        </section>
      </div>
      {footer}
    </section>
  );
}
