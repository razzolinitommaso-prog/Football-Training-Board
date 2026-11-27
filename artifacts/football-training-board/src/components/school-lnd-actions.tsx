import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { withApi } from "@/lib/api-base";
import { LndSyncDialog } from "@/pages/championships/SectionChampionshipsPage";
type Source = {
  id: number;
  title: string;
  teamId?: number | null;
  sourceProvider?: string | null;
  sourceUrl?: string | null;
};
export function SchoolLndActions({
  teams,
}: {
  teams: { id: number; name: string }[];
}) {
  const { club, user, role } = useAuth(),
    [open, setOpen] = useState(false),
    [team, setTeam] = useState(""),
    [source, setSource] = useState("");
  const canManage = [
    "admin",
    "presidente",
    "director",
    "secretary",
    "sporting_director",
    "technical_director",
    "coach",
    "fitness_coach",
    "athletic_director",
  ].includes(role ?? "");
  const query = useQuery({
    queryKey: [
      "/api/championships",
      "scuola_calcio",
      "page",
      club?.id,
      user?.id,
      role,
    ],
    queryFn: async () => {
      const r = await fetch(
        withApi("/api/championships?section=scuola_calcio"),
        { credentials: "include" },
      );
      if (!r.ok) throw Error("Collegamenti LND non disponibili");
      return r.json() as Promise<Source[]>;
    },
    enabled: canManage,
  });
  const sources = (query.data ?? []).filter(
    (s) =>
      s.sourceProvider === "lnd" &&
      (!team || s.teamId == null || s.teamId === Number(team)),
  );
  const selected = sources.find((s) => String(s.id) === source);
  const url =
    selected?.sourceUrl &&
    /^https:\/\/gare\.lnd\.it\//i.test(selected.sourceUrl)
      ? selected.sourceUrl
      : null;
  return (
    <section
      aria-label="Collegamento LND Scuola Calcio"
      className="mt-4 rounded-xl border bg-card p-4 space-y-3"
    >
      <h2 className="font-semibold">Collegamento Gare LND · Scuola Calcio</h2>
      <p className="text-sm text-muted-foreground">
        Collega il programma disponibile su LND. Calendari, fasi e tornei delle
        annate restano accessibili qui sotto; i dati non pubblicati dalla fonte
        non vengono inventati.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        {canManage && (
          <>
            <label className="min-w-0 text-sm">
              Annata
              <select
                className="block w-full max-w-80 border rounded p-2 bg-background"
                value={team}
                onChange={(e) => {
                  setTeam(e.target.value);
                  setSource("");
                }}
              >
                <option value="">Collegamento di settore</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-sm">
              Fonte salvata
              <select
                className="block w-full max-w-80 border rounded p-2 bg-background"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="">Nuovo collegamento</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            {url && (
              <Button variant="outline" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  Apri fonte LND
                </a>
              </Button>
            )}
            <Button
              onClick={() => setOpen(true)}
              disabled={query.isPending || query.isError}
            >
              Sincronizza LND
            </Button>
            {query.isError && (
              <span role="alert">
                Elenco fonti non disponibile.{" "}
                <Button variant="outline" onClick={() => void query.refetch()}>
                  Riprova fonti LND
                </Button>
              </span>
            )}
          </>
        )}
        {role !== "secretary" && (
          <Button variant="outline" asChild>
            <Link
              href={`/scuola-calcio/campionati${team ? `?teamId=${team}` : ""}`}
            >
              Risultati e gironi LND
            </Link>
          </Button>
        )}
      </div>
      {canManage && (
        <LndSyncDialog
          key={`${source}:${team}`}
          section="scuola_calcio"
          open={open}
          onOpenChange={setOpen}
          initialUrl={url}
          teamId={selected ? (selected.teamId ?? null) : (Number(team) || null)}
        />
      )}
    </section>
  );
}
