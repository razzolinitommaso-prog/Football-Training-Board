import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { withApi } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import SharedTournamentHub from "@/pages/calendari/SharedTournamentHub";
type Match = {
  id: number;
  opponent: string;
  date: string;
  competition?: string | null;
  location?: string | null;
  homeAway: string;
};
type Team = {
  id: number;
  name: string;
  clubSection?: string | null;
  seasonId?: number | null;
};
export function ScheduleSupport({
  team,
  matches,
  open,
  onOpenChange,
}: {
  team: Team;
  matches: Match[];
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const qc = useQueryClient(),
    { toast } = useToast();
  const teams = useQuery({
    queryKey: ["schedule-support-teams", team.clubSection],
    queryFn: async () => {
      const r = await fetch(
        withApi(`/api/teams?section=${team.clubSection ?? "scuola_calcio"}`),
        { credentials: "include" },
      );
      if (!r.ok) throw Error("Elenco annate non disponibile");
      return r.json() as Promise<Team[]>;
    },
    enabled: open,
  });
  const [createTournament, setCreateTournament] = useState(false);
  const [tournaments, setTournaments] = useState(false),
    [search, setSearch] = useState("");
  const [original, setOriginal] = useState<Match | null>(null),
    [draft, setDraft] = useState({
      opponent: "",
      date: "",
      competition: "Amichevole",
      location: "",
      homeAway: "home",
    });
  const [editing, setEditing] = useState(false);
  const save = useMutation({
    mutationFn: async () => {
      if (!draft.opponent.trim() || !draft.date)
        throw Error("Indica avversario, giorno e ora");
      const response = await fetch(
        withApi(`/api/matches${original ? `/${original.id}` : ""}`),
        {
          method: original ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...draft,
            date: new Date(draft.date).toISOString(),
            teamId: team.id,
          }),
        },
      );
      if (!response.ok)
        throw Error(
          (await response.json()).error ?? "Salvataggio non riuscito",
        );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["/api/matches"] });
      setEditing(false);
      toast({ title: "Programma gare aggiornato" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Supporto gare · {team.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Aggiorna il programma organizzativo. Le schede tecniche restano
            affidate allo staff.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setTournaments(true)}>
              Programmi tornei · importa e aggiorna
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setOriginal(null);
                setDraft({
                  opponent: "",
                  date: "",
                  competition: "Amichevole",
                  location: "",
                  homeAway: "home",
                });
                setEditing(true);
              }}
            >
              Aggiungi gara / amichevole
            </Button>
          </div>
          <Input
            placeholder="Cerca torneo o avversario"
            aria-label="Cerca gare"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {matches
            .filter((m) =>
              `${m.opponent} ${m.competition ?? ""}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((m) => (
              <div
                className="rounded-xl border p-3 flex flex-wrap items-center justify-between gap-3"
                key={m.id}
              >
                <div>
                  <strong>{m.opponent}</strong>
                  <p className="text-sm">
                    {new Date(m.date).toLocaleString("it-IT")} ·{" "}
                    {m.competition || "Gara"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {m.location || "Campo da definire"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setOriginal(m);
                    const d = new Date(m.date);
                    setDraft({
                      opponent: m.opponent,
                      date: new Date(
                        d.getTime() - d.getTimezoneOffset() * 60000,
                      )
                        .toISOString()
                        .slice(0, 16),
                      competition: m.competition ?? "",
                      location: m.location ?? "",
                      homeAway: m.homeAway,
                    });
                    setEditing(true);
                  }}
                >
                  Rivedi programma
                </Button>
              </div>
            ))}
        </DialogContent>
      </Dialog>
      <Dialog open={tournaments} onOpenChange={setTournaments}>
        <DialogContent className="max-w-5xl max-h-[90dvh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Programmi tornei · supporto Segreteria</DialogTitle>
          </DialogHeader>
          <SharedTournamentHub
            teamId={team.id}
            teams={teams.data ?? [team]}
            canManage
            inlineNavigation
            open={createTournament}
            onOpenChange={setCreateTournament}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {original ? "Rivedi e aggiorna gara" : "Nuova gara"}
            </DialogTitle>
          </DialogHeader>
          {original && (
            <p className="rounded-md bg-muted p-3 text-sm">
              Prima: {original.opponent} ·{" "}
              {new Date(original.date).toLocaleString("it-IT")} ·{" "}
              {original.location || "Campo da definire"}. L’aggiornamento
              conserva la gara e i dati tecnici.
            </p>
          )}
          {(
            [
              ["opponent", "Avversario", "text"],
              ["date", "Giorno e ora", "datetime-local"],
              ["competition", "Competizione", "text"],
              ["location", "Campo", "text"],
            ] as const
          ).map(([key, label, type]) => (
            <label className="text-sm" key={key}>
              {label}
              <Input
                type={type}
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </label>
          ))}
          <label>
            Casa / trasferta
            <select
              className="block border rounded-md p-2 w-full"
              value={draft.homeAway}
              onChange={(e) => setDraft({ ...draft, homeAway: e.target.value })}
            >
              <option value="home">Casa</option>
              <option value="away">Trasferta</option>
            </select>
          </label>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Conferma aggiornamento
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
