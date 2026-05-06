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
import { Trophy, ArrowRight, Users, Upload, Download, FileSpreadsheet, FileText, Trash2 } from "lucide-react";
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
import { findImportDuplicateConflicts } from "@/lib/match-import-conflicts";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Team { id: number; name: string; category?: string; assignedStaff?: { userId: number }[]; }

const DEFAULT_CLUB_LABEL = "Gavinana Firenze";

type MatchRow = {
  id: number;
  opponent: string;
  date: string;
  homeAway: string;
  competition?: string | null;
  location?: string | null;
  notes?: string | null;
};

function MatchCalendarTeamCard({
  team,
  navigate,
}: {
  team: Team;
  navigate: (to: string) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
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
        clubName: input.clubHint.trim() || DEFAULT_CLUB_LABEL,
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
      <button
        type="button"
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
      </button>
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
                  clubName: DEFAULT_CLUB_LABEL,
                });
                if (searchTerms.length === 0) {
                  toast({ title: "Inserisci almeno un termine di ricerca", variant: "destructive" });
                  return;
                }
                const societyHint = pdfClubFilter.trim() || DEFAULT_CLUB_LABEL;
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
                  clubName: DEFAULT_CLUB_LABEL,
                });
                setPdfSectionPickerOpen(false);
                importPdfMutation.mutate({
                  file,
                  searchTerms,
                  clubHint: pdfClubFilter,
                  sectionTitleHints: [pdfSectionChoice],
                  societyHint: pdfClubFilter.trim() || DEFAULT_CLUB_LABEL,
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
  const res = await fetch(url, { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

export default function SectionMatchCalendars({ section }: { section: string }) {
  const { role, user } = useAuth();
  const [, navigate] = useLocation();

  const { data: sectionTeams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams", section],
    queryFn: () => apiFetch(`/api/teams?section=${section}`),
  });

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
        </div>

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
              <MatchCalendarTeamCard key={team.id} team={team} navigate={navigate} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}
