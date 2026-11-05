import "./mobile-player-table.css";
import { useAuth } from "@/hooks/use-auth";
import { useTechnicalScope } from "@/components/technical-scope";
import { withApi } from "@/lib/api-base";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, startOfWeek } from "date-fns";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

type Event = { id: number; date: string; title: string; shared?: boolean };
type Game = { called: boolean | null; minutes: number | null };
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
const dateKey = (date: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
const shortDate = (date: string) =>
  new Date(date).toLocaleDateString("it-IT", {
    timeZone: "Europe/Rome",
    day: "numeric",
    month: "short",
  });

function exportCsv(title: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((value) => {
          const safe = /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
          return '"' + safe.replaceAll('"', '""') + '"';
        })
        .join(";"),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = title + ".csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function RegisterTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="min-w-0 max-w-full md:overflow-x-auto print:overflow-visible">
      <table
        className="mobile-player-table w-full border-collapse text-sm md:min-w-max print:min-w-0"
        role="table"
      >
        <thead className="bg-muted">
          <tr>
            {headers.map((header, index) => (
              <th
                key={index}
                scope="col"
                className="p-2 text-left sm:max-w-48 sm:whitespace-normal max-sm:max-w-36 max-sm:[overflow-wrap:normal] print:whitespace-normal"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, team, ...cells], index) => (
            <tr key={index} className="border-b">
              <th
                scope="row"
                className="whitespace-nowrap p-2 text-left font-medium print:whitespace-normal"
              >
                {name}
              </th>
              <td className="p-2 text-muted-foreground max-md:col-span-full max-md:pt-0 md:whitespace-nowrap">
                {team}
              </td>
              {cells.map((cell, index) => (
                <td
                  key={index}
                  className={
                    cell === "Presente"
                      ? "whitespace-nowrap p-2 text-emerald-700"
                      : cell === "Assente"
                        ? "whitespace-nowrap p-2 text-red-700"
                        : "whitespace-nowrap p-2 print:whitespace-normal"
                  }
                >
                  <span
                    aria-hidden="true"
                    className="mobile-cell-label hidden text-muted-foreground"
                  >
                    {headers[index + 2]}
                  </span>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="p-3 text-sm text-muted-foreground">
          Nessun giocatore per questo periodo.
        </p>
      )}
    </div>
  );
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
  const scope=useTechnicalScope();
  const allowedTeams=scope.teams.filter(team=>!section||team.clubSection===section);
  const [teamId, setTeamId] = useState(initialTeamId ?? (scope.enabled ? String(allowedTeams[0]?.id??"") : ""));
  const [week, setWeek] = useState(() =>
    startOfWeek(new Date(dateKey(new Date().toISOString()) + "T12:00:00"), {
      weekStartsOn: 1,
    }),
  );
  const params = new URLSearchParams();
  if (teamId) params.set("teamId", teamId);
  if (section) params.set("section", section);
  const { data, isPending, isError } = useQuery<Register>({
    enabled: !scope.enabled || allowedTeams.length>0,
    queryKey: [
      "attendance-register",
      club?.id,
      user?.id,
      role,
      family,
      section,
      teamId,
    ],
    queryFn: async () => {
      const response = await fetch(
        withApi(`/api/attendance-register?${params}`),
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Registro non disponibile");
      return response.json();
    },
    gcTime: 0,
    staleTime: 0,
    refetchOnMount: "always",
  });
  if(scope.enabled&&!allowedTeams.length)return <p>Nessuna annata autorizzata in questo ambito.</p>;
  if (isPending) return <p>Caricamento presenze…</p>;
  if (isError) return <p role="alert">Impossibile caricare le presenze.</p>;
  if (!data.teamId) return <p>Nessuna squadra disponibile.</p>;
  const from = format(week, "yyyy-MM-dd");
  const to = format(addDays(week, 6), "yyyy-MM-dd");
  const inWeek = (event: Event) =>
    dateKey(event.date) >= from && dateKey(event.date) <= to;
  const byDate = (a: Event, b: Event) => a.date.localeCompare(b.date);
  const sessions = data.sessions.filter(inWeek).sort(byDate);
  const matches = data.matches.filter(inWeek).sort(byDate);
  const headers = [
    "Giocatore",
    "Annata",
    ...sessions.map(
      (s) =>
        `${shortDate(s.date)} · ${s.title}${s.shared ? " · Congiunto" : ""}`,
    ),
    ...matches.flatMap((m) => [
      `${shortDate(m.date)} · ${m.title}`,
      "Minuti effettivi",
    ]),
  ];
  const visible = data.players.filter(
    (player) =>
      family ||
      player.teamId === data.teamId ||
      sessions.some((s) => s.id in player.attendance) ||
      matches.some((m) => m.id in player.games),
  );
  const rows = visible.map((player) => [
    player.name,
    player.team,
    ...sessions.map((s) => {
      if (!(s.id in player.attendance)) return "—";
      const status = player.attendance[s.id];
      return status
        ? (labels[status] ?? status)
        : dateKey(s.date) > data.today
          ? "In programma"
          : "Non registrato";
    }),
    ...matches.flatMap((m) => {
      const game = player.games[m.id];
      return [
        !game
          ? "—"
          : game.called === null
            ? "Da pubblicare"
            : game.called
              ? "Convocato"
              : "Non convocato",
        game?.minutes != null
          ? `${game.minutes} min`
          : game?.called && dateKey(m.date) <= data.today
            ? "Non registrato"
            : "—",
      ];
    }),
  ]);
  const totalHeaders = [
    "Giocatore",
    "Annata",
    "Presenze",
    "Assenze",
    "Giustificati",
    "Infortuni",
    "Non registrate",
    "Convocazioni",
    "Minuti effettivi",
  ];
  const totalRows = data.players.flatMap((player) => {
    const attendance = data.sessions
      .filter(
        (s) => dateKey(s.date) <= data.through && s.id in player.attendance,
      )
      .map((s) => player.attendance[s.id]);
    const games = data.matches
      .filter((m) => dateKey(m.date) <= data.through)
      .map((m) => player.games[m.id])
      .filter(Boolean);
    if (
      !family &&
      player.teamId !== data.teamId &&
      !attendance.length &&
      !games.length
    )
      return [];
    const minutes = games.flatMap((game) =>
      game.minutes === null ? [] : [game.minutes],
    );
    return [
      [
        player.name,
        player.team,
        ...["present", "absent", "requested", "injured", null].map((status) =>
          String(attendance.filter((a) => a === status).length),
        ),
        String(games.filter((game) => game.called).length),
        minutes.length ? `${minutes.reduce((a, b) => a + b, 0)} min` : "—",
      ],
    ];
  });

  return (
    <div id="attendance-register-print" className="space-y-4">
      <style>{`@media print { body:has(#attendance-register-print) *:not(:has(#attendance-register-print)):not(#attendance-register-print):not(#attendance-register-print *) { display:none !important; } body:has(#attendance-register-print) *:has(#attendance-register-print) { display:block !important; overflow:visible !important; height:auto !important; } #attendance-register-print tr { break-inside:avoid; } }`}</style>
      <h1 className="text-2xl font-semibold">
        {family ? "Presenze di tuo figlio" : "Presenze"}
      </h1>
      {!family && !lockTeam && (
        <label className="flex flex-wrap items-center gap-2 print:hidden">
          Squadra
          <select
            className="rounded border bg-background p-2"
            value={data.teamId}
            onChange={(event) => setTeamId(event.target.value)}
          >
            {data.teams.filter(team=>!scope.enabled||allowedTeams.some(allowed=>allowed.id===team.id)).map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <section className="space-y-3 rounded-xl border bg-card p-3 sm:p-5">
        <header className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="print:hidden"
            aria-label="Settimana precedente"
            onClick={() => setWeek(addDays(week, -7))}
          >
            ‹
          </Button>
          <h2 className="font-semibold">
            {format(week, "dd/MM/yyyy")} –{" "}
            {format(addDays(week, 6), "dd/MM/yyyy")}
          </h2>
          <Button
            variant="outline"
            className="print:hidden"
            aria-label="Settimana successiva"
            onClick={() => setWeek(addDays(week, 7))}
          >
            ›
          </Button>
          <Button
            variant="outline"
            className="print:hidden"
            onClick={() => exportCsv(`presenze-${from}`, [headers, ...rows])}
          >
            Esporta settimana CSV
          </Button>
          <Button
            variant="outline"
            className="print:hidden"
            onClick={() => window.print()}
          >
            Stampa / PDF
          </Button>
        </header>
        <RegisterTable headers={headers} rows={rows} />
        {data.canEdit && (
          <div className="flex flex-wrap gap-2 print:hidden">
            {sessions.map((s) => (
              <Button key={s.id} asChild variant="outline">
                <Link href={`${attendancePath}?sessionId=${s.id}`}>
                  Apri appello · {shortDate(s.date)} · {s.title}
                </Link>
              </Button>
            ))}
          </div>
        )}
      </section>
      <section className="space-y-3 rounded-xl border bg-card p-3 sm:p-5">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Totali della stagione</h2>
            <p className="text-sm text-muted-foreground">
              {data.start.split("-").reverse().join("/")} –{" "}
              {data.through.split("-").reverse().join("/")}
            </p>
          </div>
          <Button
            variant="outline"
            className="print:hidden"
            onClick={() =>
              exportCsv(`presenze-stagione-${data.through}`, [
                totalHeaders,
                ...totalRows,
              ])
            }
          >
            Esporta totali CSV
          </Button>
        </header>
        <RegisterTable headers={totalHeaders} rows={totalRows} />
        <p className="text-xs text-muted-foreground">
          I totali sono indipendenti dalla settimana selezionata. I minuti
          provengono dalle gare con resoconto.
        </p>
      </section>
    </div>
  );
}
