import { useState, useEffect } from "react";
import { Trophy, MapPin, CalendarDays, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string) {
  const res = await fetch(`${BASE}/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: any }> = {
    scheduled: { label: "Programmata", variant: "outline" },
    played: { label: "Giocata", variant: "default" },
    cancelled: { label: "Annullata", variant: "destructive" },
    postponed: { label: "Rinviata", variant: "secondary" },
  };
  const s = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={s.variant} className="text-xs">{s.label}</Badge>;
}

export default function ParentMatches() {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    apiFetch("/parent/matches")
      .then(data => {
        setMatches(data);
        if (data.length > 0) setExpanded({ [data[0].teamId]: true });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  const grouped = matches.reduce<Record<string, { teamName: string; teamId: number; items: any[] }>>((acc, m) => {
    const key = String(m.teamId);
    if (!acc[key]) acc[key] = { teamName: m.teamName ?? `Squadra ${m.teamId}`, teamId: m.teamId, items: [] };
    acc[key].items.push(m);
    return acc;
  }, {});

  const groups = Object.values(grouped);

  function toggle(id: number) { setExpanded(prev => ({ ...prev, [id]: !prev[id] })); }

  if (groups.length === 0) return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">Partite</h1>
      <div className="text-center py-20 text-muted-foreground">
        <Trophy className="w-14 h-14 mx-auto mb-4 opacity-25" />
        <p className="font-semibold">Nessuna partita programmata</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Partite</h1>
        <p className="text-muted-foreground text-sm mt-1">{matches.length} partit{matches.length === 1 ? "a" : "e"} in totale</p>
      </div>

      <div className="space-y-4">
        {groups.map(group => (
          <div key={group.teamId} className="bg-card border rounded-2xl overflow-hidden">
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => toggle(group.teamId)}
            >
              <div className="flex items-center gap-3">
                <Trophy className="w-5 h-5 text-amber-500" />
                <div>
                  <p className="font-semibold">{group.teamName}</p>
                  <p className="text-xs text-muted-foreground">{group.items.length} partit{group.items.length === 1 ? "a" : "e"}</p>
                </div>
              </div>
              {expanded[group.teamId] ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>

            {expanded[group.teamId] && (
              <div className="border-t divide-y">
                {group.items.map(match => (
                  <div key={match.id} className="p-4 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          {match.homeAway === "home" ? "🏠 Casa" : "✈️ Trasferta"} — <span className="text-primary">vs {match.opponent}</span>
                        </p>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                          <CalendarDays className="w-3 h-3" />
                          {fmtDate(match.date)}
                        </div>
                        {match.venue && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MapPin className="w-3 h-3" />
                            {match.venue}
                          </div>
                        )}
                        {match.status === "played" && match.homeScore != null && match.awayScore != null && (
                          <p className="text-sm font-bold mt-1">{match.homeScore} – {match.awayScore}</p>
                        )}
                      </div>
                      <StatusBadge status={match.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
