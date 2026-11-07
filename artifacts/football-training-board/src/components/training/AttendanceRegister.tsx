import "./mobile-player-table.css";
import { useAuth } from "@/hooks/use-auth";
import { useTechnicalScope } from "@/components/technical-scope";
import { withApi } from "@/lib/api-base";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, startOfWeek } from "date-fns";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import { ScrollableSelect } from "@/components/ui/scrollable-select";

type Event = { id: number; date: string; title: string; shared?: boolean; team?: string };
type Game = { called: boolean | null; minutes: number | null; plannedMinutes: number | null };
type Player = {
  id: number;
  name: string;
  team: string;
  teamId: number | null;
  attendance: Record<number, string | null>;
  games: Record<number, Game>;
};
type Register = {
  teams: { id: number; name: string }[];
  activeRosterTeams?: number[];
  teamId: number | null;
  start: string;
  through: string;
  today: string;
  canEdit: boolean;
  sessions: Event[];
  matches: Event[];
  players: Player[];
};

const labels: Record<string, string> = {
  present: "Presente",
  absent: "Assente",
  requested: "Giustificato",
  injured: "Infortunato",
};
const statusBadges: Record<string, { letter: string; tone: string }> = {
  present: { letter: "P", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  absent: { letter: "A", tone: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  requested: { letter: "G", tone: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  injured: { letter: "I", tone: "bg-muted text-foreground" },
};
const romeDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
});
const dateKey = (date: string) => romeDate.format(new Date(date));
const shortDate = (date: string) =>
  new Date(date).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short" });
const calendarLabel = (date: string) => date.split("-").reverse().join("/");
const searchKey = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it").trim();
const minuteLabel = (minutes: number | null | undefined) => {
  if (minutes == null) return "—";
  const seconds = Math.round(minutes * 60);
  return Math.floor(seconds / 60) + "′" + (seconds % 60 ? String(seconds % 60).padStart(2, "0") + "″" : "");
};

function exportCsv(title: string, rows: string[][]) {
  const csv = rows.map(row => row.map(value => {
    const safe = /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  }).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = title + ".csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function attendanceLabel(player: Player, session: Event, today: string) {
  if (!(session.id in player.attendance)) return "Non applicabile";
  const status = player.attendance[session.id];
  return status ? (labels[status] ?? status) : dateKey(session.date) > today ? "In programma" : "Non registrato";
}

function callupLabel(game?: Game) {
  if (!game) return "Non applicabile";
  if (game.called == null) return "Da pubblicare";
  return game.called ? "Convocato" : "Non convocato";
}

function sumMinutes(values: (number | null | undefined)[]) {
  const available = values.filter((value): value is number => value != null);
  return available.length ? available.reduce((total, value) => total + value, 0) : null;
}

function summarize(player: Player, sessions: Event[], matches: Event[], today: string) {
  const attendance = sessions.filter(session => session.id in player.attendance);
  const recorded = attendance.map(session => player.attendance[session.id]).filter(status => status != null);
  const games = matches.flatMap(match => {
    const game = player.games[match.id];
    return game ? [game] : [];
  });
  return {
    present: recorded.filter(status => status === "present").length,
    absent: recorded.filter(status => status === "absent").length,
    justified: recorded.filter(status => status === "requested").length,
    injured: recorded.filter(status => status === "injured").length,
    missing: attendance.filter(session => player.attendance[session.id] == null && dateKey(session.date) <= today).length,
    recorded: recorded.length,
    called: games.filter(game => game.called === true).length,
    planned: sumMinutes(games.map(game => game.plannedMinutes)),
    actual: sumMinutes(games.map(game => game.minutes)),
  };
}

const statusFilters = [
  ["", "Tutti gli stati"], ...Object.entries(labels),
  ["missing", "Appello non registrato"], ["called", "Convocato"], ["reported", "Minuti effettivi registrati"],
];
const sorts = [
  ["name", "Giocatore"], ["team", "Annata"], ["present", "Presenze"],
  ["absent", "Assenze"], ["called", "Convocazioni"], ["planned", "Minuti previsti"], ["actual", "Minuti effettivi"],
] as const;
type Sort = (typeof sorts)[number][0];
const summaryHeaders = [
  "Giocatore", "Annata", "Presenze", "Appelli registrati", "% presenze", "Assenze",
  "Giustificati", "Infortuni", "Non registrate", "Convocazioni", "Minuti previsti", "Minuti effettivi",
];

function StatCell({ label, children }: { label: string; children: ReactNode }) {
  return <td className="px-2 py-1.5 tabular-nums">
    <span aria-hidden="true" className="mobile-cell-label hidden text-muted-foreground">{label}</span>
    {children}
  </td>;
}

export function AttendanceRegister({
  section,
  initialTeamId,
  family = false,
  lockTeam = false,
  attendancePath = "/attendance",
}: {
  section?: string;
  initialTeamId?: string;
  family?: boolean;
  lockTeam?: boolean;
  attendancePath?: string;
}) {
  const { user, club, role } = useAuth();
  const scope = useTechnicalScope();
  const allowedTeams = scope.teams.filter(team => !section || team.clubSection === section);
  const [requestedTeamId, setTeamId] = useState(initialTeamId ?? "");
  const teamId = scope.enabled && !allowedTeams.some(team => String(team.id) === requestedTeamId)
    ? String(allowedTeams[0]?.id ?? "") : requestedTeamId;
  const [week, setWeek] = useState(() => startOfWeek(new Date(dateKey(new Date().toISOString()) + "T12:00:00"), { weekStartsOn: 1 }));
  const [period, setPeriod] = useState("week");
  const [ageGroup, setAgeGroup] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    let openedForPrint: HTMLDetailsElement | null = null;
    const before = () => {
      if (details.current && !details.current.open) {
        openedForPrint = details.current;
        openedForPrint.open = true;
      }
    };
    const after = () => {
      if (openedForPrint) openedForPrint.open = false;
      openedForPrint = null;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  const params = new URLSearchParams();
  if (teamId) params.set("teamId", teamId);
  if (section) params.set("section", section);
  const { data, isPending, isError, refetch } = useQuery<Register>({
    enabled: !scope.enabled || allowedTeams.length > 0,
    queryKey: ["attendance-register", club?.id, user?.id, role, family, section, teamId],
    queryFn: async () => {
      const response = await fetch(withApi("/api/attendance-register?" + params), { credentials: "include" });
      if (!response.ok) throw new Error("Registro non disponibile");
      return response.json();
    },
    gcTime: 0,
    staleTime: 0,
    refetchOnMount: "always",
  });
  if (scope.enabled && !allowedTeams.length) return <p>Nessuna annata autorizzata in questo ambito.</p>;
  if (isPending) return <p role="status">Caricamento presenze…</p>;
  if (isError) return <div role="alert" className="flex flex-wrap items-center gap-2">
    Impossibile caricare le presenze.
    <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>Riprova</Button>
  </div>;
  if (!data.teamId) return <p>Nessuna squadra disponibile.</p>;

  const from = format(week, "yyyy-MM-dd");
  const to = format(addDays(week, 6), "yyyy-MM-dd");
  const season = period === "season";
  const periodLabel = season
    ? calendarLabel(data.start) + " – " + calendarLabel(data.through)
    : calendarLabel(from) + " – " + calendarLabel(to);
  const inPeriod = (event: Event) => {
    const date = dateKey(event.date);
    return season ? date >= data.start && date <= data.through : date >= from && date <= to;
  };
  const byDate = (a: Event, b: Event) => a.date.localeCompare(b.date);
  const sessions = data.sessions.filter(inPeriod).sort(byDate);
  const matches = data.matches.filter(inPeriod).sort(byDate);
  const currentWeek = from <= data.today && data.today <= to;
  const candidates = data.players.filter(player => family || player.teamId === data.teamId ||
    ((season || currentWeek) && data.activeRosterTeams?.includes(player.teamId ?? -1)) ||
    sessions.some(session => session.id in player.attendance) || matches.some(match => match.id in player.games));
  const ageGroups = [...new Set(candidates.map(player => player.team))].sort((a, b) => a.localeCompare(b, "it"));
  const activeAgeGroup = ageGroups.includes(ageGroup) ? ageGroup : "";
  const rows = candidates.filter(player => (!activeAgeGroup || player.team === activeAgeGroup) &&
    searchKey(player.name).includes(searchKey(search)))
    .map(player => ({ player, ...summarize(player, sessions, matches, data.today) }))
    .filter(row => {
      if (!status) return true;
      if (status === "called") return row.called > 0;
      if (status === "reported") return row.actual !== null;
      if (status === "missing") return row.missing > 0;
      return sessions.some(session => row.player.attendance[session.id] === status);
    })
    .sort((a, b) => {
      const order = sort === "name" ? 0 : sort === "team"
        ? a.player.team.localeCompare(b.player.team, "it")
        : (b[sort] ?? -1) - (a[sort] ?? -1);
      return order || a.player.name.localeCompare(b.player.name, "it");
    });
  const registered = rows.reduce((sum, row) => sum + row.recorded, 0);
  const present = rows.reduce((sum, row) => sum + row.present, 0);
  const absent = rows.reduce((sum, row) => sum + row.absent, 0);
  const called = rows.reduce((sum, row) => sum + row.called, 0);
  const actual = sumMinutes(rows.map(row => row.actual));
  const showDates = !season && sessions.length > 0 && sessions.length <= 4;
  const fullEventName = (event: Event) => shortDate(event.date) + " · " + event.title +
    (event.shared ? " · Congiunto" : event.team ? " · " + event.team : "");
  const csvTitle = season ? "presenze-stagione-" + data.through : "presenze-" + from;
  const stats = [
    { label: "Presenze registrate", value: present + "/" + registered, className: "text-primary" },
    { label: "Assenze registrate", value: absent, className: "" },
    { label: "Convocazioni", value: called, className: "" },
    { label: "Minuti effettivi registrati", value: minuteLabel(actual), className: "" },
  ];
  const today = data.today;
  function exportReport() {
    const details = season ? [] : [
      ...sessions.map(fullEventName),
      ...matches.flatMap(match => ["Convocazione", "Minuti previsti", "Minuti effettivi"].map(label => fullEventName(match) + " · " + label)),
    ];
    exportCsv(csvTitle, [[...summaryHeaders, ...details], ...rows.map(row => [
      row.player.name, row.player.team, String(row.present), String(row.recorded),
      row.recorded ? String(Math.round(row.present / row.recorded * 100)) + "%" : "—",
      String(row.absent), String(row.justified), String(row.injured), String(row.missing), String(row.called),
      minuteLabel(row.planned), minuteLabel(row.actual),
      ...(season ? [] : [
        ...sessions.map(session => attendanceLabel(row.player, session, today)),
        ...matches.flatMap(match => {
          const game = row.player.games[match.id];
          return [callupLabel(game), minuteLabel(game?.plannedMinutes), minuteLabel(game?.minutes)];
        }),
      ]),
    ])]);
  }

  return (
    <div id="attendance-register-print" className="min-w-0 space-y-4">
      <style>{'@media print { body:has(#attendance-register-print) *:not(:has(#attendance-register-print)):not(#attendance-register-print):not(#attendance-register-print *) { display:none !important; } body:has(#attendance-register-print) *:has(#attendance-register-print) { display:block !important; overflow:visible !important; height:auto !important; } #attendance-register-print tr { break-inside:avoid; } }'}</style>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{family ? "Presenze di tuo figlio" : "Presenze e minutaggi"}</h1>
          {!family && ageGroups.length > 0 && <p className="text-sm text-muted-foreground">{ageGroups.join(" · ")}</p>}
        </div>
        {!family && !lockTeam && <ScrollableSelect aria-label="Squadra di riferimento" className="print:hidden" value={data.teamId}
          onValueChange={value => { setTeamId(value); setAgeGroup(""); }}>
          {data.teams.filter(team => !scope.enabled || allowedTeams.some(allowed => allowed.id === team.id))
            .map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
        </ScrollableSelect>}
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2 rounded-xl border bg-card p-3 md:grid-cols-4 print:hidden">
        <label className="min-w-0 space-y-1 text-xs font-medium">Periodo
          <ScrollableSelect aria-label="Periodo" className="w-full" value={period} onValueChange={setPeriod}>
            <option value="week">Settimana</option><option value="season">Stagione fino a oggi</option>
          </ScrollableSelect>
        </label>
        {!family && <>
          <label className="min-w-0 space-y-1 text-xs font-medium">Annata
            <ScrollableSelect aria-label="Annata" className="w-full" value={activeAgeGroup} onValueChange={setAgeGroup}>
              <option value="">Tutte nel registro</option>{ageGroups.map(name => <option key={name} value={name}>{name}</option>)}
            </ScrollableSelect>
          </label>
          <label className="min-w-0 space-y-1 text-xs font-medium">Giocatore
            <Input aria-label="Cerca giocatore" placeholder="Cerca per nome" value={search} onChange={event => setSearch(event.target.value)} />
          </label>
        </>}
        <label className="min-w-0 space-y-1 text-xs font-medium">Stato
          <ScrollableSelect aria-label="Stato" className="w-full" value={status} onValueChange={setStatus}>
            {statusFilters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </ScrollableSelect>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(stat => <div key={stat.label} className="min-w-0 rounded-xl border bg-card px-3 py-2">
          <p className={"text-xl font-semibold tabular-nums " + stat.className}>{stat.value}</p>
          <p className="text-xs text-muted-foreground">{stat.label}</p>
        </div>)}
      </div>
      <section className="min-w-0 space-y-3 rounded-xl border bg-card p-3 sm:p-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">{season ? "Totali della stagione" : "Confronto per giocatore"}</h2>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {!season && <Button type="button" variant="outline" size="icon" className="h-7 w-7 print:hidden" aria-label="Settimana precedente" onClick={() => setWeek(addDays(week, -7))}>‹</Button>}
              <span>{periodLabel}</span>
              {!season && <Button type="button" variant="outline" size="icon" className="h-7 w-7 print:hidden" aria-label="Settimana successiva" onClick={() => setWeek(addDays(week, 7))}>›</Button>}
              <span>· {sessions.length} {sessions.length === 1 ? "seduta" : "sedute"} · {matches.length} {matches.length === 1 ? "gara" : "gare"}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {!family && <ScrollableSelect aria-label="Ordina per" value={sort} onValueChange={value => setSort(value as Sort)}>
              {sorts.map(([value, label]) => <option key={value} value={value}>Ordina · {label}</option>)}
            </ScrollableSelect>}
            <Button type="button" variant="outline" size="sm" onClick={exportReport}>Esporta CSV</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>Stampa / PDF</Button>
          </div>
        </header>
        <table className="attendance-summary-table mobile-player-table w-full border-collapse text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="p-2 text-left">Giocatore / annata</th>
              {showDates && sessions.map(session => <th scope="col" key={session.id} title={fullEventName(session)} className="hidden px-2 py-1.5 text-left lg:table-cell print:table-cell">{shortDate(session.date)}</th>)}
              {["Presenze", "Assenze", "Convocazioni", "Min. previsti", "Min. effettivi"].map(label => <th scope="col" key={label} className="p-2 text-left">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => <tr key={row.player.id} className="border-b">
              <th scope="row" className="px-2 py-1.5 text-left font-semibold">
                {row.player.name}<span className="block text-xs font-normal text-muted-foreground">{row.player.team}</span>
              </th>
              {showDates && sessions.map(session => {
                const badge = statusBadges[row.player.attendance[session.id] ?? ""];
                const label = attendanceLabel(row.player, session, data.today);
                const short = label === "Non applicabile" ? "N/A" : label === "Non registrato" ? "NR" : "—";
                return <td key={session.id} className="hidden px-2 py-1.5 lg:table-cell print:table-cell">
                  <span title={label} aria-label={label} className={"rounded px-1.5 py-0.5 text-xs font-medium " + (badge?.tone ?? "bg-muted text-muted-foreground")}>{badge?.letter ?? short}</span>
                </td>;
              })}
              <StatCell label="Presenze">{row.recorded ? row.present + "/" + row.recorded + " · " + Math.round(row.present / row.recorded * 100) + "%" : "—"}</StatCell>
              <StatCell label="Assenze">
                {row.absent}
                {(row.justified > 0 || row.injured > 0 || row.missing > 0) && <span className="block text-[10px] text-muted-foreground">
                  {[row.justified > 0 && row.justified + " giust.", row.injured > 0 && row.injured + " inf.",
                    row.missing > 0 && row.missing + " non reg."].filter(Boolean).join(" · ")}
                </span>}
              </StatCell>
              <StatCell label="Convocazioni">{row.called}</StatCell>
              <StatCell label="Min. previsti">{minuteLabel(row.planned)}</StatCell>
              <StatCell label="Min. effettivi"><strong>{minuteLabel(row.actual)}</strong></StatCell>
            </tr>)}
          </tbody>
        </table>
        {!rows.length && <p className="p-2 text-sm text-muted-foreground">Nessun giocatore corrisponde ai filtri.</p>}
        <p className="text-xs text-muted-foreground">
          Percentuale sugli appelli registrati. I minuti effettivi sommano le gare con resoconto. Il trattino indica un dato mancante.
          {showDates && <span className="hidden lg:inline print:inline"> P presente · A assente · G giustificato · I infortunato · NR non registrato · N/A fuori elenco.</span>}
        </p>
        {!season && (sessions.length > 0 || matches.length > 0) && <details ref={details} className="rounded-lg border">
          <DisclosureSummary className="px-3 py-2 text-sm font-medium">Dettaglio sedute e gare</DisclosureSummary>
          <div className="divide-y border-t px-3">
            {sessions.map(session => <div key={session.id} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <h3 className="text-sm font-medium">{fullEventName(session)}</h3>
                {data.canEdit && <Button asChild variant="outline" size="sm" className="print:hidden"><Link href={attendancePath + "?sessionId=" + session.id}>Apri appello</Link></Button>}
              </div>
              <ul className="mt-1 grid gap-x-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
                {rows.filter(row => session.id in row.player.attendance).map(({ player }) => <li key={player.id} className="py-0.5">
                  {player.name} <span className="text-muted-foreground">· {attendanceLabel(player, session, data.today)}</span>
                </li>)}
              </ul>
            </div>)}
            {matches.map(match => <div key={match.id} className="py-2">
              <h3 className="text-sm font-medium">{fullEventName(match)}</h3>
              <ul className="mt-1 grid gap-x-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
                {rows.filter(row => match.id in row.player.games).map(({ player }) => {
                  const game = player.games[match.id];
                  return <li key={player.id} className="py-0.5">
                    {player.name} <span className="text-muted-foreground">· {callupLabel(game)}
                      {game.called && (" · " + minuteLabel(game.plannedMinutes) + " previsti · " + minuteLabel(game.minutes) + " effettivi")}
                    </span>
                  </li>;
                })}
              </ul>
            </div>)}
          </div>
        </details>}
      </section>
      {!season && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2 print:hidden">
        <div><h2 className="text-sm font-semibold">Totali della stagione</h2><p className="text-xs text-muted-foreground">{calendarLabel(data.start)} – {calendarLabel(data.through)}</p></div>
        <Button type="button" variant="outline" size="sm" onClick={() => setPeriod("season")}>Apri riepilogo</Button>
      </div>}
    </div>
  );
}
