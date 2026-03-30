import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Users, ChevronRight, Trophy, CalendarDays, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string) {
  const res = await fetch(`${BASE}/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export default function ParentChildren() {
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    apiFetch("/parent/children")
      .then((data) => {
        setTeams(data);
        const exp: Record<number, boolean> = {};
        data.forEach((t: any) => { exp[t.id] = true; });
        setExpanded(exp);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: number) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  const totalPlayers = teams.reduce((sum, t) => sum + (t.players?.length ?? 0), 0);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Squadre & Atleti</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {teams.length} squadr{teams.length === 1 ? "a" : "e"} · {totalPlayers} atleti
        </p>
      </div>

      {teams.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <Users className="w-14 h-14 mx-auto mb-4 opacity-25" />
          <p className="font-semibold">Nessuna squadra</p>
          <p className="text-sm mt-1">Le squadre della società appariranno qui.</p>
        </div>
      )}

      <div className="space-y-4">
        {teams.map(team => (
          <div key={team.id} className="bg-card border rounded-2xl overflow-hidden">
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => toggle(team.id)}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">{team.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {team.ageGroup ? `${team.ageGroup}` : ""}{team.category ? ` · ${team.category}` : ""}
                    {" · "}{team.players?.length ?? 0} atleti
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/parent/team/${team.id}`} onClick={e => e.stopPropagation()}>
                  <Badge variant="outline" className="text-xs cursor-pointer hover:bg-primary/10">Info squadra</Badge>
                </Link>
                {expanded[team.id] ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>

            {expanded[team.id] && (
              <div className="border-t">
                {team.nextTraining && (
                  <div className="px-4 py-3 bg-primary/5 border-b flex items-center gap-2 text-sm">
                    <CalendarDays className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-primary font-medium">Prossimo allenamento:</span>
                    <span className="text-muted-foreground">
                      {new Date(team.nextTraining.scheduledAt).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                )}
                {team.nextMatch && (
                  <div className="px-4 py-3 bg-amber-500/5 border-b flex items-center gap-2 text-sm">
                    <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-amber-500 font-medium">Prossima partita:</span>
                    <span className="text-muted-foreground">
                      vs {team.nextMatch.opponent} · {new Date(team.nextMatch.date).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })}
                    </span>
                  </div>
                )}

                {(!team.players || team.players.length === 0) ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">Nessun atleta in questa squadra.</div>
                ) : (
                  <div className="divide-y">
                    {team.players.map((player: any) => (
                      <div key={player.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                          {player.jerseyNumber ?? player.firstName[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{player.firstName} {player.lastName}</p>
                          <p className="text-xs text-muted-foreground">{player.position ?? "—"}</p>
                        </div>
                        <Badge variant={player.available ? "default" : "secondary"} className="text-xs">
                          {player.available ? "Disp." : "N/D"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
