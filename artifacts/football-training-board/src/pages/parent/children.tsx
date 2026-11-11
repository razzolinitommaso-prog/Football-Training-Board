import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Users, ChevronRight, Trophy, CalendarDays, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { withApi } from "@/lib/api-base";

type Player = {
  id: number;
  teamId: number | null;
  firstName: string;
  lastName: string;
  position: string | null;
  jerseyNumber: number | null;
  available: boolean;
  isOwnChild: boolean;
};

type Team = {
  id: number;
  name: string;
  ageGroup?: string | null;
  category?: string | null;
  rosterTeams?: { id: number; name: string }[];
  players: Player[];
  nextTraining: { scheduledAt: string } | null;
  nextMatch: { opponent: string; date: string } | null;
};

function formatAppointment(value: string, time = false) {
  return new Date(value).toLocaleDateString("it-IT", {
    timeZone: "Europe/Rome", weekday: "short", day: "numeric", month: "short",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function PlayerRow({ player }: { player: Player }) {
  const content = (
    <>
      <span className="grid size-9 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
        {player.jerseyNumber ?? player.firstName[0]}
      </span>
      <span className="min-w-0">
        <span className="block break-words font-medium">{player.firstName} {player.lastName}</span>
        {(player.isOwnChild || player.position) && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {[player.isOwnChild && "Tuo figlio", player.position].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
      <Badge variant={player.available ? "default" : "secondary"} className="justify-self-end whitespace-nowrap">
        {player.available ? "Disponibile" : "N/D"}
      </Badge>
      {player.isOwnChild && <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />}
    </>
  );
  const rowClass = "grid min-h-14 grid-cols-[2.25rem_minmax(0,1fr)_auto_1rem] items-center gap-2 px-3 py-2 text-sm sm:gap-3 sm:px-4";
  return (
    <li>
      {player.isOwnChild ? (
        <Link href="/parent/player-card" className={rowClass + " bg-primary/5 hover:bg-primary/10"}>{content}</Link>
      ) : <div className={rowClass}>{content}</div>}
    </li>
  );
}

export default function ParentChildren() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetch(withApi("/api/parent/children"), { credentials: "include" })
      .then(async response => {
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        setTeams(await response.json());
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex h-64 items-center justify-center" role="status" aria-label="Caricamento squadre">
      <div className="size-8 animate-spin rounded-full border-b-2 border-primary" />
    </div>
  );
  if (error) return <p role="alert">Impossibile caricare le squadre. Riprova aggiornando la pagina.</p>;

  const totalPlayers = teams.reduce((sum, team) => sum + team.players.length, 0);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Squadre & Atleti</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {teams.length} {teams.length === 1 ? "squadra" : "squadre"} · {totalPlayers} {totalPlayers === 1 ? "atleta" : "atleti"}
        </p>
      </header>

      {teams.length === 0 && (
        <div className="py-16 text-center text-muted-foreground">
          <Users className="mx-auto mb-3 size-12 opacity-25" />
          <p className="font-semibold">Nessuna squadra</p>
        </div>
      )}

      {teams.map(team => {
        const otherTeams = team.rosterTeams?.filter(item => item.id !== team.id) ?? [];
        const joint = otherTeams.length > 0;
        const groups = [{ id: team.id, name: team.name }, ...otherTeams];
        const open = !collapsed[team.id];
        const rosterId = `parent-roster-${team.id}`;
        const description = [...new Set([team.ageGroup, team.category].filter(Boolean))].join(" · ");
        return (
          <article key={team.id} className="overflow-hidden rounded-2xl border bg-card">
            <div className="p-3 sm:p-4">
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-expanded={open}
                aria-controls={rosterId}
                onClick={() => setCollapsed(previous => ({ ...previous, [team.id]: open }))}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Trophy className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-semibold">{team.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {[description, joint ? "Rosa congiunta" : "", `${team.players.length} ${team.players.length === 1 ? "atleta" : "atleti"}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <ChevronDown className={`size-5 shrink-0 text-muted-foreground ${open ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
              {team.id > 0 && (
                <Link href={`/parent/team/${team.id}`} className="mt-2 inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary hover:underline">
                  Info squadra <ChevronRight className="size-4" aria-hidden="true" />
                </Link>
              )}
            </div>

            <div id={rosterId} hidden={!open}>
              {(team.nextTraining || team.nextMatch) && (
                <div className="grid gap-px border-y bg-border sm:grid-cols-2">
                  {team.nextTraining && (
                    <div className="flex gap-2 bg-card px-3 py-2.5 sm:px-4">
                      <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                      <div><p className="text-xs font-medium text-muted-foreground">Prossimo allenamento</p><p className="text-sm">{formatAppointment(team.nextTraining.scheduledAt, true)}</p></div>
                    </div>
                  )}
                  {team.nextMatch && (
                    <div className="flex gap-2 bg-card px-3 py-2.5 sm:px-4">
                      <Trophy className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
                      <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">Prossima partita</p><p className="break-words text-sm">{team.nextMatch.opponent} · {formatAppointment(team.nextMatch.date)}</p></div>
                    </div>
                  )}
                </div>
              )}
              {team.players.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Nessun atleta in questa squadra.</p>}
              {groups.map((group, index) => {
                const players = joint ? team.players.filter(player => player.teamId === group.id) : team.players;
                if (!players.length) return null;
                return (
                  <section key={group.id} className={index > 0 ? "border-t" : ""}>
                    {joint && <h2 className="flex items-center justify-between gap-2 bg-muted/50 px-3 py-2 text-sm font-medium sm:px-4">
                      {group.name} <span className="text-xs text-muted-foreground">{players.length}</span>
                    </h2>}
                    <ul className="divide-y">{players.map(player => <PlayerRow key={player.id} player={player} />)}</ul>
                  </section>
                );
              })}
            </div>
          </article>
        );
      })}
    </div>
  );
}
