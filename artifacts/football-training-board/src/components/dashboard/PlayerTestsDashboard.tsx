import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { Link } from "wouter";
import { customFetch } from "@workspace/api-client-react/custom-fetch";
import { FITNESS_DASHBOARD_ROLES, type MotorTestSession } from "@workspace/api-zod";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";

type TestResult = {
  id: number;
  playerName: string;
  birthYear?: string;
  date: string;
  endurance: number | null;
  strength: number | null;
  speed: number | null;
};

const formatDate = (date: string) => new Date(date + "T00:00:00").toLocaleDateString("it-IT", {
  day: "numeric", month: "short", year: "numeric",
});

export function PlayerTestsDashboard({ role, scopeLabel, section, teamId }: {
  role: string; scopeLabel: string; section?: string | null; teamId?: number | null;
}) {
  const { club, user } = useAuth();
  const allowed = FITNESS_DASHBOARD_ROLES.includes(role);
  const filters = new URLSearchParams();
  if (section) filters.set("section", section);
  if (teamId) filters.set("teamId", String(teamId));
  const search = filters.toString();
  const motors=useQuery({queryKey:["/api/motor-tests",club?.id,user?.id,role],queryFn:()=>customFetch<{teams:{id:number;name:string;clubSection?:string}[];sessions:MotorTestSession[]}>("/api/motor-tests"),enabled:allowed&&!!user});
  const motorTeams=(motors.data?.teams??[]).filter(team=>(!teamId||team.id===teamId)&&(!section||team.clubSection===section.replace(/-/g,"_")));
  const motorSessions=(motors.data?.sessions??[]).filter(session=>motorTeams.some(team=>team.id===session.teamId));
  const tests = useQuery({
    queryKey: ["/api/player-fitness-data", "dashboard", club?.id, user?.id, role, search],
    queryFn: () => customFetch<{ total: number; entries: TestResult[] }>(
      "/api/player-fitness-data?view=dashboard" + (search ? "&" + search : "")),
    enabled: allowed && !!user,
  });
  if (!allowed) return null;

  return <Card><CardContent className="space-y-2 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-primary" aria-hidden="true" />Test giocatori</h2>
        <p className="mt-1 text-xs text-muted-foreground">{scopeLabel}</p>
      </div>
      <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">Sola lettura</span>
    </div>
    {!!motorSessions.length&&<><p className="text-sm font-medium">{motorSessions.length} sessioni di test motori</p><ul className="divide-y">{motorSessions.slice(0,3).map(session=><li key={session.id} className="py-2 text-sm"><Link className="text-primary underline" href={"/player-performance?view=tests&motorSession="+session.id}>{motorTeams.find(team=>team.id===session.teamId)?.name} · {formatDate(session.date)}</Link><p className="text-xs text-muted-foreground">{Object.keys(session.results).length} giocatori con rilevazioni</p></li>)}</ul></>}
    {tests.isPending || motors.isPending ? <p role="status" className="text-sm text-muted-foreground">Caricamento test…</p>
      : tests.isError || motors.isError ? <p role="alert" className="text-sm text-muted-foreground">Risultati non disponibili.{" "}
        <button type="button" className="underline" onClick={() => {void tests.refetch();void motors.refetch();}}>Riprova</button></p>
      : tests.data.entries.length === 0 ? !motorSessions.length&&<p className="text-sm text-muted-foreground">Nessun test registrato.</p>
      : <>
        <p className="text-xs text-muted-foreground">{tests.data.total} {tests.data.total === 1 ? "test registrato" : "test registrati"} · Ultimo test {formatDate(tests.data.entries[0].date)}</p>
        <ul className="divide-y">
          {tests.data.entries.map(test => <li key={test.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm">
            <div>
              <p className="font-medium">{test.playerName}</p>
              <p className="text-xs text-muted-foreground">{[test.birthYear, formatDate(test.date)].filter(Boolean).join(" · ")}</p>
            </div>
            <p className="text-xs tabular-nums">{[
              test.endurance != null && "Resistenza " + test.endurance + "/100",
              test.strength != null && "Forza " + test.strength + "/100",
              test.speed != null && "Velocità " + test.speed + "/100",
            ].filter(Boolean).join(" · ") || "Nessun punteggio registrato"}</p>
          </li>)}
        </ul>
        <Link href={"/player-performance?view=tests" + (search ? "&" + search : "")} className="inline-block text-sm font-medium text-primary hover:underline">Vedi tutti i risultati</Link>
      </>}
    <Link href={"/player-performance?view=tests"+(search?"&"+search:"")} className="inline-block text-sm font-medium text-primary hover:underline">Apri test e crescita</Link>
  </CardContent></Card>;
}
