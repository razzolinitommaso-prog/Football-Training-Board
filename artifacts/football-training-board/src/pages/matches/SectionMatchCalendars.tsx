import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trophy, ArrowRight, Users, Upload, Download, FileSpreadsheet, FileText, Trash2, BarChart3, Plus, Save } from "lucide-react";
import {
  downloadMatchCalendarTemplate,
  exportMatchesToExcel,
  parseMatchCalendarExcelFile,
  mapExcelRowToMatch,
  type MatchImportRow,
} from "@/lib/match-calendar-excel";
import {
  parseMatchCalendarPdfFile,
  buildPdfImportSearchTerms,
  discoverPdfSectionTitles,
  isGenericPdfCategoryHint,
} from "@/lib/match-calendar-pdf";
import { findImportDuplicateConflicts, matchImportFingerprint } from "@/lib/match-import-conflicts";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { format } from "date-fns";
import { withApi } from "@/lib/api-base";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGetMyClub } from "@workspace/api-client-react";

interface Team { id: number; name: string; category?: string; clubSection?: string | null; assignedStaff?: { userId: number }[]; }

const DEFAULT_CLUB_LABEL = "Gavinana Firenze";

type MatchRow = {
  id: number;
  opponent: string;
  date: string;
  homeAway: string;
  teamId?: number | null;
  teamName?: string | null;
  competition?: string | null;
  location?: string | null;
  notes?: string | null;
  result?: string | null;
};

type SectorYouthImportRow = MatchImportRow & {
  teamId: number;
  teamName: string;
  sourceSection: string;
};

type ChampionshipFixture = {
  id: number;
  round?: number | null;
  leg?: string | null;
  homeTeam: string;
  awayTeam: string;
  date?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  matchId?: number | null;
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
  teamId?: number | null;
  groups: ChampionshipGroup[];
};

const YOUTH_FEDERAL_SECTION_MAP = [
  {
    teamAliases: ["allievi a", "alievi a", "under 17", "u17"],
    sectionTitle: "UNDER 17 ALLIEVI FIRENZE",
    label: "U17 / Allievi A",
  },
  {
    teamAliases: ["allievi b", "alievi b", "under 16", "u16"],
    sectionTitle: "UNDER 16 ALLIEVI B FIRENZE",
    label: "U16 / Allievi B",
  },
  {
    teamAliases: ["giovanissimi a", "under 15", "u15"],
    sectionTitle: "UNDER 15 GIOVANISSIMI FIRENZE",
    label: "U15 / Giovanissimi A",
  },
  {
    teamAliases: ["giovanissimi b", "under 14", "u14"],
    sectionTitle: "UNDER 14 GIOVANISSIMI B FIRENZE",
    label: "U14 / Giovanissimi B",
  },
];

function normalizeLocalName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function findYouthTeamForOfficialSection(teams: Team[], aliases: string[]): Team | null {
  const normalizedAliases = aliases.map(normalizeLocalName);
  return teams.find((team) => {
    const candidates = [team.name, team.category].map(normalizeLocalName).filter(Boolean);
    return candidates.some((candidate) =>
      normalizedAliases.some((alias) => candidate === alias || candidate.includes(alias)),
    );
  }) ?? null;
}

function scoreDisplay(fixture: ChampionshipFixture): string {
  if (fixture.homeScore == null || fixture.awayScore == null) return "-";
  return `${fixture.homeScore}-${fixture.awayScore}`;
}

function fixtureDateDisplay(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : format(date, "dd/MM/yyyy HH:mm");
}

