import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, CalendarDays, BarChart3, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { withApi } from "@/lib/api-base";

type SectionKey = "settore_giovanile" | "prima_squadra";

type ChampionshipFixture = {
  id: number;
  round?: number | null;
  leg?: string | null;
  homeTeam: string;
  awayTeam: string;
  date?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  linkedResult?: string | null;
};

type ChampionshipStanding = {
  team: string;
  pg: number;
  v: number;
  n: number;
  p: number;
  gf: number;
  gs: number;
  dr: number;
  pts: number;
};

type ChampionshipGroup = {
  id: number;
  name: string;
  fixtures: ChampionshipFixture[];
  standings: ChampionshipStanding[];
};

type Championship = {
  id: number;
  title: string;
  category?: string | null;
  section: string;
  groups: ChampionshipGroup[];
};

const SECTION_LABELS: Record<SectionKey, string> = {
  settore_giovanile: "Settore Giovanile",
  prima_squadra: "Prima Squadra",
};

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(withApi(path), { credentials: "include" });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function scoreLabel(fixture: ChampionshipFixture) {
  if (fixture.homeScore == null || fixture.awayScore == null) return "-";
  return `${fixture.homeScore} - ${fixture.awayScore}`;
}

function fixtureTimeLabel(value?: string | null) {
  if (!value) return "Data da definire";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isClubTeam(teamName: string) {
  const value = normalize(teamName);
  return value.includes("fortis") || value.includes("juventus 1909");
}

function fixtureDateValue(fixture: ChampionshipFixture) {
  const time = fixture.date ? new Date(fixture.date).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function fixtureHasResult(fixture: ChampionshipFixture) {
  return fixture.homeScore != null && fixture.awayScore != null;
}

function fixtureRoundLabel(fixture: ChampionshipFixture) {
  const round = fixture.round ? `${fixture.round}ª giornata` : "Giornata";
  const leg = fixture.leg ? ` ${fixture.leg}` : "";
  return `${round}${leg}`;
}

function groupFixturesByRound(fixtures: ChampionshipFixture[]) {
  const groups = new Map<string, ChampionshipFixture[]>();
  for (const fixture of fixtures) {
    const key = `${fixture.leg ?? "fase"}-${fixture.round ?? "nd"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(fixture);
  }
  return Array.from(groups.entries()).map(([key, rows]) => ({
    key,
    label: fixtureRoundLabel(rows[0]),
    fixtures: rows.sort((a, b) => fixtureDateValue(a) - fixtureDateValue(b)),
  }));
}

function FixtureRow({ fixture }: { fixture: ChampionshipFixture }) {
  const clubInvolved = isClubTeam(fixture.homeTeam) || isClubTeam(fixture.awayTeam);
  return (
    <div
      className={cn(
        "grid gap-2 border-b py-3 text-sm last:border-b-0 sm:grid-cols-[140px_minmax(0,1fr)_70px]",
        clubInvolved && "bg-emerald-500/5 px-2 -mx-2 rounded-md border-b-transparent",
      )}
    >
      <div className="text-xs text-muted-foreground">{fixtureTimeLabel(fixture.date)}</div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("truncate", isClubTeam(fixture.homeTeam) && "font-semibold text-emerald-700 dark:text-emerald-300")}>
            {fixture.homeTeam}
          </span>
          <span className="text-muted-foreground">-</span>
          <span className={cn("truncate", isClubTeam(fixture.awayTeam) && "font-semibold text-emerald-700 dark:text-emerald-300")}>
            {fixture.awayTeam}
          </span>
        </div>
        {clubInvolved && <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Squadra del club</p>}
      </div>
      <div className="text-left font-semibold tabular-nums sm:text-right">{scoreLabel(fixture)}</div>
    </div>
  );
}

function StandingsTable({ standings }: { standings: ChampionshipStanding[] }) {
  if (standings.length === 0) {
    return <p className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">Classifica non ancora disponibile.</p>;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b text-xs uppercase text-muted-foreground">
            <th className="py-2 pr-2 text-left">#</th>
            <th className="py-2 pr-2 text-left">Squadra</th>
            <th className="py-2 text-right">PG</th>
            <th className="py-2 text-right">V</th>
            <th className="py-2 text-right">N</th>
            <th className="py-2 text-right">S</th>
            <th className="py-2 text-right">DR</th>
            <th className="py-2 text-right">P</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, index) => {
            const clubRow = isClubTeam(row.team);
            return (
              <tr key={row.team} className={cn("border-b last:border-b-0", clubRow && "bg-emerald-500/5")}>
                <td className="py-2 pr-2 text-muted-foreground">{index + 1}</td>
                <td className={cn("py-2 pr-2 font-medium", clubRow && "text-emerald-700 dark:text-emerald-300")}>{row.team}</td>
                <td className="py-2 text-right tabular-nums">{row.pg}</td>
                <td className="py-2 text-right tabular-nums">{row.v}</td>
                <td className="py-2 text-right tabular-nums">{row.n}</td>
                <td className="py-2 text-right tabular-nums">{row.p}</td>
                <td className="py-2 text-right tabular-nums">{row.dr > 0 ? `+${row.dr}` : row.dr}</td>
                <td className="py-2 text-right font-semibold tabular-nums">{row.pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChampionshipView({ championship, group }: { championship: Championship; group: ChampionshipGroup }) {
  const rounds = useMemo(() => groupFixturesByRound(group.fixtures), [group.fixtures]);
  const now = Date.now();
  const upcomingFixtures = group.fixtures
    .filter((fixture) => !fixtureHasResult(fixture) && fixtureDateValue(fixture) >= now)
    .sort((a, b) => fixtureDateValue(a) - fixtureDateValue(b))
    .slice(0, 6);
  const latestResults = group.fixtures
    .filter(fixtureHasResult)
    .sort((a, b) => fixtureDateValue(b) - fixtureDateValue(a))
    .slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">{championship.title}</h2>
          <p className="text-sm text-muted-foreground">{group.name}{championship.category ? ` · ${championship.category}` : ""}</p>
        </div>
        <Badge variant="outline">{group.fixtures.length} partite</Badge>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.8fr)]">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-primary" />
              Calendario Girone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {rounds.length === 0 ? (
              <p className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">Nessuna gara inserita nel girone.</p>
            ) : (
              rounds.map((round) => (
                <section key={round.key}>
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground">{round.label}</h3>
                  </div>
                  <div className="rounded-md border bg-background px-3">
                    {round.fixtures.map((fixture) => <FixtureRow key={fixture.id} fixture={fixture} />)}
                  </div>
                </section>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-primary" />
                Classifica
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StandingsTable standings={group.standings} />
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-primary" />
                Prossima Giornata
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingFixtures.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessuna gara futura da mostrare.</p>
              ) : (
                <div className="space-y-2">
                  {upcomingFixtures.map((fixture) => <FixtureRow key={fixture.id} fixture={fixture} />)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Ultimi Risultati
              </CardTitle>
            </CardHeader>
            <CardContent>
              {latestResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun risultato inserito.</p>
              ) : (
                <div className="space-y-2">
                  {latestResults.map((fixture) => <FixtureRow key={fixture.id} fixture={fixture} />)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function SectionChampionshipsPage({ section }: { section: SectionKey }) {
  const [selectedKey, setSelectedKey] = useState("");
  const { data: championships = [], isLoading, error } = useQuery<Championship[]>({
    queryKey: ["/api/championships", section, "page"],
    queryFn: () => apiFetch(`/api/championships?section=${section}`),
  });

  const groupOptions = useMemo(
    () => championships.flatMap((championship) => championship.groups.map((group) => ({ championship, group, key: `${championship.id}:${group.id}` }))),
    [championships],
  );
  const activeOption = groupOptions.find((option) => option.key === selectedKey) ?? groupOptions[0] ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            <Badge variant="secondary">{SECTION_LABELS[section]}</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Campionati e Classifiche</h1>
          <p className="text-sm text-muted-foreground">Calendario completo del girone, prossima giornata, risultati e classifica.</p>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">Caricamento campionati...</CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-10 text-center text-destructive">Errore nel caricamento dei campionati.</CardContent>
        </Card>
      ) : !activeOption ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nessun campionato disponibile. Puoi importarli o crearli dalla pagina Partite della sezione.
          </CardContent>
        </Card>
      ) : (
        <>
          {groupOptions.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {groupOptions.map((option) => (
                <Button
                  key={option.key}
                  type="button"
                  size="sm"
                  variant={option.key === activeOption.key ? "default" : "outline"}
                  onClick={() => setSelectedKey(option.key)}
                  className="shrink-0"
                >
                  {option.championship.title} · {option.group.name}
                </Button>
              ))}
            </div>
          )}
          <ChampionshipView championship={activeOption.championship} group={activeOption.group} />
        </>
      )}
    </div>
  );
}
