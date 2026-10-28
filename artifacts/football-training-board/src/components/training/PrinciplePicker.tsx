import { useState } from "react";
import { TRAINING_PRINCIPLES, normalizePrincipleSection, trainingPrinciple, trainingPrincipleLabel } from "@workspace/api-zod";
import { useAuth } from "@/hooks/use-auth";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import { Button } from "@/components/ui/button";

export function PrinciplePicker({ value, onChange, section }: { value: string; onChange: (value: string) => void; section?: string | null }) {
  const { section: activeSection } = useAuth();
  const [chosenSection, setChosenSection] = useState("");
  const [chosenArea, setChosenArea] = useState("");
  const scope = normalizePrincipleSection(section) ?? normalizePrincipleSection(activeSection) ?? normalizePrincipleSection(chosenSection);
  const selected = trainingPrinciple(value);
  const compatible = selected?.section === scope ? selected : undefined;
  const area = compatible?.area ?? (TRAINING_PRINCIPLES.some(item => item.section === scope && item.area === chosenArea) ? chosenArea : "");
  const catalog = TRAINING_PRINCIPLES.filter(item => item.section === scope);
  const roots = catalog.filter(item => item.depth === 1 && item.area === area);
  const root = compatible?.depth === 1 ? compatible : compatible ? roots.find(item => item.principle === compatible.principle) : undefined;
  const subs = catalog.filter(item => item.parent === root?.value);
  const sub = compatible?.depth === 2 ? compatible : compatible?.depth === 3 ? subs.find(item => item.value === compatible.parent) : undefined;
  const details = catalog.filter(item => item.parent === sub?.value);
  const names = { scuola_calcio: "Scuola Calcio", settore_giovanile: "Settore Giovanile", prima_squadra: "Prima Squadra" };
  return <div className="space-y-2 rounded-lg border bg-background p-3">
    {scope ? <p className="text-xs font-medium text-primary">Catalogo {names[scope]}</p> : <ScrollableSelect aria-label="Catalogo principi" value={chosenSection} onValueChange={next => { setChosenSection(next); setChosenArea(""); onChange(""); }}><option value="">Scegli contesto</option>{Object.entries(names).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</ScrollableSelect>}
    {value && !compatible && <div className="text-xs text-muted-foreground"><p>Valore salvato: {trainingPrincipleLabel(value)}. Rimane invariato finché scegli un nuovo principio.</p><Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>Scegli dal catalogo</Button></div>}
    {scope && <div className="grid gap-2 sm:grid-cols-2">
      <label className="space-y-1 text-xs">Area<ScrollableSelect aria-label="Area del principio" value={area} onValueChange={next => { setChosenArea(next); onChange(""); }}><option value="">Scegli area</option>{[...new Set(catalog.map(item => item.area))].map(item => <option key={item} value={item}>{item}</option>)}</ScrollableSelect></label>
      <label className="space-y-1 text-xs">Principio<ScrollableSelect aria-label="Principio principale" value={root?.value ?? ""} disabled={!area} onValueChange={onChange}><option value="">Scegli principio</option>{roots.map(item => <option key={item.value} value={item.value}>{item.principle}</option>)}</ScrollableSelect></label>
      <label className="space-y-1 text-xs">Sottoprincipio (facoltativo)<ScrollableSelect aria-label="Sottoprincipio" value={sub?.value ?? ""} disabled={!root} onValueChange={next => onChange(next || root?.value || "")}><option value="">Solo principio principale</option>{subs.map(item => <option key={item.value} value={item.value}>{item.subprinciple}</option>)}</ScrollableSelect></label>
      <label className="space-y-1 text-xs">Dettaglio (facoltativo)<ScrollableSelect aria-label="Dettaglio del principio" value={compatible?.depth === 3 ? compatible.value : ""} disabled={!sub} onValueChange={next => onChange(next || sub?.value || "")}><option value="">Solo sottoprincipio</option>{details.map(item => <option key={item.value} value={item.value}>{item.detail}</option>)}</ScrollableSelect></label>
    </div>}
    {scope === "scuola_calcio" && <p className="text-xs text-muted-foreground">Gioco, tecnica, scoperta e collaborazioni semplici, senza ruoli tattici codificati.</p>}
    {scope === "settore_giovanile" && <p className="text-xs text-muted-foreground">Principi collegati a obiettivi tattici, ruoli e letture di gioco.</p>}
    {scope === "prima_squadra" && <p className="text-xs text-muted-foreground">Modello di gioco e adattamento alla gara e all'avversario.</p>}
  </div>;
}
