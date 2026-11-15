import { useState } from "react";
import { format, startOfDay, startOfWeek, subDays } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import { Input } from "@/components/ui/input";
import type { ComparisonState } from "@/lib/team-manager-comparison";
import { ScrollableSelect } from "@/components/ui/scrollable-select";

export type AttendancePeriod = "week" | "four";
export type MatchAttendanceState = ComparisonState | "requested" | "injured";
type AttendanceCell = {
  state: MatchAttendanceState;
  availability: "available" | "unavailable" | null;
};
type AttendancePlayer = {
  id: number;
  firstName: string;
  lastName: string;
  called: boolean;
  note?: string;
  cells: AttendanceCell[];
  present: number;
  absent: number;
};
type AttendanceEvent = { id: string; date: string | null; showTime?: boolean };

const labels: Record<MatchAttendanceState, string> = {
  present: "Presente",
  absent: "Assente",
  unavailable: "Indisponibilità registrata",
  requested: "Richiesto da altra squadra",
  injured: "Infortunato",
  unknown: "Non registrato",
  upcoming: "Da svolgere",
  conflict: "Da verificare",
};

function AttendanceStatus({ state, availability }: AttendanceCell) {
  const color = state === "present" ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
    : state === "absent" ? "bg-red-500/10 text-red-800 dark:text-red-300"
      : state === "conflict" ? "bg-amber-500/10 text-amber-800 dark:text-amber-300"
        : "bg-muted text-muted-foreground";
  return <div className="space-y-1">
    <span className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${color}`}>{labels[state]}</span>
    {availability && <p className="text-xs text-muted-foreground">
      Genitore: {availability === "available" ? "disponibile" : "non disponibile"}
    </p>}
  </div>;
}

function CallupLabel({ called }: { called: boolean }) {
  return <span className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${called
    ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
    {called ? "Convocato" : "Non convocato"}
  </span>;
}

function attendanceTotal(player: AttendancePlayer) {
  const unknown = player.cells.filter(cell => cell.state === "unknown").length;
  const conflict = player.cells.filter(cell => cell.state === "conflict").length;
  const unavailable = player.cells.filter(cell => ["unavailable", "requested", "injured"].includes(cell.state)).length;
  const upcoming = player.cells.filter(cell => cell.state === "upcoming").length;
  return [
    player.present ? `${player.present} ${player.present === 1 ? "presenza" : "presenze"}` : "",
    player.absent ? `${player.absent} ${player.absent === 1 ? "assenza" : "assenze"}` : "",
    unknown ? `${unknown} da registrare` : "",
    conflict ? `${conflict} da verificare` : "",
    unavailable ? `${unavailable} indisponibilità` : "",
    upcoming ? `${upcoming} da svolgere` : "",
  ].filter(Boolean).join(" · ") || "—";
}

const fullName = (player: AttendancePlayer) => `${player.lastName} ${player.firstName}`.trim();
const searchKey = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("it");
const formatEventDay = (event: AttendanceEvent) => event.date ? format(new Date(event.date), "EEE d MMM", { locale: it }) : "Da definire";
const formatEventTime = (event: AttendanceEvent) => event.date && event.showTime !== false ? format(new Date(event.date), "HH:mm") : "";

export function MatchAttendanceComparison({ period, onPeriodChange, matchDate, events, players, loading, error, onRetry }: {
  period: AttendancePeriod;
  onPeriodChange: (period: AttendancePeriod) => void;
  matchDate: string;
  events: AttendanceEvent[];
  players: AttendancePlayer[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  const day = startOfDay(new Date(matchDate));
  const from = period === "week" ? startOfWeek(day, { weekStartsOn: 1 }) : subDays(day, 28);
  const through = subDays(day, 1);
  const dateRange = from <= through ? `${format(from, "d MMM", { locale: it })} – ${format(through, "d MMM yyyy", { locale: it })}` : "";
  const [search, setSearch] = useState("");
  const [callups, setCallups] = useState("all");
  const terms = searchKey(search).trim().split(/\s+/).filter(Boolean);
  const filtered = players.filter(player =>
    (callups === "all" || player.called === (callups === "called")) &&
    terms.every(term => searchKey(fullName(player)).includes(term)));
  return <section aria-label="Presenze agli allenamenti" className="min-w-0 space-y-3">
    <h4 className="text-base font-semibold">Presenze agli allenamenti</h4>
    <div className="grid items-center gap-2 lg:grid-cols-[auto_12rem_minmax(0,1fr)]">
      <div role="group" aria-label="Periodo" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        <Button type="button" size="sm" variant={period === "week" ? "secondary" : "ghost"}
          aria-pressed={period === "week"} className="h-auto min-h-9 whitespace-normal px-2" onClick={() => onPeriodChange("week")}>Settimana della gara</Button>
        <Button type="button" size="sm" variant={period === "four" ? "secondary" : "ghost"}
          aria-pressed={period === "four"} className="h-auto min-h-9 whitespace-normal px-2" onClick={() => onPeriodChange("four")}>4 settimane</Button>
      </div>
      <ScrollableSelect value={callups} onValueChange={setCallups} className="w-full" aria-label="Filtra per convocazione">
        <option value="all">Tutta la rosa</option>
        <option value="called">Solo convocati</option>
        <option value="not-called">Solo non convocati</option>
      </ScrollableSelect>
      <Input type="search" aria-label="Cerca giocatore" placeholder="Cerca giocatore…" value={search} onChange={event => setSearch(event.target.value)} />
    </div>
    {loading ? <p role="status">Caricamento presenze…</p> : error ? <div role="alert" className="space-y-2">
      <p>{error}</p>{onRetry && <Button type="button" variant="outline" onClick={onRetry}>Riprova</Button>}
    </div> : !events.length ? <p className="rounded-lg bg-muted p-3">Nessun allenamento nel periodo selezionato.</p>
      : <>
        <p className="text-sm text-muted-foreground">{dateRange && <>{dateRange} · </>}{events.length} {events.length === 1 ? "allenamento" : "allenamenti"} · {filtered.length} {filtered.length === 1 ? "giocatore" : "giocatori"}</p>
        {!filtered.length ? <p className="rounded-lg bg-muted p-3">Nessun giocatore corrisponde ai filtri.</p> : <>
          <div role="region" aria-label="Tabella presenze per data" tabIndex={0} className="hidden max-w-full overflow-x-auto rounded-lg border sm:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  <th scope="col" className="sticky left-0 z-10 min-w-36 bg-muted p-3">Giocatore</th>
                  <th scope="col" className="p-3">Convocazione</th>
                  {events.map(event => <th key={event.id} scope="col" className="min-w-28 p-3 capitalize">
                    {formatEventDay(event)}<span className="block text-xs font-normal text-muted-foreground">{formatEventTime(event)}</span>
                  </th>)}
                  <th scope="col" className="min-w-32 p-3">Riepilogo appello</th>
                </tr>
              </thead>
              <tbody>{filtered.map(player => <tr key={player.id} className="border-t">
                <th scope="row" className="sticky left-0 z-10 bg-card p-3 font-semibold">{fullName(player)}{player.note && <span className="block text-xs font-normal text-muted-foreground">{player.note}</span>}</th>
                <td className="p-3"><CallupLabel called={player.called} /></td>
                {player.cells.map((cell, index) => <td key={events[index].id} className="p-3"><AttendanceStatus {...cell} /></td>)}
                <td className="p-3">{attendanceTotal(player)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <ul className="space-y-2 sm:hidden">{filtered.map(player => <li key={player.id}>
            <details className="rounded-lg border bg-card p-3">
              <DisclosureSummary>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold">{fullName(player)}</span>
                  <span className="block text-xs text-muted-foreground">{attendanceTotal(player)}</span>
                  {player.note && <span className="block text-xs text-muted-foreground">{player.note}</span>}
                </span>
                <CallupLabel called={player.called} />
              </DisclosureSummary>
              <ul className="mt-2 divide-y border-t">{player.cells.map((cell, index) => {
                const event = events[index];
                return <li key={event.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 py-2 text-sm">
                  <span className="capitalize">{[formatEventDay(event), formatEventTime(event)].filter(Boolean).join(" · ")}</span>
                  <AttendanceStatus {...cell} />
                </li>;
              })}</ul>
            </details>
          </li>)}</ul>
        </>}
        <p className="text-xs text-muted-foreground">L’appello dello staff e le risposte dei genitori sono riportati separatamente.</p>
      </>}
  </section>;
}
