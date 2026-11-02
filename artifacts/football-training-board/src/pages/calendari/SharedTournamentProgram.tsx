import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
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
  canManage,
  basePath,
}: {
  id: number;
  teamId: number;
  teamName: string;
  startDate: string;
  canManage: boolean;
  basePath: string;
}) {
  const { club, user, role } = useAuth();
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
  const change = (index: number, patch: Partial<Entry>) =>
    setDraft((old) =>
      old.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-2">
        <h4 className="font-medium">Programma di {teamName}</h4>
        {canManage && (
          <Button
            size="sm"
            disabled={!query.data}
            onClick={() => {
              setRevision(query.data!.revision);
              setDraft(structuredClone(query.data?.program ?? []));
              save.reset();
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
            {new Date(entry.date).toLocaleString("it-IT")} · {entry.phase}{" "}
            {entry.group}
          </p>
          <p className="font-medium">
            {entry.homeTeam} — {entry.awayTeam}
          </p>
          {entry.matchId ? (
            <a
              className="text-primary underline"
              href={`${basePath}?phase=tornei&sharedTournament=${id}&openMatchId=${entry.matchId}`}
            >
              Apri partita · convocazioni e schieramenti
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">
              Solo programma · nessun impegno per questa annata
            </p>
          )}
        </div>
      ))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Programma · {teamName}</DialogTitle>
            <DialogDescription>
              Gironi e finali restano separati dalle altre annate. Per le gare
              fra altre società scegli Solo programma; per le finali ancora da
              assegnare usa la stessa opzione.
            </DialogDescription>
          </DialogHeader>
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
                <div>
                  <Label htmlFor={`program-phase-${entry.id}`}>Fase</Label>
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
              disabled={draft.length >= 250}
              onClick={() =>
                setDraft((old) => [
                  ...old,
                  {
                    id: crypto.randomUUID(),
                    date: new Date(`${startDate}T10:00:00`).toISOString(),
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
              <Button disabled={save.isPending}>
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
