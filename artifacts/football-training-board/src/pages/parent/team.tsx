import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Trophy, User, CalendarDays, MapPin, Clock } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string) {
  const res = await fetch(`${BASE}/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export default function ParentTeamInfo() {
  const { teamId } = useParams<{ teamId: string }>();
  const [team, setTeam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!teamId) return;
    apiFetch(`/parent/team/${teamId}`)
      .then(setTeam)
      .catch(() => setError("Non è possibile visualizzare questa squadra."))
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  if (error) return (
    <div className="text-center py-20 text-muted-foreground">
      <Trophy className="w-12 h-12 mx-auto mb-3 opacity-25" />
      <p>{error}</p>
    </div>
  );

  if (!team) return null;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Trophy className="w-7 h-7 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{team.name}</h1>
          {team.ageGroup && <p className="text-muted-foreground text-sm">{team.ageGroup} {team.category ? `· ${team.category}` : ""}</p>}
        </div>
      </div>

      {team.coaches && team.coaches.length > 0 && (
        <div className="bg-card border rounded-2xl p-5">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Allenatori</h2>
          <div className="space-y-3">
            {team.coaches.map((coach: any) => (
              <div key={coach.id} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center font-bold text-blue-500 text-sm">
                  {coach.firstName?.[0]}{coach.lastName?.[0]}
                </div>
                <div>
                  <p className="font-medium">{coach.firstName} {coach.lastName}</p>
                  <p className="text-xs text-muted-foreground">{coach.email}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {team.upcomingTraining && team.upcomingTraining.length > 0 && (
        <div className="bg-card border rounded-2xl p-5">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Prossimi Allenamenti</h2>
          <div className="space-y-3">
            {team.upcomingTraining.map((session: any) => (
              <div key={session.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <CalendarDays className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{session.title}</p>
                  <p className="text-sm text-primary">
                    {new Date(session.scheduledAt).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
                    {" · "}
                    {new Date(session.scheduledAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  {session.location && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{session.location}</span>
                    </div>
                  )}
                  {session.durationMinutes && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{session.durationMinutes} min</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(!team.coaches || team.coaches.length === 0) && (!team.upcomingTraining || team.upcomingTraining.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">Nessuna informazione aggiuntiva disponibile per questa squadra.</p>
        </div>
      )}
    </div>
  );
}
