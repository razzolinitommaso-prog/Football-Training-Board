import {
  useTechnicalScope,
  technicalSections,
} from "@/components/technical-scope";
import { Button } from "@/components/ui/button";
import SectionMatchCalendars from "./SectionMatchCalendars";
import TechnicalChampionshipsPage from "../championships/TechnicalChampionshipsPage";

export default function ScopedMatchCalendars({
  programming = false,
}: {
  programming?: boolean;
}) {
  const scope = useTechnicalScope();
  // Keep the approved compact championship view. The sector management hub
  // contains legacy editors and must not become the staff consultation page.
  if (!programming && (scope.section === "settore_giovanile" || scope.section === "prima_squadra")) {
    return <TechnicalChampionshipsPage />;
  }
  if (scope.section)
    return (
      <SectionMatchCalendars
        section={scope.section}
        programming={programming}
      />
    );
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <h1 className="text-2xl font-semibold">
        {programming ? "Programmazione gare" : "Partite"}
      </h1>
      <p className="text-sm text-muted-foreground">
        Scegli un settore per aprire i calendari delle annate autorizzate.
      </p>
      <div className="flex flex-wrap gap-2">
        {scope.sections.map((section) => (
          <Button
            key={section}
            variant="outline"
            onClick={() => scope.setSection(section)}
          >
            {technicalSections[section]}
          </Button>
        ))}
      </div>
      {scope.sections.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nessun settore assegnato.
        </p>
      )}
    </section>
  );
}
