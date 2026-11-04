import { Link } from "wouter";
import {
  useTechnicalScope,
  technicalSections,
} from "@/components/technical-scope";
import { Button } from "@/components/ui/button";
import SectionChampionshipsPage from "./SectionChampionshipsPage";

export default function TechnicalChampionshipsPage() {
  const scope = useTechnicalScope();
  if (scope.loading) return <p role="status">Caricamento annate…</p>;
  if (scope.error)
    return (
      <p role="alert">Impossibile caricare le annate. Ricarica la pagina.</p>
    );
  const section = scope.section;
  if (section === "settore_giovanile" || section === "prima_squadra") {
    return (
      <SectionChampionshipsPage
        key={`${section}:${scope.teamId ?? "all"}`}
        section={section}
        scopeTeamId={scope.teamId ?? null}
        scopeBasePath="/technical/championships"
        onClearTeam={() => scope.setTeam("all")}
      />
    );
  }
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <h1 className="text-2xl font-semibold">Campionati e classifiche</h1>
      <p className="text-sm text-muted-foreground">
        Seleziona il Settore Giovanile o la Prima Squadra per consultare i
        campionati, le classifiche LND e i collegamenti di aggiornamento
        dell’annata.
      </p>
      <div className="flex flex-wrap gap-2">
        {(["settore_giovanile", "prima_squadra"] as const)
          .filter((key) => scope.teams.some((team) => team.clubSection === key))
          .map((key) => (
            <Button
              key={key}
              variant="outline"
              onClick={() => scope.setSection(key)}
            >
              {technicalSections[key]}
            </Button>
          ))}
      </div>
      {section === "scuola_calcio" && (
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            Per la Scuola Calcio, fasi, tornei e impegni restano nel programma
            partite dell’annata.
          </p>
          <Button variant="outline" asChild>
            <Link href="/technical/matches">Apri partite delle annate</Link>
          </Button>
        </div>
      )}
    </section>
  );
}
