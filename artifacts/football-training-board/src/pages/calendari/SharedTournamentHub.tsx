import SharedTournamentCommon from "./SharedTournamentCommon";
import SharedTournamentProgram from "./SharedTournamentProgram";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { withApi } from "@/lib/api-base";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ChevronRight, Trophy, Plus } from "lucide-react";

type Team = {
  id: number;
  name: string;
  clubSection?: string | null;
  seasonId?: number | null;
};
type Tournament = {
  id: number;
  revision: number;
  name: string;
  location: string;
  startDate: string;
  endDate: string | null;
  teams: { id: number; name: string }[];
};
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(withApi(path), {
    credentials: "include",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error ?? "Operazione non riuscita");
  return data;
}
export default function SharedTournamentHub({
  teamId,
  teams,
  canManage,
  open,
  onOpenChange,
}: {
  teamId: number;
  teams: Team[];
  canManage: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { club, user, role } = useAuth();
  const qc = useQueryClient();
  const current = teams.find((t) => t.id === teamId);
  const eligible = teams.filter(
    (t) =>
      t.clubSection === current?.clubSection &&
      t.seasonId === current?.seasonId,
  );
  const query = useQuery({
    queryKey: ["shared-tournaments", club?.id, user?.id, role, teamId],
    queryFn: () =>
      api<Tournament[]>(`/api/shared-tournaments?teamId=${teamId}`),
  });
  const selectedId = Number(
    new URLSearchParams(window.location.search).get("sharedTournament"),
  );
  const selected = query.data?.find((t) => t.id === selectedId);
  const [name, setName] = useState(""),
    [location, setLocation] = useState(""),
    [startDate, setStartDate] = useState(""),
    [endDate, setEndDate] = useState("");
  const [teamIds, setTeamIds] = useState<number[]>([teamId]);
  const [search, setSearch] = useState("");
  const base = (id: number) =>
    `/${(current?.clubSection ?? "scuola_calcio").replaceAll("_", "-")}/calendari/${id}`;
  const create = useMutation({
    mutationFn: () =>
      api<Tournament>("/api/shared-tournaments", {
        name,
        location,
        startDate,
        endDate: endDate || null,
        teamIds,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["shared-tournaments"] });
      onOpenChange(false);
      setName("");
      setLocation("");
      setStartDate("");
      setEndDate("");
      setTeamIds([teamId]);
    },
  });
  return (
    <section
      className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
      aria-label="Tornei condivisi tra annate"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Trophy className="h-5 w-5 text-primary" />
          Tornei e annate partecipanti
        </h2>
        {canManage && (
          <Button
            onClick={() => {
              create.reset();
              onOpenChange(true);
            }}
            size="sm"
          >
            <Plus className="mr-1 h-4 w-4" />
            Crea torneo
          </Button>
        )}
      </div>
      {query.isLoading && <p>Caricamento tornei…</p>}
      {query.isError && (
        <div role="alert">
          <p>Impossibile caricare i tornei condivisi.</p>
          <Button variant="outline" onClick={() => query.refetch()}>
            Riprova
          </Button>
        </div>
      )}
      {!query.isLoading && !query.isError && !query.data?.length && (
        <p className="text-sm text-muted-foreground">
          Nessun nuovo torneo condiviso per questa annata. I tornei precedenti
          restano disponibili sotto.
        </p>
      )}
      {query.data?.map((t) => (
        <article key={t.id} className="rounded-xl border p-4 space-y-3">
          <div>
            <h3 className="font-semibold">{t.name}</h3>
            <p className="text-sm text-muted-foreground">
              {t.startDate}
              {t.endDate && t.endDate !== t.startDate ? ` — ${t.endDate}` : ""}
              {t.location ? ` · ${t.location}` : ""}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Un unico torneo · annate accessibili al tuo profilo
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {t.teams.map((participant) => (
              <a
                key={participant.id}
                href={`${base(participant.id)}?phase=tornei&sharedTournament=${t.id}`}
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-3 text-sm font-medium hover:bg-muted ${selected?.id === t.id && participant.id === teamId ? "border-primary bg-primary/5" : ""}`}
              >
                <span>
                  {participant.name}
                  <span className="block text-xs font-normal text-muted-foreground">
                    Apri programma e partite dell’annata
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </a>
            ))}
          </div>
        </article>
      ))}
      {selected && (
        <SharedTournamentCommon
          key={selected.id}
          tournament={selected}
          canManage={canManage}
        />
      )}
      {selected && (
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h3 className="font-semibold">
                {current?.name} · {selected.name}
              </h3>
              <p className="text-xs text-muted-foreground">
                Programma dell’annata selezionata. Convocazioni e schieramenti
                rimangono nelle singole partite.
              </p>
            </div>
          </div>
          <SharedTournamentProgram
            id={selected.id}
            teamId={teamId}
            teamName={current?.name ?? ""}
            startDate={selected.startDate}
            canManage={canManage}
            basePath={base(teamId)}
          />
        </section>
      )}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Crea torneo</DialogTitle>
            <DialogDescription>
              Inserisci i dati comuni una sola volta e scegli una o più annate.
              Ogni annata avrà il proprio programma.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="shared-name">Nome torneo</Label>
              <Input
                id="shared-name"
                required
                maxLength={180}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="shared-location">Luogo</Label>
              <Input
                id="shared-location"
                maxLength={500}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="shared-start">Data inizio</Label>
                <Input
                  id="shared-start"
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="shared-end">Data fine</Label>
                <Input
                  id="shared-end"
                  type="date"
                  min={startDate}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <fieldset className="space-y-2">
              <legend className="font-medium">Annate partecipanti</legend>
              <p className="text-xs text-muted-foreground">
                Stessa stagione e settore. Puoi selezionare una o più annate.
              </p>
              <Input
                aria-label="Cerca annata partecipante"
                placeholder="Cerca annata"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="max-h-52 overflow-y-auto rounded-lg border p-2">
                {eligible
                  .filter((t) =>
                    t.name
                      .toLocaleLowerCase()
                      .includes(search.toLocaleLowerCase()),
                  )
                  .map((t) => (
                    <label key={t.id} className="flex items-center gap-3 p-3">
                      <Checkbox
                        checked={teamIds.includes(t.id)}
                        onCheckedChange={(checked) =>
                          setTeamIds((old) =>
                            checked
                              ? [...new Set([...old, t.id])]
                              : old.filter((id) => id !== t.id),
                          )
                        }
                      />
                      {t.name}
                    </label>
                  ))}
              </div>
              <p className="text-xs">{teamIds.length} annate selezionate</p>
            </fieldset>
            {create.isError && (
              <p role="alert" className="text-sm text-destructive">
                {create.error.message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Annulla
              </Button>
              <Button disabled={create.isPending || !teamIds.includes(teamId)}>
                {create.isPending ? "Creazione…" : "Crea torneo"}
              </Button>
            </div>
            {!teamIds.includes(teamId) && (
              <p className="text-xs">
                Mantieni selezionata anche l’annata dalla quale stai creando il
                torneo.
              </p>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
