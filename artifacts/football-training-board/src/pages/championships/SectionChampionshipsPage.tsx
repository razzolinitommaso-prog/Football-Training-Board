import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trophy, CalendarDays, BarChart3, Clock, CheckCircle2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
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

type LndPreview = {
  title: string;
  category?: string | null;
  groupName: string;
  fixtures: ChampionshipFixture[];
  standings: ChampionshipStanding[];
  rawLineCount: number;
};

type SectionMatch = {
  id: number;
  opponent: string;
  date: string;
  homeAway?: string | null;
  result?: string | null;
  teamId?: number | null;
  teamName?: string | null;
  competition?: string | null;
  location?: string | null;
};

const SECTION_LABELS: Record<SectionKey, string> = {
  settore_giovanile: "Settore Giovanile",
  prima_squadra: "Prima Squadra",
};

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(withApi(path), {
    ...options,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text || `Errore ${response.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string };
      message = parsed.error || parsed.message || message;
    } catch {
      // Mantiene il testo originale quando la risposta non e JSON.
    }
    throw new Error(message);
  }
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

function parseResult(value?: string | null): { homeScore: number; awayScore: number } | null {
  const match = String(value ?? "").match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!match) return null;
  const homeScore = Number(match[1]);
  const awayScore = Number(match[2]);
  return Number.isFinite(homeScore) && Number.isFinite(awayScore) ? { homeScore, awayScore } : null;
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

function buildFallbackChampionships(matches: SectionMatch[], section: SectionKey): Championship[] {
  const championshipMatches = matches
    .filter((match) => Number(match.teamId) > 0)
    .filter((match) => normalize(match.competition ?? "").includes("campionato"))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const groups = new Map<string, SectionMatch[]>();
  for (const match of championshipMatches) {
    const key = `${match.teamId ?? "team"}|${normalize(match.competition || "Campionato")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(match);
  }

  return Array.from(groups.values()).map((rows, index) => {
    const first = rows[0];
    const title = first.teamName ? `Campionato ${first.teamName}` : "Campionato";
    const fixtures = rows.map((match, fixtureIndex) => {
      const score = parseResult(match.result);
      const teamName = match.teamName || "Squadra del club";
      const homeAway = String(match.homeAway ?? "").toLowerCase();
      const isHome = homeAway === "home" || homeAway === "casa";
      return {
        id: -Math.abs(match.id || fixtureIndex + 1),
        round: fixtureIndex + 1,
        leg: fixtureIndex < Math.ceil(rows.length / 2) ? "andata" : "ritorno",
        homeTeam: isHome ? teamName : match.opponent,
        awayTeam: isHome ? match.opponent : teamName,
        date: match.date,
        homeScore: score?.homeScore ?? null,
        awayScore: score?.awayScore ?? null,
        linkedResult: match.result ?? null,
      } satisfies ChampionshipFixture;
    });

    return {
      id: -(index + 1),
      title,
      category: "Vista provvisoria da calendario squadra",
      section,
      groups: [
        {
          id: -(index + 1),
          name: first.competition || "Girone",
          fixtures,
          standings: [],
        },
      ],
    };
  });
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
        <div className="flex flex-wrap items-center gap-2">
          {championship.id < 0 && <Badge variant="secondary">Da calendario squadra</Badge>}
          <Badge variant="outline">{group.fixtures.length} partite</Badge>
        </div>
      </div>

      {championship.id < 0 && (
        <div className="rounded-md border bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          Vista provvisoria costruita dalle partite gia presenti nel calendario squadra. Il girone completo e la classifica reale arriveranno quando importeremo o sincronizzeremo tutte le gare del campionato.
        </div>
      )}

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

function LndSyncDialog({ section, open, onOpenChange }: { section: SectionKey; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<LndPreview | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const previewMutation = useMutation({
    mutationFn: () => apiFetch<LndPreview>("/api/championships/lnd/preview", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
    onSuccess: (data) => {
      setPreview(data);
      toast({
        title: "Anteprima LND pronta",
        description: `${data.fixtures.length} partite e ${data.standings.length} righe classifica riconosciute.`,
      });
    },
    onError: (e: Error) => {
      setPreview(null);
      toast({ title: e.message || "Errore lettura LND", variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => apiFetch<{ created: number; updated: number }>("/api/championships/lnd/sync", {
      method: "POST",
      body: JSON.stringify({ section, url }),
    }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/championships", section, "page"] });
      setPreview(null);
      setUrl("");
      onOpenChange(false);
      toast({
        title: "Sync LND completata",
        description: `${data.created} partite create, ${data.updated} aggiornate.`,
      });
    },
    onError: (e: Error) => toast({ title: e.message || "Errore sync LND", variant: "destructive" }),
  });

  const canPreview = url.trim().startsWith("https://gare.lnd.it/");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sincronizza da Gare LND</DialogTitle>
          <DialogDescription>
            Incolla il link del girone o della giornata. Prima leggiamo l'anteprima, poi aggiorniamo campionato, calendario completo e risultati.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lnd-url">URL Gare LND</Label>
            <Input
              id="lnd-url"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setPreview(null);
              }}
              placeholder="https://gare.lnd.it/competizione/toscana?campionato=A2&giornata=1&girone=B&leg=first&stagione=2026"
            />
          </div>

          {preview && (
            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
              <div>
                <p className="font-semibold">{preview.title}</p>
                <p className="text-sm text-muted-foreground">{preview.groupName}{preview.category ? ` · ${preview.category}` : ""}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-md border bg-background p-2">
                  <p className="text-2xl font-bold">{preview.fixtures.length}</p>
                  <p className="text-xs text-muted-foreground">Partite riconosciute</p>
                </div>
                <div className="rounded-md border bg-background p-2">
                  <p className="text-2xl font-bold">{preview.standings.length}</p>
                  <p className="text-xs text-muted-foreground">Righe classifica</p>
                </div>
                <div className="rounded-md border bg-background p-2">
                  <p className="text-2xl font-bold">{preview.rawLineCount}</p>
                  <p className="text-xs text-muted-foreground">Righe lette</p>
                </div>
              </div>
              {preview.fixtures.length > 0 && (
                <div className="max-h-52 overflow-auto rounded-md border bg-background">
                  {preview.fixtures.slice(0, 8).map((fixture) => (
                    <div key={fixture.id ?? `${fixture.homeTeam}-${fixture.awayTeam}`} className="border-b px-3 py-2 text-sm last:border-b-0">
                      <span className="font-medium">{fixture.homeTeam} - {fixture.awayTeam}</span>
                      <span className="ml-2 text-muted-foreground">{fixtureTimeLabel(fixture.date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => previewMutation.mutate()} disabled={!canPreview || previewMutation.isPending || syncMutation.isPending}>
            {previewMutation.isPending ? "Lettura..." : "Leggi anteprima"}
          </Button>
          <Button type="button" onClick={() => syncMutation.mutate()} disabled={!preview || syncMutation.isPending || previewMutation.isPending}>
            {syncMutation.isPending ? "Sincronizzo..." : "Sincronizza girone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SectionChampionshipsPage({ section }: { section: SectionKey }) {
  const [selectedKey, setSelectedKey] = useState("");
  const [syncOpen, setSyncOpen] = useState(false);
  const { data: championships = [], isLoading, error } = useQuery<Championship[], Error>({
    queryKey: ["/api/championships", section, "page"],
    queryFn: () => apiFetch(`/api/championships?section=${section}`),
    retry: 1,
  });
  const { data: sectionMatches = [], isLoading: isMatchesLoading } = useQuery<SectionMatch[], Error>({
    queryKey: ["/api/matches", section, "championship-fallback"],
    queryFn: () => apiFetch(`/api/matches?section=${section}`),
    enabled: !isLoading && !error && championships.length === 0,
    retry: 1,
  });

  const fallbackChampionships = useMemo(
    () => championships.length > 0 ? [] : buildFallbackChampionships(sectionMatches, section),
    [championships.length, sectionMatches, section],
  );
  const displayedChampionships = championships.length > 0 ? championships : fallbackChampionships;

  const groupOptions = useMemo(
    () => displayedChampionships.flatMap((championship) => championship.groups.map((group) => ({ championship, group, key: `${championship.id}:${group.id}` }))),
    [displayedChampionships],
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
        <Button type="button" className="gap-2" onClick={() => setSyncOpen(true)}>
          <RefreshCw className="h-4 w-4" />
          Sincronizza LND
        </Button>
      </div>

      <LndSyncDialog section={section} open={syncOpen} onOpenChange={setSyncOpen} />

      {isLoading || isMatchesLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">Caricamento campionati...</CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <p className="font-medium text-destructive">Errore nel caricamento dei campionati.</p>
            <p className="mx-auto max-w-2xl text-sm text-muted-foreground">
              La pagina e pronta, ma la rotta API dei campionati non ha restituito dati validi. Puoi continuare a usare la pagina Partite mentre sistemiamo il collegamento dati.
            </p>
            <p className="mx-auto max-w-2xl rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
              {error.message.slice(0, 240)}
            </p>
            <Button type="button" variant="outline" onClick={() => { window.location.href = section === "settore_giovanile" ? "/settore-giovanile/matches" : "/prima-squadra/matches"; }}>
              Apri gestione partite
            </Button>
          </CardContent>
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
