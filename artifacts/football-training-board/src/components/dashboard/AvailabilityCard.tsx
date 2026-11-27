import { useRef, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Row = {
  id: number;
  firstName?: string;
  lastName?: string;
  teamName?: string | null;
  birthYear?: string | null;
  unavailabilityReason?: string | null;
  expectedReturn?: string | null;
};
export function AvailabilityCard({
  players,
  path,
  role,
  error,
  retry,
  reason,
}: {
  players: Row[];
  path: string;
  role: string;
  error: boolean;
  retry: () => void;
  reason: (value: string) => string;
}) {
  const restored = window.history.state?.availabilityAlerts;
  const [open, setOpen] = useState(!!restored?.open);
  const [search, setSearch] = useState(restored?.search ?? "");
  const [team, setTeam] = useState(restored?.team ?? "");
  const scroll = useRef<HTMLDivElement>(null);
  const teams = [
    ...new Set(players.map((p) => p.teamName || "Senza squadra")),
  ].sort((a, b) => a.localeCompare(b, "it"));
  const filtered = players
    .filter(
      (p) =>
        (!team || (p.teamName || "Senza squadra") === team) &&
        `${p.lastName} ${p.firstName} ${p.teamName ?? ""} ${p.birthYear ?? ""}`
          .toLocaleLowerCase("it")
          .includes(search.toLocaleLowerCase("it")),
    )
    .sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(
        `${b.lastName} ${b.firstName}`,
        "it",
      ),
    );
  return (
    <Card role="region" aria-label="Avviso giocatori indisponibili">
      <CardContent className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Disponibilità giocatori</h2>
            <p className="text-sm text-muted-foreground">
              {players.length} indisponibili · riepilogo della rosa selezionata
            </p>
          </div>
          <Button variant="outline" onClick={() => setOpen(true)}>
            Apri per annata o giocatore
          </Button>
        </div>
        {error && (
          <p role="alert">
            Elenco non disponibile.{" "}
            <Button variant="outline" onClick={retry}>
              Riprova elenco indisponibili
            </Button>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {teams.map((name) => (
            <Button
              key={name}
              variant="outline"
              size="sm"
              onClick={() => {
                setTeam(name);
                setOpen(true);
              }}
            >
              {name} ·{" "}
              {
                players.filter((p) => (p.teamName || "Senza squadra") === name)
                  .length
              }
            </Button>
          ))}
        </div>
        <Dialog
          open={open}
          onOpenChange={(value) => {
            setOpen(value);
            if (!value)
              window.history.replaceState(
                { ...window.history.state, availabilityAlerts: undefined },
                "",
              );
          }}
        >
          <DialogContent
            className="max-w-3xl max-h-[90dvh] overflow-y-auto"
            ref={scroll}
            onOpenAutoFocus={() => {
              requestAnimationFrame(() => {
                if (scroll.current && restored?.scrollTop)
                  scroll.current.scrollTop = restored.scrollTop;
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Giocatori indisponibili</DialogTitle>
            </DialogHeader>
            <Input
              aria-label="Cerca giocatore o squadra"
              placeholder="Cerca giocatore o squadra"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="text-sm">
              Annata / squadra
              <select
                className="mt-1 block w-full rounded-md border bg-background p-2"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
              >
                <option value="">Tutte</option>
                {teams.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <p className="text-sm text-muted-foreground">
              {filtered.length} giocatori
            </p>
            {filtered.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border p-4 flex flex-wrap justify-between items-center gap-3"
              >
                <div>
                  <h3 className="font-semibold">
                    {p.lastName} {p.firstName}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {p.birthYear ? `Annata ${p.birthYear} · ` : ""}
                    {p.teamName || "Senza squadra"}
                  </p>
                  <p className="text-sm">
                    {reason(p.unavailabilityReason ?? "other")}
                    {p.expectedReturn ? ` · Rientro: ${p.expectedReturn}` : ""}
                  </p>
                </div>
                <Link
                  className="text-primary underline text-sm"
                  href={`${path}?openPlayerId=${p.id}${role === "secretary" ? "&mode=edit" : ""}`}
                  state={{ fromPlayerAlerts: true }}
                  onClick={() =>
                    window.history.replaceState(
                      {
                        ...window.history.state,
                        availabilityAlerts: {
                          open: true,
                          search,
                          team,
                          scrollTop: scroll.current?.scrollTop ?? 0,
                        },
                      },
                      "",
                    )
                  }
                >
                  {role === "secretary" ? "Modifica scheda" : "Apri scheda"} ↗
                </Link>
              </div>
            ))}
            {!filtered.length && <p>Nessun giocatore con questi filtri.</p>}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
