import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, ArrowRight, Users } from "lucide-react";
import TeamCalendar from "@/pages/calendari/TeamCalendar";

interface Team { id: number; name: string; category?: string; assignedStaff?: { userId: number }[]; }

const SECTION_LABEL: Record<string, string> = {
  scuola_calcio:     "Scuola Calcio",
  settore_giovanile: "Settore Giovanile",
  prima_squadra:     "Prima Squadra",
};

async function apiFetch(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function SectionMatchCalendars({ section }: { section: string }) {
  const { role, user } = useAuth();
  const [, navigate] = useLocation();

  const { data: sectionTeams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams", section],
    queryFn: () => apiFetch(`/api/teams?section=${section}`),
  });

  const isManagement = ["admin", "director", "secretary"].includes(role ?? "");
  const isStaff = ["coach", "fitness_coach", "athletic_director", "technical_director"].includes(role ?? "");

  if (isManagement) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            Calendari Partite — {SECTION_LABEL[section]}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Seleziona un'annata per vedere il calendario gare
          </p>
        </div>

        {sectionTeams.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Nessuna squadra trovata per questa sezione.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sectionTeams.map(team => (
              <button
                key={team.id}
                onClick={() => navigate(`/calendari/${team.id}`)}
                className="group text-left"
              >
                <Card className="hover:shadow-lg hover:border-primary/40 transition-all cursor-pointer h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-sm group-hover:bg-primary/20 transition-colors shrink-0">
                        {team.name.substring(0, 2).toUpperCase()}
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <CardTitle className="text-base mt-3 leading-tight">{team.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        🍂 Fase Autunnale
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        🌸 Fase Primaverile
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        🏆 Tornei
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      Clicca per aprire il calendario
                    </p>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (isStaff) {
    const myTeam = sectionTeams.find(t =>
      Array.isArray(t.assignedStaff) && t.assignedStaff.some(s => s.userId === user?.id)
    );

    if (!myTeam) {
      return (
        <div className="p-6 max-w-4xl mx-auto">
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground flex flex-col items-center gap-3">
              <Trophy className="w-12 h-12 opacity-20" />
              <p className="text-sm">Nessuna squadra assegnata in questa sezione.</p>
            </CardContent>
          </Card>
        </div>
      );
    }

    return <TeamCalendar overrideTeamId={myTeam.id} />;
  }

  return null;
}