function ChampionshipSectionPanel({ section, teams }: { section: string; teams: Team[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [groupName, setGroupName] = useState("Girone");
  const [teamId, setTeamId] = useState<string>("all");
  const [fixtureDrafts, setFixtureDrafts] = useState<Record<number, { homeScore: string; awayScore: string }>>({});

  const { data: championships = [], isLoading } = useQuery<Championship[]>({
    queryKey: ["/api/championships", section],
    queryFn: () => apiFetch(`/api/championships?section=${section}`),
    enabled: section !== "scuola_calcio",
  });

  const createChampionshipMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/championships", {
        method: "POST",
        body: JSON.stringify({
          title,
          section,
          groupName,
          teamId: teamId === "all" ? null : Number(teamId),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/championships", section] });
      setCreateOpen(false);
      setTitle("");
      setGroupName("Girone");
      setTeamId("all");
      toast({ title: "Campionato creato" });
    },
    onError: (e: Error) => toast({ title: e.message || "Errore creazione campionato", variant: "destructive" }),
  });

  const updateFixtureResultMutation = useMutation({
    mutationFn: ({ fixtureId, homeScore, awayScore }: { fixtureId: number; homeScore: string; awayScore: string }) =>
      apiFetch(`/api/championship-fixtures/${fixtureId}/result`, {
        method: "PATCH",
        body: JSON.stringify({ homeScore, awayScore }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/championships", section] });
      toast({ title: "Risultato aggiornato" });
    },
    onError: (e: Error) => toast({ title: e.message || "Errore risultato campionato", variant: "destructive" }),
  });

  if (section === "scuola_calcio") return null;

  return (
    <Card className="border-emerald-500/20 bg-emerald-500/5">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-emerald-600" />
              Campionati e classifiche gironi
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Area separata dal calendario squadra: qui vivranno gironi, risultati delle altre squadre e classifiche.
            </p>
          </div>
          <Button type="button" size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Nuovo campionato
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="rounded-md border bg-background/70 p-3 text-sm text-muted-foreground">Caricamento campionati...</div>
        ) : championships.length === 0 ? (
          <div className="rounded-md border bg-background/70 p-4 text-sm text-muted-foreground">
            Nessun campionato creato. Il calendario squadra resta invariato; nel prossimo passo collegheremo il parser PDF a questa area.
          </div>
        ) : (
          championships.map((championship) => (
            <div key={championship.id} className="rounded-md border bg-background/80 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{championship.title}</p>
                  {championship.category && <p className="text-xs text-muted-foreground">{championship.category}</p>}
                </div>
                <Badge variant="outline">{championship.groups.length} gironi</Badge>
              </div>
              <div className="mt-3 space-y-3">
                {championship.groups.map((group) => (
                  <div key={group.id} className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                    <div className="rounded-md border bg-muted/20 p-2">
                      <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Risultati {group.name}</p>
                      {group.fixtures.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nessuna partita girone inserita.</p>
                      ) : (
                        <div className="space-y-2">
                          {group.fixtures.slice(0, 8).map((fixture) => {
                            const draft = fixtureDrafts[fixture.id] ?? {
                              homeScore: fixture.homeScore == null ? "" : String(fixture.homeScore),
                              awayScore: fixture.awayScore == null ? "" : String(fixture.awayScore),
                            };
                            return (
                              <div key={fixture.id} className="rounded border bg-background p-2 text-xs">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-medium">{fixture.homeTeam} - {fixture.awayTeam}</span>
                                  <span className="text-muted-foreground">{fixtureDateDisplay(fixture.date)}</span>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <Input
                                    inputMode="numeric"
                                    className="h-8 w-16"
                                    value={draft.homeScore}
                                    onChange={(e) => setFixtureDrafts((prev) => ({ ...prev, [fixture.id]: { ...draft, homeScore: e.target.value } }))}
                                    placeholder="Casa"
                                  />
                                  <span className="text-muted-foreground">-</span>
                                  <Input
                                    inputMode="numeric"
                                    className="h-8 w-16"
                                    value={draft.awayScore}
                                    onChange={(e) => setFixtureDrafts((prev) => ({ ...prev, [fixture.id]: { ...draft, awayScore: e.target.value } }))}
                                    placeholder="Trasf."
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 gap-1"
                                    disabled={updateFixtureResultMutation.isPending}
                                    onClick={() => updateFixtureResultMutation.mutate({ fixtureId: fixture.id, ...draft })}
                                  >
                                    <Save className="h-3.5 w-3.5" />
                                    Salva
                                  </Button>
                                  <span className="ml-auto text-muted-foreground">Ris. {scoreDisplay(fixture)}</span>
                                </div>
                              </div>
                            );
                          })}
                          {group.fixtures.length > 8 && (
                            <p className="text-xs text-muted-foreground">Mostrate 8 partite su {group.fixtures.length}. La lista completa arrivera nel passo parser/UI avanzata.</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="rounded-md border bg-muted/20 p-2">
                      <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Classifica {group.name}</p>
                      {group.standings.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Classifica pronta: apparira quando ci saranno squadre nel girone.</p>
                      ) : (
                        <div className="overflow-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b text-muted-foreground">
                                <th className="py-1 text-left">Squadra</th>
                                <th className="py-1 text-right">Pt</th>
                                <th className="py-1 text-right">PG</th>
                                <th className="py-1 text-right">DR</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.standings.map((row) => (
                                <tr key={row.team} className="border-b last:border-b-0">
                                  <td className="py-1 pr-2 font-medium">{row.team}</td>
                                  <td className="py-1 text-right font-semibold">{row.pts}</td>
                                  <td className="py-1 text-right">{row.pg}</td>
                                  <td className="py-1 text-right">{row.dr}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo campionato</DialogTitle>
            <DialogDescription>
              Crea il contenitore del campionato. Le partite del girone verranno collegate dal parser nel passo successivo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Titolo campionato</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Campionato U17 - Allievi A" />
            </div>
            <div className="space-y-1">
              <Label>Nome girone</Label>
              <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Es. Girone B" />
            </div>
            <div className="space-y-1">
              <Label>Squadra collegata (facoltativa)</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                <option value="all">Nessuna squadra specifica</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Annulla</Button>
            <Button type="button" disabled={!title.trim() || createChampionshipMutation.isPending} onClick={() => createChampionshipMutation.mutate()}>
              Crea campionato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function MatchCalendarTeamCard({
  team,
  section,
  navigate,
}: {
  team: Team;
  section: string;
  navigate: (to: string) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: myClub } = useGetMyClub();
  const clubLabel = myClub?.name?.trim() || DEFAULT_CLUB_LABEL;
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfFileRef = useRef<HTMLInputElement>(null);
  const pdfKeepPendingWhilePickerRef = useRef(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState<MatchImportRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<boolean[]>([]);
  const [previewSource, setPreviewSource] = useState<"excel" | "pdf">("excel");
  const [pdfFilterOpen, setPdfFilterOpen] = useState(false);
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const [pdfCategoryFilter, setPdfCategoryFilter] = useState("");
  const [pdfClubFilter, setPdfClubFilter] = useState("");
  const [pdfDiscovering, setPdfDiscovering] = useState(false);
  const [pdfSectionPickerOpen, setPdfSectionPickerOpen] = useState(false);
  const [pdfSectionCandidates, setPdfSectionCandidates] = useState<string[]>([]);
  const [pdfSectionChoice, setPdfSectionChoice] = useState("");
  const [duplicateImportOpen, setDuplicateImportOpen] = useState(false);
  const [pendingImportRows, setPendingImportRows] = useState<MatchImportRow[] | null>(null);
  const [pendingImportConflictIds, setPendingImportConflictIds] = useState<number[]>([]);
  const [duplicateImportExamples, setDuplicateImportExamples] = useState<string[]>([]);

  const { data: teamMatches = [] } = useQuery<MatchRow[]>({
    queryKey: ["/api/matches", team.id],
    queryFn: () => apiFetch(`/api/matches?teamId=${team.id}`),
  });
  const now = Date.now();
  const { previousMatch, nextMatch } = useMemo(() => {
    const sorted = [...teamMatches]
      .filter((match) => match.date && !Number.isNaN(new Date(match.date).getTime()))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const previous = [...sorted].reverse().find((match) => new Date(match.date).getTime() < now) ?? null;
    const next = sorted.find((match) => new Date(match.date).getTime() >= now) ?? null;
    return { previousMatch: previous, nextMatch: next };
  }, [teamMatches, now]);

  function previewMatchLine(match: MatchRow | null) {
    if (!match) return "Nessuna partita";
    const date = new Date(match.date);
    const formatted = Number.isNaN(date.getTime()) ? "" : format(date, "dd/MM HH:mm");
    const place = match.homeAway === "home" ? "Casa" : "Trasferta";
    return `${formatted} vs ${match.opponent} · ${place}${match.result ? ` · ${match.result}` : ""}`;
  }

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const rows = await parseMatchCalendarExcelFile(file);
      const recognized: MatchImportRow[] = [];
      for (const row of rows) {
        const m = mapExcelRowToMatch(row);
        if (m) recognized.push(m);
      }
      return { recognized, total: rows.length };
    },
    onSuccess: ({ recognized, total }) => {
      if (recognized.length === 0) {
        toast({
          title: "Nessuna partita riconosciuta",
          description: `Righe analizzate: ${total}.`,
          variant: "destructive",
        });
        return;
      }
      setPreviewSource("excel");
      setPreviewRows(recognized);
      setSelectedRows(recognized.map(() => true));
      setPreviewOpen(true);
    },
    onError: (e: Error) => toast({ title: e.message || "Errore analisi file", variant: "destructive" }),
  });

  const importPdfMutation = useMutation({
    mutationFn: async (input: {
      file: File;
      searchTerms: string[];
      clubHint: string;
      sectionTitleHints: string[];
      societyHint: string;
    }) => {
      return parseMatchCalendarPdfFile(input.file, {
        teamName: team.name,
        clubName: input.clubHint.trim() || clubLabel,
        searchTerms: input.searchTerms,
        sectionTitleHints: input.sectionTitleHints,
        societyHint: input.societyHint,
      });
    },
    onSuccess: (parsed) => {
      if (parsed.recognized.length === 0) {
        toast({
          title: "Nessuna partita riconosciuta nel PDF",
          description: `Righe con data analizzate: ${parsed.totalDateLines}. Prova altri termini di ricerca.`,
          variant: "destructive",
        });
        return;
      }
      setPreviewSource("pdf");
      setPreviewRows(parsed.recognized);
      setSelectedRows(parsed.recognized.map(() => true));
      setPreviewOpen(true);
    },
    onError: (e: Error) => toast({ title: e.message || "Errore analisi PDF", variant: "destructive" }),
    onSettled: () => {
      setPendingPdfFile(null);
      setPdfSectionPickerOpen(false);
      setPdfSectionCandidates([]);
      setPdfSectionChoice("");
    },
  });

  const applyImportMutation = useMutation({
    mutationFn: async (input: { rows: MatchImportRow[]; replaceConflictIds?: number[] }) => {
      const { rows, replaceConflictIds } = input;
      if (replaceConflictIds?.length) {
        for (const id of replaceConflictIds) {
          await apiFetch(`/api/matches/${id}`, { method: "DELETE" });
        }
      }
      let ok = 0;
      for (const m of rows) {
        await apiFetch("/api/matches", {
          method: "POST",
          body: JSON.stringify({
            opponent: m.opponent,
            date: m.date,
            teamId: team.id,
            homeAway: m.homeAway,
            competition: m.competition ?? undefined,
            location: m.location ?? undefined,
            notes: m.notes ?? undefined,
          }),
        });
        ok++;
      }
      return ok;
    },
    onSuccess: (ok) => {
      qc.invalidateQueries({ queryKey: ["/api/matches"] });
      setPreviewOpen(false);
      setDuplicateImportOpen(false);
      setPendingImportRows(null);
      setPendingImportConflictIds([]);
      setDuplicateImportExamples([]);
      toast({
        title: "Import completato",
        description: `${ok} partite importate (${previewSource.toUpperCase()}).`,
      });
    },
    onError: (e: Error) => toast({ title: e.message || "Errore import", variant: "destructive" }),
  });

  async function handleExport() {
    try {
      const data = (await apiFetch(`/api/matches?teamId=${team.id}`)) as MatchRow[];
      exportMatchesToExcel(data, team.name);
      toast({ title: "Export avviato" });
    } catch (e: any) {
      toast({ title: e?.message ?? "Errore export", variant: "destructive" });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          const target = e.target as HTMLElement | null;
          if (target?.closest("button,a,input,label,select,textarea")) return;
          navigate(`/calendari/${team.id}`);
        }}
        onKeyDown={(e) => {
          const target = e.target as HTMLElement | null;
          if (target?.closest("button,a,input,label,select,textarea")) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(`/calendari/${team.id}`);
          }
        }}
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
              {section === "scuola_calcio" ? (
                <>
                  <Badge variant="secondary" className="text-xs">
                    🍂 Fase Autunnale
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    🌸 Fase Primaverile
                  </Badge>
                </>
              ) : (
                <>
                  <Badge variant="secondary" className="text-xs">
                    Campionato
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Classifica girone
                  </Badge>
                </>
              )}
              <Badge variant="outline" className="text-xs">
                🏆 Tornei
              </Badge>
            </div>
            <div className="mt-3 space-y-2 rounded-md border bg-muted/20 p-2 text-xs">
              <div>
                <p className="font-semibold text-muted-foreground">Ultima</p>
                <p className="truncate">{previewMatchLine(previousMatch)}</p>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground">Prossima</p>
                <p className="truncate">{previewMatchLine(nextMatch)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  downloadMatchCalendarTemplate(team.name);
                }}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Importa modello
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleExport();
                }}
              >
                <Download className="w-3.5 h-3.5" />
                Esporta
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 text-xs gap-1"
                disabled={importMutation.isPending || importPdfMutation.isPending || applyImportMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  fileRef.current?.click();
                }}
              >
                <Upload className="w-3.5 h-3.5" />
                Carica Excel
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 text-xs gap-1"
                disabled={importMutation.isPending || importPdfMutation.isPending || applyImportMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  pdfFileRef.current?.click();
                }}
              >
                <FileText className="w-3.5 h-3.5" />
                Carica PDF
              </Button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) importMutation.mutate(f);
              }}
            />
            <input
              ref={pdfFileRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setPendingPdfFile(f);
                setPdfCategoryFilter(team.name);
                setPdfClubFilter("");
                setPdfFilterOpen(true);
              }}
            />
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Users className="w-3 h-3" />
              Clicca per aprire il calendario
            </p>
          </CardContent>
        </Card>
      </div>
      <Dialog
        open={pdfFilterOpen}
        onOpenChange={(open) => {
          setPdfFilterOpen(open);
          if (!open && !pdfKeepPendingWhilePickerRef.current) setPendingPdfFile(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Filtro import PDF — {team.name}</DialogTitle>
            <DialogDescription>
              Categoria generica (es. Pulcini): dopo «Analizza» si leggono i titoli nel PDF e puoi scegliere 1°/2° anno, misti, ecc. Con titolo completo si usa direttamente quello.
            </DialogDescription>
          </DialogHeader>
          {pendingPdfFile && (
            <p className="text-xs text-muted-foreground truncate" title={pendingPdfFile.name}>
              File: {pendingPdfFile.name}
            </p>
          )}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor={`pdf-cat-${team.id}`}>Titolo sezione / categoria</Label>
              <Input
                id={`pdf-cat-${team.id}`}
                value={pdfCategoryFilter}
                onChange={(e) => setPdfCategoryFilter(e.target.value)}
                placeholder="Esordienti 1° anno..."
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`pdf-club-${team.id}`}>Società negli accoppiamenti</Label>
              <Input
                id={`pdf-club-${team.id}`}
                value={pdfClubFilter}
                onChange={(e) => setPdfClubFilter(e.target.value)}
                placeholder="Come nel PDF"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => { setPdfFilterOpen(false); setPendingPdfFile(null); }}>
              Annulla
            </Button>
            <Button
              type="button"
              disabled={!pendingPdfFile || importPdfMutation.isPending || pdfDiscovering}
              onClick={async () => {
                if (!pendingPdfFile) return;
                const searchTerms = buildPdfImportSearchTerms({
                  categoryLine: pdfCategoryFilter,
                  clubLine: pdfClubFilter,
                  teamName: team.name,
                  clubName: clubLabel,
                });
                if (searchTerms.length === 0) {
                  toast({ title: "Inserisci almeno un termine di ricerca", variant: "destructive" });
                  return;
                }
                const societyHint = pdfClubFilter.trim() || clubLabel;
                const runImport = (sectionTitleHints: string[]) => {
                  setPdfFilterOpen(false);
                  importPdfMutation.mutate({
                    file: pendingPdfFile,
                    searchTerms,
                    clubHint: pdfClubFilter,
                    sectionTitleHints,
                    societyHint,
                  });
                };
                if (isGenericPdfCategoryHint(pdfCategoryFilter)) {
                  setPdfDiscovering(true);
                  try {
                    const titles = await discoverPdfSectionTitles(pendingPdfFile, {
                      categoryLoose: pdfCategoryFilter.trim(),
                      searchTerms,
                    });
                    setPdfDiscovering(false);
                    if (titles.length > 1) {
                      pdfKeepPendingWhilePickerRef.current = true;
                      setPdfSectionCandidates(titles);
                      setPdfSectionChoice(titles[0] ?? "");
                      setPdfSectionPickerOpen(true);
                      setPdfFilterOpen(false);
                      queueMicrotask(() => {
                        pdfKeepPendingWhilePickerRef.current = false;
                      });
                      return;
                    }
                    if (titles.length === 1) {
                      runImport([titles[0]]);
                      return;
                    }
                  } catch {
                    setPdfDiscovering(false);
                    toast({ title: "Impossibile leggere le sezioni dal PDF", variant: "destructive" });
                    return;
                  }
                  setPdfDiscovering(false);
                }
                runImport(
                  pdfCategoryFilter
                    .split(/[,;]/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                );
              }}
            >
              {pdfDiscovering ? "Ricerca sezioni…" : "Analizza PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={pdfSectionPickerOpen}
        onOpenChange={(open) => {
          setPdfSectionPickerOpen(open);
          if (!open) setPendingPdfFile(null);
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Seleziona la sezione — {team.name}</DialogTitle>
            <DialogDescription>
              Più intestazioni compatibili con «{pdfCategoryFilter.trim()}». Scegli quella del PDF.
            </DialogDescription>
          </DialogHeader>
          {pendingPdfFile && (
            <p className="text-xs text-muted-foreground truncate shrink-0" title={pendingPdfFile.name}>
              File: {pendingPdfFile.name}
            </p>
          )}
          <RadioGroup
            value={pdfSectionChoice}
            onValueChange={setPdfSectionChoice}
            className="gap-0 overflow-y-auto max-h-[45vh] pr-1"
          >
            {pdfSectionCandidates.map((title, idx) => (
              <div
                key={`${team.id}-${idx}-${title}`}
                className="flex items-start gap-3 rounded-lg border border-border/80 p-3 mb-2 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
              >
                <RadioGroupItem value={title} id={`pdf-sec-${team.id}-${idx}`} className="mt-0.5 shrink-0" />
                <Label htmlFor={`pdf-sec-${team.id}-${idx}`} className="text-sm font-normal leading-snug cursor-pointer flex-1">
                  {title}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <DialogFooter className="shrink-0 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPdfSectionPickerOpen(false);
                setPendingPdfFile(null);
              }}
            >
              Annulla
            </Button>
            <Button
              type="button"
              disabled={!pendingPdfFile || !pdfSectionChoice || importPdfMutation.isPending}
              onClick={() => {
                if (!pendingPdfFile || !pdfSectionChoice) return;
                const file = pendingPdfFile;
                const searchTerms = buildPdfImportSearchTerms({
                  categoryLine: pdfSectionChoice,
                  clubLine: pdfClubFilter,
                  teamName: team.name,
                  clubName: clubLabel,
                });
                setPdfSectionPickerOpen(false);
                importPdfMutation.mutate({
                  file,
                  searchTerms,
                  clubHint: pdfClubFilter,
                  sectionTitleHints: [pdfSectionChoice],
                  societyHint: pdfClubFilter.trim() || clubLabel,
                });
              }}
            >
              Usa questa sezione
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Anteprima import {previewSource.toUpperCase()} - {team.name}</DialogTitle>
            <DialogDescription>
              Spunta per importare; il cestino rimuove la riga dall&apos;anteprima.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 text-sm">
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedRows(previewRows.map(() => true))}>
              Seleziona tutte
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedRows(previewRows.map(() => false))}>
              Deseleziona tutte
            </Button>
            <span className="text-muted-foreground">
              {selectedRows.filter(Boolean).length}/{previewRows.length} selezionate
            </span>
          </div>
          <div className="max-h-[45vh] overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-2 w-10">#</th>
                  <th className="text-center p-2 w-10" title="Rimuovi riga">
                    <Trash2 className="w-4 h-4 inline text-muted-foreground" aria-hidden />
                  </th>
                  <th className="text-left p-2">Data</th>
                  <th className="text-left p-2">Avversario</th>
                  <th className="text-left p-2">Tipo</th>
                  <th className="text-left p-2">Competizione</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, idx) => (
                  <tr key={`${row.date}-${row.opponent}-${idx}`} className="border-t">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={!!selectedRows[idx]}
                        onChange={(e) =>
                          setSelectedRows((prev) => {
                            const next = [...prev];
                            next[idx] = e.target.checked;
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="p-2 text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        title="Rimuovi dalla lista"
                        aria-label="Rimuovi dalla lista"
                        onClick={() => {
                          setPreviewRows((rows) => rows.filter((_, i) => i !== idx));
                          setSelectedRows((prev) => prev.filter((_, i) => i !== idx));
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                    <td className="p-2 whitespace-nowrap">{format(new Date(row.date), "dd/MM/yyyy HH:mm")}</td>
                    <td className="p-2">{row.opponent}</td>
                    <td className="p-2">{row.homeAway === "home" ? "Casa" : "Trasferta"}</td>
                    <td className="p-2">{row.competition ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPreviewOpen(false)}>
              Annulla
            </Button>
            <Button
              type="button"
              disabled={selectedRows.filter(Boolean).length === 0 || applyImportMutation.isPending}
              onClick={() => {
                const rows = previewRows.filter((_, idx) => selectedRows[idx]);
                const { conflictIds, examples } = findImportDuplicateConflicts(rows, teamMatches);
                if (conflictIds.length > 0) {
                  setPendingImportRows(rows);
                  setPendingImportConflictIds(conflictIds);
                  setDuplicateImportExamples(examples);
                  setDuplicateImportOpen(true);
                  return;
                }
                applyImportMutation.mutate({ rows });
              }}
            >
              Importa selezionate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={duplicateImportOpen}
        onOpenChange={(open) => {
          setDuplicateImportOpen(open);
          if (!open) {
            setPendingImportRows(null);
            setPendingImportConflictIds([]);
            setDuplicateImportExamples([]);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Partite già presenti</DialogTitle>
            <DialogDescription>
              Alcune partite che stai importando coincidono con partite già in calendario (stessa data, avversario e casa/trasferta).
              Scegli come procedere.
            </DialogDescription>
          </DialogHeader>
          {duplicateImportExamples.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              {duplicateImportExamples.map((ex, i) => (
                <li key={i}>{ex}</li>
              ))}
            </ul>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDuplicateImportOpen(false);
                setPendingImportRows(null);
                setPendingImportConflictIds([]);
                setDuplicateImportExamples([]);
              }}
            >
              Annulla
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={applyImportMutation.isPending}
              onClick={() => {
                if (!pendingImportRows) return;
                applyImportMutation.mutate({ rows: pendingImportRows });
              }}
            >
              Crea duplicato
            </Button>
            <Button
              type="button"
              disabled={applyImportMutation.isPending}
              onClick={() => {
                if (!pendingImportRows) return;
                applyImportMutation.mutate({
                  rows: pendingImportRows,
                  replaceConflictIds: pendingImportConflictIds,
                });
              }}
            >
              Sostituisci
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const SECTION_LABEL: Record<string, string> = {
  scuola_calcio:     "Scuola Calcio",
  settore_giovanile: "Settore Giovanile",
  prima_squadra:     "Prima Squadra",
};

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(withApi(url), { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

export default function SectionMatchCalendars({ section }: { section: string }) {
  const { role, user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: myClub } = useGetMyClub();
  const clubLabel = myClub?.name?.trim() || DEFAULT_CLUB_LABEL;
  const sectorPdfFileRef = useRef<HTMLInputElement>(null);
  const [sectorPreviewOpen, setSectorPreviewOpen] = useState(false);
  const [sectorPreviewRows, setSectorPreviewRows] = useState<SectorYouthImportRow[]>([]);
  const [sectorImportSummary, setSectorImportSummary] = useState<string[]>([]);
  const [bulkPanelOpen, setBulkPanelOpen] = useState(false);
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<number>>(() => new Set());

  const { data: rawSectionTeams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams", section],
    queryFn: () => apiFetch(`/api/teams?section=${section}`),
  });
  const sectionTeams = useMemo(
    () => rawSectionTeams.filter((team) => !team.clubSection || team.clubSection === section),
    [rawSectionTeams, section],
  );

  const isManagement = ["admin", "director", "secretary", "presidente"].includes(role ?? "");
  const isStaff = ["coach", "fitness_coach", "athletic_director", "technical_director"].includes(role ?? "");
  const staffTeams = useMemo(
    () =>
      sectionTeams.filter(
        (t) => Array.isArray(t.assignedStaff) && t.assignedStaff.some((s) => s.userId === user?.id),
      ),
    [sectionTeams, user?.id],
  );

  const visibleTeams = isManagement ? sectionTeams : staffTeams;
  const canImportYouthFederalPdf = isManagement && section === "settore_giovanile";
  const visibleTeamIds = useMemo(() => new Set(visibleTeams.map((team) => team.id)), [visibleTeams]);

  const { data: sectionMatches = [] } = useQuery<MatchRow[]>({
    queryKey: ["/api/matches", section, "bulk"],
    queryFn: () => apiFetch(`/api/matches?section=${section}`),
    enabled: isManagement && visibleTeams.length > 0,
  });

  const visibleSectionMatches = useMemo(
    () =>
      sectionMatches
        .filter((match) => typeof match.teamId === "number" && visibleTeamIds.has(match.teamId))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [sectionMatches, visibleTeamIds],
  );

  const selectedVisibleMatchCount = visibleSectionMatches.filter((match) => selectedMatchIds.has(match.id)).length;

  const analyzeYouthFederalPdfMutation = useMutation({
    mutationFn: async (file: File) => {
      const rows: SectorYouthImportRow[] = [];
      const summary: string[] = [];

      for (const mapping of YOUTH_FEDERAL_SECTION_MAP) {
        const team = findYouthTeamForOfficialSection(sectionTeams, mapping.teamAliases);
        if (!team) {
          continue;
        }

        const parsed = await parseMatchCalendarPdfFile(file, {
          teamName: team.name,
          clubName: clubLabel,
          societyHint: clubLabel,
          searchTerms: buildPdfImportSearchTerms({
            categoryLine: mapping.sectionTitle,
            clubLine: clubLabel,
          }),
          sectionTitleHints: [mapping.sectionTitle],
        });

        const mappedRows = parsed.recognized.map((row) => ({
          ...row,
          teamId: team.id,
          teamName: team.name,
          sourceSection: mapping.label,
        }));
        rows.push(...mappedRows);
        if (mappedRows.length > 0) {
          summary.push(`${mapping.label}: ${mappedRows.length} partite riconosciute`);
        }
      }

      return { rows, summary };
    },
    onSuccess: ({ rows, summary }) => {
      setSectorImportSummary(summary);
      if (rows.length === 0) {
        toast({
          title: "Nessuna partita settore giovanile riconosciuta",
          description: summary.join(" · ") || "Controlla il PDF o i nomi delle squadre.",
          variant: "destructive",
        });
        return;
      }
      setSectorPreviewRows(rows);
      setSectorPreviewOpen(true);
    },
    onError: (e: Error) => toast({ title: e.message || "Errore analisi PDF settore giovanile", variant: "destructive" }),
  });

  const applyYouthFederalImportMutation = useMutation({
    mutationFn: async (rows: SectorYouthImportRow[]) => {
      let imported = 0;
      let skipped = 0;
      const rowsByTeam = new Map<number, SectorYouthImportRow[]>();
      rows.forEach((row) => rowsByTeam.set(row.teamId, [...(rowsByTeam.get(row.teamId) ?? []), row]));

      for (const [teamId, teamRows] of rowsByTeam.entries()) {
        const existing = (await apiFetch(`/api/matches?teamId=${teamId}`)) as MatchRow[];
        const existingKeys = new Set(existing.map((match) => matchImportFingerprint(match)));
        const batchKeys = new Set<string>();

        for (const row of teamRows) {
          const key = matchImportFingerprint(row);
          if (existingKeys.has(key) || batchKeys.has(key)) {
            skipped++;
            continue;
          }
          batchKeys.add(key);
          await apiFetch("/api/matches", {
            method: "POST",
            body: JSON.stringify({
              opponent: row.opponent,
              date: row.date,
              teamId,
              homeAway: row.homeAway,
              competition: row.competition ?? "Campionato",
              location: row.location ?? undefined,
              notes: row.notes ?? `PDF ufficiale settore giovanile - ${row.sourceSection}`,
            }),
          });
          imported++;
        }
      }

      return { imported, skipped };
    },
    onSuccess: ({ imported, skipped }) => {
      qc.invalidateQueries({ queryKey: ["/api/matches"] });
      setSectorPreviewOpen(false);
      setSectorPreviewRows([]);
      toast({
        title: "Import settore giovanile completato",
        description: `${imported} partite importate${skipped ? `, ${skipped} duplicate saltate` : ""}.`,
      });
    },
    onError: (e: Error) => toast({ title: e.message || "Errore import settore giovanile", variant: "destructive" }),
  });

  const bulkDeleteMatchesMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) {
        await apiFetch(`/api/matches/${id}`, { method: "DELETE" });
      }
      return ids.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["/api/matches"] });
      setSelectedMatchIds(new Set());
      toast({
        title: "Partite eliminate",
        description: `${count} partite rimosse dal calendario.`,
      });
    },
    onError: (e: Error) => toast({ title: e.message || "Errore eliminazione partite", variant: "destructive" }),
  });

  if (isManagement || isStaff) {
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
          {canImportYouthFederalPdf && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={analyzeYouthFederalPdfMutation.isPending}
                onClick={() => sectorPdfFileRef.current?.click()}
              >
                <FileText className="h-4 w-4" />
                {analyzeYouthFederalPdfMutation.isPending ? "Lettura PDF..." : "Carica PDF ufficiale settore giovanile"}
              </Button>
              <input
                ref={sectorPdfFileRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) analyzeYouthFederalPdfMutation.mutate(file);
                }}
              />
            </div>
          )}
          {isManagement && visibleTeams.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2">
              <Button
                type="button"
                variant={bulkPanelOpen ? "secondary" : "outline"}
                size="sm"
                onClick={() => setBulkPanelOpen((open) => !open)}
              >
                {bulkPanelOpen ? "Chiudi selezione partite" : "Seleziona partite"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {selectedVisibleMatchCount}/{visibleSectionMatches.length} selezionate
              </span>
              {bulkPanelOpen && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={visibleSectionMatches.length === 0 || bulkDeleteMatchesMutation.isPending}
                    onClick={() => setSelectedMatchIds(new Set(visibleSectionMatches.map((match) => match.id)))}
                  >
                    Seleziona tutte
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={selectedVisibleMatchCount === 0 || bulkDeleteMatchesMutation.isPending}
                    onClick={() => setSelectedMatchIds(new Set())}
                  >
                    Deseleziona
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={selectedVisibleMatchCount === 0 || bulkDeleteMatchesMutation.isPending}
                    onClick={() => {
                      const ids = visibleSectionMatches.filter((match) => selectedMatchIds.has(match.id)).map((match) => match.id);
                      if (ids.length === 0) return;
                      if (!confirm(`Eliminare ${ids.length} partite selezionate? L'operazione non può essere annullata.`)) return;
                      bulkDeleteMatchesMutation.mutate(ids);
                    }}
                  >
                    Elimina selezionate
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {bulkPanelOpen && isManagement && (
          <Card>
            <CardContent className="p-0">
              {visibleSectionMatches.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">Nessuna partita presente nelle squadre visibili.</div>
              ) : (
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background border-b">
                      <tr>
                        <th className="w-10 p-2 text-left">
                          <input
                            type="checkbox"
                            aria-label="Seleziona tutte le partite"
                            checked={visibleSectionMatches.length > 0 && selectedVisibleMatchCount === visibleSectionMatches.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedMatchIds(new Set(visibleSectionMatches.map((match) => match.id)));
                              } else {
                                setSelectedMatchIds(new Set());
                              }
                            }}
                          />
                        </th>
                        <th className="p-2 text-left">Data</th>
                        <th className="p-2 text-left">Squadra</th>
                        <th className="p-2 text-left">Avversario</th>
                        <th className="p-2 text-left">Tipo</th>
                        <th className="p-2 text-left">Competizione</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleSectionMatches.map((match) => {
                        const date = new Date(match.date);
                        const dateText = Number.isNaN(date.getTime()) ? match.date : format(date, "dd/MM/yyyy HH:mm");
                        const teamName = match.teamName || visibleTeams.find((team) => team.id === match.teamId)?.name || "-";
                        return (
                          <tr key={match.id} className="border-b last:border-b-0">
                            <td className="p-2 align-top">
                              <input
                                type="checkbox"
                                aria-label={`Seleziona partita ${match.opponent}`}
                                checked={selectedMatchIds.has(match.id)}
                                onChange={(e) => {
                                  setSelectedMatchIds((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(match.id);
                                    else next.delete(match.id);
                                    return next;
                                  });
                                }}
                              />
                            </td>
                            <td className="p-2 align-top whitespace-nowrap">{dateText}</td>
                            <td className="p-2 align-top">{teamName}</td>
                            <td className="p-2 align-top font-medium">{match.opponent}</td>
                            <td className="p-2 align-top">{match.homeAway === "home" ? "Casa" : "Trasferta"}</td>
                            <td className="p-2 align-top">{match.competition ?? "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <ChampionshipSectionPanel section={section} teams={visibleTeams} />

        {visibleTeams.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {isManagement
                ? "Nessuna squadra trovata per questa sezione."
                : "Nessuna squadra assegnata in questa sezione."}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleTeams.map(team => (
              <MatchCalendarTeamCard key={team.id} team={team} section={section} navigate={navigate} />
            ))}
          </div>
        )}
        <Dialog open={sectorPreviewOpen} onOpenChange={setSectorPreviewOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Anteprima PDF ufficiale settore giovanile</DialogTitle>
              <DialogDescription>
                Categorie ufficiali lette dal comunicato FIGC e abbinate alle squadre del Settore Giovanile.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {sectorImportSummary.length > 0 && (
                <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                  {sectorImportSummary.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              )}
              <div className="rounded-md border divide-y">
                {sectorPreviewRows.map((row, index) => {
                  const date = new Date(row.date);
                  const dateText = Number.isNaN(date.getTime()) ? row.date : format(date, "dd/MM/yyyy HH:mm");
                  return (
                    <div key={`${row.teamId}-${row.date}-${row.opponent}-${index}`} className="p-3 text-sm">
                      <div className="font-semibold">{row.teamName} · {row.sourceSection}</div>
                      <div className="text-muted-foreground">
                        {dateText} · {row.homeAway === "home" ? "Casa" : "Trasferta"} · {row.opponent}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setSectorPreviewOpen(false)}>
                Annulla
              </Button>
              <Button
                type="button"
                disabled={applyYouthFederalImportMutation.isPending || sectorPreviewRows.length === 0}
                onClick={() => applyYouthFederalImportMutation.mutate(sectorPreviewRows)}
              >
                {applyYouthFederalImportMutation.isPending ? "Importo..." : "Importa partite"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return null;
}
