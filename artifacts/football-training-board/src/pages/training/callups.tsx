import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { CalendarDays, Download, ExternalLink, Loader2, MapPin, Trophy, UsersRound } from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { withApi } from "@/lib/api-base";
import { downloadOrShareCallupPdf } from "@/lib/callup-pdf";
import { useGetMyClub } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

type ClubSection = "scuola_calcio" | "settore_giovanile" | "prima_squadra";

type MatchPlanData = {
  convocationAt?: string | null;
  convocationPlace?: string | null;
};

type Match = {
  id: number;
  opponent: string;
  date: string;
  competition?: string | null;
  location?: string | null;
  homeAway?: string | null;
  notes?: string | null;
  preMatchNotes?: string | null;
  teamId?: number | null;
  teamName?: string | null;
  matchPlan?: MatchPlanData | null;
};

type Team = {
  id: number;
  name: string;
  clubSection?: ClubSection | null;
};

type MatchCallup = {
  id: number;
  playerId: number;
  status?: string | null;
  playerName?: string | null;
};

const SECTION_LABELS: Record<ClubSection, string> = {
  scuola_calcio: "Scuola Calcio",
  settore_giovanile: "Settore Giovanile",
  prima_squadra: "Prima Squadra",
};

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(withApi(path), { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function matchPhase(match: Match): "autunnale" | "primaverile" | "tornei" | "amichevoli" {
  const comp = (match.competition ?? "").toLowerCase();
  if (["amichev", "friendly"].some((key) => comp.includes(key))) return "amichevoli";
  if (["torneo", "coppa", "trofeo", "cup"].some((key) => comp.includes(key))) return "tornei";
  const month = new Date(match.date).getMonth();
  return month >= 7 ? "autunnale" : "primaverile";
}

export default function TrainingCallupsPage({ section }: { section?: ClubSection }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [exportingMatchId, setExportingMatchId] = useState<number | null>(null);
  const { data: myClub } = useGetMyClub();
  const clubName = myClub?.name?.trim() || "Football Training Board";
  const scopeLabel = section ? SECTION_LABELS[section] : "Tutte le sezioni abilitate";

  const { data: matches = [], isLoading: matchesLoading } = useQuery<Match[]>({
    queryKey: ["/api/matches", "callup-summary"],
    queryFn: () => apiFetch<Match[]>("/api/matches"),
  });

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams", "callup-summary"],
    queryFn: () => apiFetch<Team[]>("/api/teams"),
  });

  const allowedTeamIds = useMemo(() => {
    if (!section) return null;
    return new Set(teams.filter((team) => team.clubSection === section).map((team) => team.id));
  }, [section, teams]);

  const candidateMatches = useMemo(() => {
    return matches
      .filter((match) => {
        if (allowedTeamIds && (!match.teamId || !allowedTeamIds.has(match.teamId))) return false;
        return Boolean(match.matchPlan?.convocationAt || match.matchPlan?.convocationPlace || match.teamId);
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [allowedTeamIds, matches]);

  const callupQueries = useQueries({
    queries: candidateMatches.map((match) => ({
      queryKey: ["/api/matches", match.id, "callups", "summary"],
      queryFn: () => apiFetch<MatchCallup[]>(`/api/matches/${match.id}/callups`),
      staleTime: 30_000,
    })),
  });

  const rows = useMemo(() => {
    return candidateMatches
      .map((match, index) => ({
        match,
        callups: callupQueries[index]?.data ?? [],
        loading: callupQueries[index]?.isLoading ?? false,
      }))
      .filter((row) => row.loading || row.callups.length > 0);
  }, [candidateMatches, callupQueries]);

  const isLoading = matchesLoading || callupQueries.some((query) => query.isLoading);
  const totalCallups = rows.reduce((sum, row) => sum + row.callups.length, 0);

  async function exportPdf(match: Match, callups: MatchCallup[]) {
    setExportingMatchId(match.id);
    try {
      const result = await downloadOrShareCallupPdf({
        match: {
          clubName,
          teamName: match.teamName,
          opponent: match.opponent,
          homeAway: match.homeAway,
          date: match.date,
          competition: match.competition,
          location: match.location,
          notes: match.notes,
          preMatchNotes: match.preMatchNotes,
          convocationAt: match.matchPlan?.convocationAt,
          convocationPlace: match.matchPlan?.convocationPlace,
        },
        players: callups.map((callup) => ({ playerName: callup.playerName })),
      });
      toast({
        title: "PDF convocazione generato",
        description: `Apertura/download avviato: ${result.filename}`,
      });
    } catch (error) {
      toast({
        title: "Export PDF non riuscito",
        description: error instanceof Error ? error.message : "Riprova dal browser o aggiorna la pagina.",
        variant: "destructive",
      });
    } finally {
      setExportingMatchId(null);
    }
  }

  function openMatch(match: Match) {
    if (!match.teamId) return;
    setLocation(`/calendari/${match.teamId}?openMatchId=${match.id}&phase=${matchPhase(match)}`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <UsersRound className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Convocazioni</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Riepilogo delle convocazioni generate dalla preparazione partita.
          </p>
        </div>
        <Badge variant="outline">{scopeLabel}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Partite con convocazione</p>
            <p className="text-2xl font-bold">{rows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Convocati totali</p>
            <p className="text-2xl font-bold">{totalCallups}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Area</p>
            <p className="text-lg font-semibold">{scopeLabel}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-primary" />
            Lista convocazioni partita
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="rounded-md border bg-muted/20 px-3 py-6 text-sm text-muted-foreground">Caricamento convocazioni...</div>
          ) : rows.length === 0 ? (
            <div className="rounded-md border bg-muted/20 px-3 py-6 text-sm text-muted-foreground">
              Nessuna convocazione partita trovata. Salva la rosa in “Preparazione partita” per farla comparire qui.
            </div>
          ) : (
            rows.map(({ match, callups }) => (
              <div key={match.id} className="rounded-md border bg-background px-3 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-bold">{match.teamName || "Squadra"}</p>
                      <span className="text-sm text-muted-foreground">vs</span>
                      <p className="text-base font-bold">{match.opponent}</p>
                      <Badge variant={match.homeAway === "away" ? "secondary" : "default"}>
                        {match.homeAway === "away" ? "Trasferta" : "Casa"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Gara: {formatDateTime(match.date)}
                      </span>
                      {match.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {match.location}
                        </span>
                      )}
                      {match.competition && (
                        <span className="flex items-center gap-1">
                          <Trophy className="h-3.5 w-3.5" />
                          {match.competition}
                        </span>
                      )}
                    </div>
                    <div className="rounded-md bg-muted/30 px-3 py-2 text-sm">
                      <p><span className="font-semibold">Convocazione:</span> {formatDateTime(match.matchPlan?.convocationAt)}</p>
                      <p><span className="font-semibold">Luogo convocazione:</span> {match.matchPlan?.convocationPlace || "-"}</p>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                      {callups.map((callup) => (
                        <div key={callup.id} className="rounded-md border bg-secondary px-2 py-1.5 text-sm font-medium leading-snug text-secondary-foreground">
                          {callup.playerName || `Giocatore ${callup.playerId}`}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      disabled={exportingMatchId === match.id}
                      onClick={() => exportPdf(match, callups)}
                    >
                      {exportingMatchId === match.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      {exportingMatchId === match.id ? "Esporto..." : "Export PDF"}
                    </Button>
                    <Button type="button" size="sm" className="gap-2" disabled={!match.teamId} onClick={() => openMatch(match)}>
                      <ExternalLink className="h-4 w-4" />
                      Apri preparazione
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
