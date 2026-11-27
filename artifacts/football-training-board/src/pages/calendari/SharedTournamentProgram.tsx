import { useGetMyClub } from "@workspace/api-client-react";
import { parseMatchCalendarPdfFile, parseMatchCalendarPdfFileClone, parseTournamentImageFile, parseTournamentImageFileClone, buildPdfImportSearchTerms } from "@/lib/match-calendar-pdf";
import { mergeSharedTournamentImport } from "@/lib/shared-tournament-import";
import type { SharedTournamentPhase } from "@workspace/api-zod";
import { useAuth } from "@/hooks/use-auth";
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { withApi } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
type Entry = {
  tournamentPhaseId?: string;
  finalsPolicy?: "program-only";
  id: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  phase: string;
  group: string;
  ownSide: "none" | "home" | "away";
  matchId?: number;
};
async function request<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch(withApi(url), {
    method,
    credentials: "include",
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error ?? "Operazione non riuscita");
  return data;
}
const localInput = (date: string) => {
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export default function SharedTournamentProgram({
  id,
  teamId,
  teamName,
  startDate,
  endDate,
  phases,
  canManage,
  basePath,
}: {
  id: number;
  teamId: number;
  teamName: string;
  startDate: string;
  endDate?: string | null;
  phases: SharedTournamentPhase[];
  canManage: boolean;
  basePath: string;
}) {
  const { club, user, role } = useAuth();
  const { data: myClub, isLoading: clubLoading } = useGetMyClub();
  const fileInput = useRef<HTMLInputElement>(null);
  const [importNotice, setImportNotice] = useState("");
  const qc = useQueryClient(),
    key = ["shared-program", id, teamId, club?.id, user?.id, role];
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      request<{ program: Entry[]; revision: number }>(
        `/api/shared-tournaments/${id}/program?teamId=${teamId}`,
      ),
  });
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState<Entry[]>([]);
  const save = useMutation({
    mutationFn: () =>
      request(`/api/shared-tournaments/${id}/program`, "PUT", {
        teamId,
        expectedRevision: revision,
        program: draft.map(({ matchId, ...entry }) => entry),
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: key }),
        qc.invalidateQueries({ queryKey: ["shared-tournaments"] }),
        qc.invalidateQueries({ queryKey: ["/api/matches", teamId] }),
        qc.invalidateQueries({
          queryKey: ["/api/tournament-documents", teamId],
        }),
      ]);
      setOpen(false);
    },
  });
  const importProgram = useMutation({
    mutationFn: async (file: File) => {
      if (!query.data) throw Error("Attendi il caricamento del programma dell’annata.");
      if (file.size > 32 * 1024 * 1024) throw Error("Il documento supera 32 MB.");
      const original = structuredClone(open ? draft : query.data.program);
      const originalRevision = open ? revision : query.data.revision;
      const profile = myClub as { name?: string | null; legalName?: string | null } | undefined;
      const clubName = profile?.name?.trim() || club?.name || teamName;
      const aliases = [profile?.name, profile?.legalName].map(value => String(value ?? "").trim())
        .filter((value, index, list) => value.length >= 3 && list.findIndex(item => item.toLowerCase() === value.toLowerCase()) === index);
      const options = { teamName, clubName, clubAliases: aliases, societyHint: clubName, documentMode: "tournament" as const, unifiedTournamentProgram: true,
        searchTerms: buildPdfImportSearchTerms({ categoryLine: teamName, clubLine: clubName, teamName, clubName }) };
      const image = file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name);
      if (!image && file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) throw Error("Scegli un PDF o un’immagine PNG, JPG o WebP.");
      let parsed = image ? await parseTournamentImageFile(file, options) : await parseMatchCalendarPdfFile(file, options);
      if (!parsed.recognized.length) {
        const fallback = image ? await parseTournamentImageFileClone(file, options) : await parseMatchCalendarPdfFileClone(file, options);
        if (fallback.recognized.length > parsed.recognized.length || (fallback.tournamentProgram?.length ?? 0) > (parsed.tournamentProgram?.length ?? 0)) parsed = fallback;
      }
      return { ...mergeSharedTournamentImport(parsed, original, phases, clubName), revision: originalRevision, fileName: file.name };
    },
    onSuccess: result => {
      setRevision(result.revision); setDraft(result.program); save.reset();
      setImportNotice(`${result.fileName} · ${teamName}: ${result.added} nuove gare, ${result.matched} già presenti. Verifica l’anteprima e salva per confermare.`);
      setOpen(true);
    },
  });
  const outsideDates = draft.filter(entry => { const date = new Date(entry.date); if (!Number.isFinite(date.getTime())) return true;
    const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(date); return day < startDate || day > (endDate ?? startDate); }).length;
  const missingPhase = phases.length ? draft.filter(entry => !phases.some(phase => phase.id === entry.tournamentPhaseId)).length : 0;
  const change = (index: number, patch: Partial<Entry>) =>
    setDraft((old) =>
      old.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );
  return (
    <div className="space-y-3">
      <input ref={fileInput} type="file" disabled={!canManage || importProgram.isPending || save.isPending} className="hidden" accept=".pdf,image/png,image/jpeg,image/webp" aria-label={"Carica programma di " + teamName}
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) importProgram.mutate(file); }} />
      {canManage && <div className="space-y-2"><Button type="button" variant="outline" disabled={!query.data || clubLoading || importProgram.isPending || save.isPending} onClick={() => fileInput.current?.click()}>
        {importProgram.isPending ? "Lettura programma…" : "Carica programma dell’annata"}
      </Button><p className="text-xs text-muted-foreground">PDF o immagine · Importa soltanto nel programma di {teamName}. Le altre annate restano separate.</p></div>}
      {importProgram.isError && <p role="alert" className="text-sm text-destructive">{importProgram.error.message}</p>}
      <div className="flex flex-wrap justify-between gap-2">
        <h4 className="font-medium">Programma di {teamName}</h4>
        {canManage && (
          <Button
            size="sm"
            disabled={!query.data || importProgram.isPending}
            onClick={() => {
              setRevision(query.data!.revision);
              setDraft(structuredClone(query.data?.program ?? []));
              save.reset(); importProgram.reset(); setImportNotice("");
              setOpen(true);
            }}
          >
            Prepara / modifica programma
          </Button>
        )}
      </div>
      {query.isLoading && <p>Caricamento programma…</p>}
      {query.isError && (
        <p role="alert">
          Programma non disponibile.{" "}
          <button onClick={() => query.refetch()}>Riprova</button>
        </p>
      )}
      {query.data?.program.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Programma da compilare. Solo le gare assegnate a questa annata
          compariranno nei suoi calendari.
        </p>
      )}
      {query.data?.program.map((entry) => (
        <div
          key={entry.id}
          className="rounded-lg border bg-background p-3 text-sm"
        >
          <p className="text-xs text-muted-foreground">
            {new Date(entry.date).toLocaleString("it-IT")} ·{" "}
            {phases.find((p) => p.id === entry.tournamentPhaseId)?.name} ·{" "}
            {entry.phase} {entry.group}
          </p>
          <p className="font-medium">
            {entry.homeTeam} — {entry.awayTeam}
          </p>
          {entry.matchId && role!=="secretary" ? (
            <a
              className="text-primary underline"
              href={`${basePath}?phase=tornei&sharedTournament=${id}&openMatchId=${entry.matchId}`}
            >
              Apri partita · convocazioni e schieramenti
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">
              {entry.matchId ? "Gara collegata · gestione organizzativa" : "Solo programma · nessun impegno per questa annata"}
            </p>
          )}
        </div>
      ))}
      <Dialog open={open} onOpenChange={value => { if (!save.isPending && !importProgram.isPending) setOpen(value); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Programma · {teamName}</DialogTitle>
            <DialogDescription>
              Gironi e finali restano separati dalle altre annate. Per le gare
              fra altre società scegli Solo programma; per le finali ancora da
              assegnare usa la stessa opzione.
            </DialogDescription>
          </DialogHeader>
          {importNotice && <p role="status" className="rounded-lg border bg-muted/20 p-3 text-sm">{importNotice}</p>}
          <p className="text-sm font-medium">{draft.length} gare nel programma · {draft.filter(entry => entry.ownSide !== "none").length} gare dell’annata</p>
          {outsideDates > 0 && <p role="alert" className="text-sm text-destructive">{outsideDates} gare fuori dalle date del torneo. Verifica le date delle gare o aggiorna i dati comuni del torneo, includendo gennaio se previsto.</p>}
          {missingPhase > 0 && <p role="alert" className="text-sm text-amber-700">Scegli la fase del torneo per {missingPhase} gare prima di salvare.</p>}
          {importProgram.isError && <p role="alert" className="text-sm text-destructive">{importProgram.error.message}</p>}
          <Button type="button" variant="outline" disabled={importProgram.isPending || save.isPending || clubLoading} onClick={() => fileInput.current?.click()}>Carica PDF o immagine per {teamName}</Button>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            {draft.map((entry, i) => (
              <fieldset
                key={entry.id}
                disabled={save.isPending || importProgram.isPending}
                className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2"
              >
                <legend className="px-1 text-sm font-medium">
                  Gara {i + 1}
                </legend>
                <div>
                  <Label htmlFor={`program-date-${entry.id}`}>Data e ora</Label>
                  <Input
                    id={`program-date-${entry.id}`}
                    type="datetime-local"
                    required
                    value={localInput(entry.date)}
                    onChange={(e) => {
                      const d = new Date(e.target.value);
                      if (Number.isFinite(d.getTime()))
                        change(i, { date: d.toISOString() });
                    }}
                  />
                </div>
                <div>
                  <Label>Impegno dell’annata</Label>
                  <ScrollableSelect
                    className="w-full"
                    aria-label={`Assegnazione gara ${i + 1}`}
                    value={entry.ownSide}
                    onValueChange={(value) =>
                      change(i, { ownSide: value as Entry["ownSide"] })
                    }
                  >
                    <option value="none">Solo programma / da assegnare</option>
                    <option value="home">
                      Questa annata: squadra 1 (casa)
                    </option>
                    <option value="away">
                      Questa annata: squadra 2 (trasferta)
                    </option>
                  </ScrollableSelect>
                </div>
                <div>
                  <Label htmlFor={`program-home-${entry.id}`}>Squadra 1</Label>
                  <Input
                    id={`program-home-${entry.id}`}
                    required
                    maxLength={250}
                    value={entry.homeTeam}
                    onChange={(e) => change(i, { homeTeam: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`program-away-${entry.id}`}>Squadra 2</Label>
                  <Input
                    id={`program-away-${entry.id}`}
                    required
                    maxLength={250}
                    value={entry.awayTeam}
                    onChange={(e) => change(i, { awayTeam: e.target.value })}
                  />
                </div>
                {phases.length > 0 && (
                  <div>
                    <Label>Fase del torneo</Label>
                    <ScrollableSelect
                      className="w-full"
                      aria-label={"Fase del torneo gara " + (i + 1)}
                      value={entry.tournamentPhaseId ?? "__choose__"}
                      onValueChange={(value) =>
                        change(i, {
                          tournamentPhaseId:
                            value === "__choose__" ? undefined : value,
                        })
                      }
                    >
                      <option value="__choose__">Scegli fase</option>
                      {phases.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.startDate} — {p.endDate}
                        </option>
                      ))}
                    </ScrollableSelect>
                  </div>
                )}
                <div>
                  <Label htmlFor={`program-phase-${entry.id}`}>
                    Gironi / turno
                  </Label>
                  <Input
                    id={`program-phase-${entry.id}`}
                    maxLength={100}
                    placeholder="Gironi, Finale…"
                    value={entry.phase}
                    onChange={(e) => change(i, { phase: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`program-group-${entry.id}`}>
                    Girone / campo
                  </Label>
                  <Input
                    id={`program-group-${entry.id}`}
                    maxLength={100}
                    value={entry.group}
                    onChange={(e) => change(i, { group: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Rimuovere questa gara dal programma? Le partite già preparate sono protette al salvataggio.",
                      )
                    )
                      setDraft((old) => old.filter((_, index) => index !== i));
                  }}
                >
                  Rimuovi gara
                </Button>
              </fieldset>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={draft.length >= 250 || save.isPending || importProgram.isPending}
              onClick={() =>
                setDraft((old) => [
                  ...old,
                  {
                    id: crypto.randomUUID(),
                    date: new Date(
                      `${phases[0]?.startDate ?? startDate}T10:00:00`,
                    ).toISOString(),
                    tournamentPhaseId: phases[0]?.id,
                    homeTeam: club?.name || teamName,
                    awayTeam: "",
                    phase: "Gironi",
                    group: "",
                    ownSide: "home",
                  },
                ])
              }
            >
              + Aggiungi gara o finale
            </Button>
            {save.isError && (
              <p role="alert" className="text-sm text-destructive">
                {save.error.message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Annulla
              </Button>
              <Button disabled={save.isPending || importProgram.isPending || outsideDates > 0 || missingPhase > 0}>
                {save.isPending
                  ? "Salvataggio…"
                  : "Salva programma dell’annata"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
