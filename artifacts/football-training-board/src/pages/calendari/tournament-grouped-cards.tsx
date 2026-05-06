import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { it as itLocale } from "date-fns/locale";
import { Paperclip, Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { StoredTournamentAttachment } from "@/pages/calendari/tournament-documents-storage";
import {
  filterMatchesByProgramView,
  type TournamentProgramView,
} from "@/pages/calendari/tournament-program-filter";

export interface TournamentCardMatch {
  id: number;
  opponent: string;
  date: string;
  homeAway: string;
  competition?: string | null;
  location?: string | null;
  notes?: string | null;
}

export interface TournamentCardGroup {
  competition: string;
  matches: TournamentCardMatch[];
}

/** Estensione / MIME leggibile per il box documenti (solo UI). */
export function tournamentDocTypeLabel(file: File): string {
  const t = (file.type ?? "").trim();
  if (t && t !== "application/octet-stream") return t;
  const ext = file.name.includes(".") ? (file.name.split(".").pop() ?? "").toLowerCase() : "";
  const extMap: Record<string, string> = {
    pdf: "PDF",
    png: "PNG",
    jpg: "JPEG",
    jpeg: "JPEG",
    webp: "WebP",
    gif: "GIF",
    doc: "Word (.doc)",
    docx: "Word (.docx)",
    xls: "Excel (.xls)",
    xlsx: "Excel (.xlsx)",
  };
  return extMap[ext] ?? (ext ? ext.toUpperCase() : "File");
}

export function attachmentTypeLabel(stored: StoredTournamentAttachment): string {
  const t = (stored.type ?? "").trim();
  if (t && t !== "application/octet-stream") return t;
  return tournamentDocTypeLabel(new File([], stored.name, { type: stored.type || "application/octet-stream" }));
}

const TOURNAMENT_DOC_ACCEPT = [
  ".pdf",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

export function groupTorneoMatchesByCompetition(matches: TournamentCardMatch[]): TournamentCardGroup[] {
  const map = new Map<string, TournamentCardMatch[]>();
  for (const m of matches) {
    const c = (m.competition ?? "") as string;
    const key = c.trim() || "Senza competizione";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  const rows = [...map.entries()].map(([competition, list]) => {
    const sorted = [...list].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return { competition, matches: sorted };
  });
  rows.sort(
    (a, b) =>
      new Date(a.matches[0]?.date ?? 0).getTime() - new Date(b.matches[0]?.date ?? 0).getTime(),
  );
  return rows;
}

function matchRowLabels(m: TournamentCardMatch, teamDisplayName: string, clubLabel: string) {
  const isHome = m.homeAway === "home";
  const homeSide = isHome ? clubLabel : m.opponent;
  const awaySide = isHome ? m.opponent : teamDisplayName;
  return { homeSide, awaySide };
}

const PROGRAM_LABELS: Record<TournamentProgramView, string> = {
  full: "Programma completo",
  qualifying: "Girone di qualificazione",
  knockout: "Fasi a eliminazione",
  finals: "Finali",
};

export function TournamentGroupedCards({
  groups,
  teamDisplayName,
  clubLabel,
  programSelection,
  onProgramChange,
  canUploadDocuments,
  canManageTournament,
  attachmentsByCompetition,
  onEditTournament,
  onDeleteTournament,
  onLocalDocumentSelected,
}: {
  groups: TournamentCardGroup[];
  teamDisplayName: string;
  clubLabel: string;
  programSelection: Record<string, string>;
  onProgramChange: (competition: string, value: string) => void;
  canUploadDocuments: boolean;
  canManageTournament: boolean;
  attachmentsByCompetition: Record<string, StoredTournamentAttachment[]>;
  onEditTournament: (group: TournamentCardGroup) => void;
  onDeleteTournament: (group: TournamentCardGroup) => void;
  onLocalDocumentSelected: (competition: string, file: File) => void;
}) {
  const docInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  return (
    <div className="space-y-4 min-w-0">
      {groups.map((g) => {
        const sorted = g.matches;
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const firstLoc = sorted.map((m) => (m.location ?? "").trim()).find(Boolean);
        const dateFrom = first
          ? format(new Date(first.date), "d MMMM yyyy", { locale: itLocale })
          : "—";
        const dateTo = last
          ? format(new Date(last.date), "d MMMM yyyy", { locale: itLocale })
          : "—";
        const locLine = firstLoc ? firstLoc : "da completare";
        const progVal = (programSelection[g.competition] ?? "full") as TournamentProgramView;
        const docs = attachmentsByCompetition[g.competition] ?? [];

        const displayedMatches = filterMatchesByProgramView(
          sorted,
          progVal,
          teamDisplayName,
          clubLabel,
        );

        return (
          <Card key={g.competition} className="min-w-0 overflow-hidden border-violet-500/20 shadow-sm">
            <CardHeader className="pb-3 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <CardTitle className="text-base leading-snug pr-2">{g.competition}</CardTitle>
                <div className="flex items-center gap-1.5 shrink-0">
                  {canManageTournament ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        title="Modifica torneo"
                        aria-label="Modifica torneo"
                        onClick={() => onEditTournament(g)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            title="Elimina torneo"
                            aria-label="Elimina torneo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminare questo torneo?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Verranno eliminate tutte le partite/eventi di {g.competition}.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => onDeleteTournament(g)}
                            >
                              Elimina
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  ) : null}
                  <Badge variant="secondary" className="tabular-nums">
                    {sorted.length} partite/eventi
                  </Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">Date torneo: </span>
                {dateFrom}
                {first && last && first.date !== last.date ? ` – ${dateTo}` : null}
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">Luogo: </span>
                {locLine}
              </p>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Programma gare</Label>
                  <Select
                    value={progVal}
                    onValueChange={(v) => onProgramChange(g.competition, v)}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Programma gare" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PROGRAM_LABELS) as TournamentProgramView[]).map((k) => (
                        <SelectItem key={k} value={k}>
                          {PROGRAM_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {canUploadDocuments ? (
                  <div className="min-w-0 space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Allegati torneo</Label>
                    <input
                      type="file"
                      className="hidden"
                      accept={TOURNAMENT_DOC_ACCEPT}
                      ref={(el) => {
                        docInputRefs.current[g.competition] = el;
                      }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) onLocalDocumentSelected(g.competition, f);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 w-full gap-1.5"
                      onClick={() => docInputRefs.current[g.competition]?.click()}
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      Carica documento
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-border/80 bg-muted/10 p-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">Partite ed eventi del torneo</p>
                {displayedMatches.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">Nessuna partita in questa sezione.</p>
                ) : (
                  <div className="divide-y divide-border/60 max-h-[280px] overflow-y-auto">
                    {displayedMatches.map((m) => {
                      const { homeSide, awaySide } = matchRowLabels(m, teamDisplayName, clubLabel);
                      return (
                        <div key={m.id} className="py-2.5 text-sm leading-snug first:pt-0 last:pb-0">
                          <div className="font-medium">
                            {homeSide} <span className="text-muted-foreground font-normal">vs</span> {awaySide}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                            <span>
                              {format(new Date(m.date), "EEEE d MMMM yyyy 'alle ore' HH:mm", {
                                locale: itLocale,
                              })}
                            </span>
                            <span>{m.homeAway === "home" ? "Casa" : "Trasferta"}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-dashed border-border/70 bg-card p-3">
                <p className="text-xs font-semibold text-foreground mb-2">Documenti del torneo</p>
                {docs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessun documento allegato.</p>
                ) : (
                  <ul className="text-sm space-y-2">
                    {docs.map((d) => (
                      <li
                        key={d.id}
                        className="flex flex-col gap-0.5 border-b border-border/40 pb-2 last:border-0 last:pb-0"
                      >
                        <a
                          href={d.dataUrl}
                          download={d.name}
                          className="font-medium text-primary hover:underline break-all"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {d.name}
                        </a>
                        <span className="text-xs text-muted-foreground">
                          {attachmentTypeLabel(d)} · {(d.size / 1024).toFixed(1)} KB ·{" "}
                          {format(new Date(d.uploadedAt), "dd/MM/yyyy HH:mm", { locale: itLocale })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
