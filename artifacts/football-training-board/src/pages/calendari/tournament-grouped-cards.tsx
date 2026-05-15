import { useEffect, useRef, useState } from "react";
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
import type { TournamentProgramEntry, TournamentProgramScore } from "@/pages/calendari/tournament-documents-storage";
import { isFinalsRow, isKnockoutRow, isQualifyingRow, type TournamentProgramView } from "@/pages/calendari/tournament-program-filter";

export interface TournamentCardMatch {
  id: number;
  opponent: string;
  date: string;
  homeAway: string;
  competition?: string | null;
  location?: string | null;
  notes?: string | null;
  result?: string | null;
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

function scorePart(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function scoreFromParts(homeRaw: string, awayRaw: string): TournamentProgramScore {
  const cleanHome = homeRaw.replace(/[^\d]/g, "").slice(0, 2);
  const cleanAway = awayRaw.replace(/[^\d]/g, "").slice(0, 2);
  const home = cleanHome === "" ? null : Number(cleanHome);
  const away = cleanAway === "" ? null : Number(cleanAway);
  return {
    homeScore: Number.isFinite(home) ? home : null,
    awayScore: Number.isFinite(away) ? away : null,
  };
}

function ScoreInputPair({
  home,
  away,
  onChange,
}: {
  home: number | null | undefined;
  away: number | null | undefined;
  onChange: (score: TournamentProgramScore) => void;
}) {
  const [homeDraft, setHomeDraft] = useState(scorePart(home));
  const [awayDraft, setAwayDraft] = useState(scorePart(away));

  useEffect(() => {
    setHomeDraft(scorePart(home));
    setAwayDraft(scorePart(away));
  }, [home, away]);

  const commit = (nextHome = homeDraft, nextAway = awayDraft) => {
    onChange(scoreFromParts(nextHome, nextAway));
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label="Gol squadra casa"
        title="Gol squadra casa"
        placeholder="0"
        className="h-8 w-11 rounded-md border bg-background px-1 text-center text-xs tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        value={homeDraft}
        onChange={(e) => setHomeDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <span className="text-xs text-muted-foreground">-</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label="Gol squadra trasferta"
        title="Gol squadra trasferta"
        placeholder="0"
        className="h-8 w-11 rounded-md border bg-background px-1 text-center text-xs tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        value={awayDraft}
        onChange={(e) => setAwayDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </div>
  );
}

function normalizeSide(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function standingsFor(entries: TournamentProgramEntry[], scores: Record<string, TournamentProgramScore>) {
  const table = new Map<string, { team: string; pg: number; v: number; n: number; p: number; gf: number; gs: number; pts: number }>();
  const ensure = (team: string) => {
    const key = normalizeSide(team);
    if (!table.has(key)) table.set(key, { team, pg: 0, v: 0, n: 0, p: 0, gf: 0, gs: 0, pts: 0 });
    return table.get(key)!;
  };
  for (const entry of entries) {
    const home = ensure(entry.homeTeam);
    const away = ensure(entry.awayTeam);
    const score = scores[entry.id];
    if (score?.homeScore == null || score?.awayScore == null) continue;
    home.pg += 1; away.pg += 1;
    home.gf += score.homeScore; home.gs += score.awayScore;
    away.gf += score.awayScore; away.gs += score.homeScore;
    if (score.homeScore > score.awayScore) { home.v += 1; home.pts += 3; away.p += 1; }
    else if (score.homeScore < score.awayScore) { away.v += 1; away.pts += 3; home.p += 1; }
    else { home.n += 1; away.n += 1; home.pts += 1; away.pts += 1; }
  }
  return [...table.values()].sort(
    (a, b) =>
      b.pts - a.pts ||
      b.pg - a.pg ||
      (b.gf - b.gs) - (a.gf - a.gs) ||
      b.gf - a.gf ||
      a.team.localeCompare(b.team),
  );
}

type StandingRow = ReturnType<typeof standingsFor>[number];

function programEntrySearchText(entry: TournamentProgramEntry): string {
  return [entry.homeTeam, entry.awayTeam, entry.phase ?? "", entry.group ?? ""].join(" ");
}

function filterProgramEntriesByView(entries: TournamentProgramEntry[], view: TournamentProgramView): TournamentProgramEntry[] {
  if (view === "full") return entries;
  return entries.filter((entry) => {
    const text = programEntrySearchText(entry);
    if (view === "finals") return isFinalsRow(text);
    if (view === "knockout") return isKnockoutRow(text);
    if (view === "qualifying") return isQualifyingRow(text);
    return true;
  });
}

function sideMatchesClub(side: string, clubLabel: string): boolean {
  const sideNorm = normalizeSide(side);
  const clubNorm = normalizeSide(clubLabel);
  if (!sideNorm || !clubNorm) return false;
  if (sideNorm.includes(clubNorm) || clubNorm.includes(sideNorm)) return true;
  const sideTokens = sideNorm.split(" ").filter((token) => token.length >= 4 && !["asd", "ssd", "sportiva", "calcio"].includes(token));
  const clubTokens = new Set(clubNorm.split(" ").filter((token) => token.length >= 4));
  return sideTokens.some((token) => clubTokens.has(token));
}

function finalPairLabel(index: number): string {
  const first = index * 2 + 1;
  const second = first + 1;
  return `Finale ${first}° - ${second}° posto`;
}

function generatedFinalsFromStandings(rows: StandingRow[]) {
  const finals: { label: string; homeTeam: string; awayTeam: string }[] = [];
  for (let i = 0; i < rows.length; i += 2) {
    const home = rows[i];
    const away = rows[i + 1];
    if (!home && !away) continue;
    finals.push({
      label: finalPairLabel(i / 2),
      homeTeam: home?.team ?? "da completare",
      awayTeam: away?.team ?? "da completare",
    });
  }
  return finals;
}

const PROGRAM_LABELS: Record<TournamentProgramView, string> = {
  full: "Programma completo",
  qualifying: "Girone di qualificazione",
  knockout: "Fasi a eliminazione",
  finals: "Finali",
};

export function TournamentGroupedCards({
  groups,
  clubLabel,
  programSelection,
  onProgramChange,
  canUploadDocuments,
  canManageTournament,
  attachmentsByCompetition,
  programsByCompetition,
  scoresByCompetition,
  onEditTournament,
  onDeleteTournament,
  onLocalDocumentSelected,
  onTournamentScoreChange,
}: {
  groups: TournamentCardGroup[];
  clubLabel: string;
  programSelection: Record<string, string>;
  onProgramChange: (competition: string, value: string) => void;
  canUploadDocuments: boolean;
  canManageTournament: boolean;
  attachmentsByCompetition: Record<string, StoredTournamentAttachment[]>;
  programsByCompetition: Record<string, TournamentProgramEntry[]>;
  scoresByCompetition: Record<string, Record<string, TournamentProgramScore>>;
  onEditTournament: (group: TournamentCardGroup) => void;
  onDeleteTournament: (group: TournamentCardGroup) => void;
  onLocalDocumentSelected: (competition: string, file: File) => void;
  onTournamentScoreChange: (competition: string, entryId: string, score: TournamentProgramScore) => void;
}) {
  const docInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [clubOnlyByCompetition, setClubOnlyByCompetition] = useState<Record<string, boolean>>({});

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
        const program = programsByCompetition[g.competition] ?? [];
        const scores = scoresByCompetition[g.competition] ?? {};
        const programByView = filterProgramEntriesByView(program, progVal);
        const clubOnly = !!clubOnlyByCompetition[g.competition];
        const visibleProgram = clubOnly
          ? programByView.filter((entry) => sideMatchesClub(entry.homeTeam, clubLabel) || sideMatchesClub(entry.awayTeam, clubLabel))
          : programByView;
        const standingsRows = standingsFor(programByView, scores);
        const generatedFinals = generatedFinalsFromStandings(standingsRows);

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

              {program.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border/80 bg-muted/10 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground">Partite del torneo</p>
                      <Button
                        type="button"
                        variant={clubOnly ? "default" : "outline"}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          setClubOnlyByCompetition((prev) => ({
                            ...prev,
                            [g.competition]: !prev[g.competition],
                          }))
                        }
                      >
                        Solo società
                      </Button>
                    </div>
                    <div className="divide-y divide-border/60 max-h-[520px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {visibleProgram.length === 0 ? (
                        <p className="py-3 text-xs text-muted-foreground">Nessuna partita in questa vista.</p>
                      ) : visibleProgram.map((entry) => (
                        <div key={entry.id} className="py-2 text-xs flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{entry.homeTeam} <span className="text-muted-foreground font-normal">-</span> {entry.awayTeam}</p>
                            <p className="text-muted-foreground">{format(new Date(entry.date), "dd/MM HH:mm", { locale: itLocale })}{entry.group ? ` · ${entry.group}` : ""}</p>
                          </div>
                          <input
                            className="hidden"
                            readOnly
                          />
                          <ScoreInputPair
                            home={scores[entry.id]?.homeScore}
                            away={scores[entry.id]?.awayScore}
                            onChange={(score) => onTournamentScoreChange(g.competition, entry.id, score)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/80 bg-muted/10 p-3 space-y-2">
                    <p className="text-xs font-semibold text-foreground">Classifica girone</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="text-muted-foreground">
                          <tr><th className="text-left py-1">Squadra</th><th>PG</th><th>GF</th><th>GS</th><th>DR</th><th>Pt</th></tr>
                        </thead>
                        <tbody>
                          {standingsRows.map((row) => (
                            <tr key={row.team} className="border-t">
                              <td className="py-1 pr-2 font-medium">{row.team}</td>
                              <td className="text-center">{row.pg}</td>
                              <td className="text-center">{row.gf}</td>
                              <td className="text-center">{row.gs}</td>
                              <td className="text-center">{row.gf - row.gs}</td>
                              <td className="text-center font-semibold">{row.pts}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="border-t pt-2">
                      <p className="text-xs font-semibold text-foreground">Finali generate</p>
                      {generatedFinals.length === 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">Inserisci i risultati del girone per generare gli accoppiamenti.</p>
                      ) : (
                        <div className="mt-1 divide-y divide-border/60">
                          {generatedFinals.map((finale) => (
                            <div key={finale.label} className="py-1.5 text-xs">
                              <div className="font-medium">{finale.label}</div>
                              <div className="text-muted-foreground">{finale.homeTeam} - {finale.awayTeam}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

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
