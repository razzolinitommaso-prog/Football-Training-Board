import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TRAINING_PRINCIPLES, customTrainingPrinciple, encodeCustomTrainingPrinciple, normalizePrincipleSection, trainingPrinciple, trainingPrincipleLabel } from "@workspace/api-zod";
import { useAuth } from "@/hooks/use-auth";
import { withApi } from "@/lib/api-base";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Choice = { parent: string; label: string; value: string };

export function PrinciplePicker({ value, onChange, section }: { value: string; onChange: (value: string) => void; section?: string | null }) {
  const { section: activeSection, club, user } = useAuth();
  const [chosenSection, setChosenSection] = useState("");
  const [chosenArea, setChosenArea] = useState("");
  const [draft, setDraft] = useState<{ parent: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const draftId = useId();
  const scope = normalizePrincipleSection(section) ?? normalizePrincipleSection(activeSection) ?? normalizePrincipleSection(chosenSection);
  const custom = customTrainingPrinciple(value);
  const selected = trainingPrinciple(custom ? custom.parent : value);
  const compatible = selected?.section === scope ? selected : undefined;
  const catalog = TRAINING_PRINCIPLES.filter(item => item.section === scope);
  const areas = [...new Set(catalog.map(item => item.area))];
  const area = compatible?.area ?? (areas.includes(chosenArea) ? chosenArea : "");
  const roots = catalog.filter(item => item.depth === 1 && item.area === area);
  const root = compatible?.depth === 1 ? compatible : compatible ? roots.find(item => item.principle === compatible.principle) : undefined;
  const subs = catalog.filter(item => item.parent === root?.value);
  const sub = compatible?.depth === 2 ? compatible : compatible?.depth === 3 ? subs.find(item => item.value === compatible.parent) : undefined;
  const details = catalog.filter(item => item.parent === sub?.value);
  const names = { scuola_calcio: "Scuola Calcio", settore_giovanile: "Settore Giovanile", prima_squadra: "Prima Squadra" };
  const endpoint = withApi(`/api/training-principle-choices?section=${scope ?? ""}`);
  const queryKey = ["training-principle-choices", club?.id, user?.id, scope];
  const queryClient = useQueryClient();
  const { data: choices = [], isError } = useQuery<Choice[]>({
    queryKey, enabled: Boolean(club?.id && user?.id && scope), staleTime: 30_000, retry: false,
    queryFn: async ({ signal }) => {
      const response = await fetch(endpoint, { signal, credentials: "include" });
      if (!response.ok) throw new Error("Impossibile caricare le voci personali");
      return response.json();
    },
  });
  const personalOptions = (parent: string) => {
    const matches = choices.filter(choice => choice.parent === parent);
    if (custom?.parent === parent && !matches.some(choice => choice.value === value)) {
      matches.push({ ...custom, value });
    }
    return matches.length ? <optgroup label="Le mie voci">{matches.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</optgroup> : null;
  };

  function choose(next: string) {
    setDraft(null);
    setError("");
    onChange(next);
  }

  async function useDraft(remember: boolean) {
    if (!draft?.text.trim()) return;
    if (!remember) { choose(encodeCustomTrainingPrinciple(draft.parent, draft.text)); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent: draft.parent, label: draft.text }),
      });
      if (!response.ok) throw new Error();
      const saved: Choice = await response.json();
      queryClient.setQueryData<Choice[]>(queryKey, current => [...(current ?? []).filter(choice => choice.value !== saved.value), saved]);
      choose(saved.value);
    } catch {
      setError("Impossibile salvare la voce personale. Puoi usarla in questa stazione e riprovare più tardi.");
    } finally { setSaving(false); }
  }

  const subValue = custom && compatible?.depth === 1 ? value : sub?.value ?? "";
  const detailValue = custom && compatible?.depth === 2 ? value : compatible?.depth === 3 ? value : "";
  const openDraft = (parent: string) => { setError(""); setDraft({ parent, text: custom?.parent === parent ? custom.label : "" }); };

  return <div className="space-y-3 rounded-lg border bg-background p-3">
    {scope ? <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-medium text-primary">Catalogo {names[scope]}</p>
      <Button type="button" size="sm" variant="ghost" onClick={() => openDraft("")}>Scrivi un principio libero</Button>
    </div> : <ScrollableSelect className="w-full" aria-label="Catalogo principi" value={chosenSection} onValueChange={next => { setChosenSection(next); setChosenArea(""); setDraft(null); }}>
      <option value="">Scegli contesto</option>{Object.entries(names).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
    </ScrollableSelect>}
    {value && !compatible && <p className="text-xs text-muted-foreground">Valore selezionato: <strong>{trainingPrincipleLabel(value)}</strong></p>}
    {scope && <>
      <div className="grid gap-2 xl:grid-cols-2">
        <label className="space-y-1 text-xs">Area<ScrollableSelect className="w-full" aria-label="Area del principio" value={area} onValueChange={next => { setChosenArea(next); choose(""); }}>
          <option value="">Scegli area</option>{areas.map(item => <option key={item} value={item}>{item}</option>)}
        </ScrollableSelect></label>
        <label className="space-y-1 text-xs">Principio<ScrollableSelect className="w-full" aria-label="Principio principale" value={custom?.parent === "" ? value : root?.value ?? ""} onValueChange={choose}>
          <option value="">{area ? "Scegli principio" : "Scegli un’area o una voce personale"}</option>
          {roots.map(item => <option key={item.value} value={item.value}>{item.principle}</option>)}{personalOptions("")}
        </ScrollableSelect></label>
      </div>
      <label className="space-y-1 text-xs">Sottoprincipio (facoltativo)<ScrollableSelect className="w-full" aria-label="Sottoprincipio" value={subValue} disabled={!root} onValueChange={next => next === "__write" ? openDraft(root!.value) : choose(next || root?.value || "")}>
        <option value="">Solo principio principale</option>
        {subs.map(item => <option key={item.value} value={item.value}>{item.subprinciple}</option>)}
        {root && personalOptions(root.value)}{root && <option value="__write">Scrivi un sottoprincipio</option>}
      </ScrollableSelect></label>
      <label className="space-y-1 text-xs">Dettaglio (facoltativo)<ScrollableSelect className="w-full" aria-label="Dettaglio del principio" value={detailValue} disabled={!sub} onValueChange={next => next === "__write" ? openDraft(sub!.value) : choose(next || sub?.value || "")}>
        <option value="">Solo sottoprincipio</option>
        {details.map(item => <option key={item.value} value={item.value}>{item.detail}</option>)}
        {sub && personalOptions(sub.value)}{sub && <option value="__write">Scrivi un dettaglio</option>}
      </ScrollableSelect></label>
      {draft && <div className="space-y-2 rounded-md border bg-muted/30 p-2">
        <label htmlFor={draftId} className="text-xs font-medium">{draft.parent ? compatible?.depth === 2 && draft.parent === sub?.value ? "Dettaglio libero" : "Voce libera" : "Principio libero"}</label>
        <Input id={draftId} value={draft.text} maxLength={160} disabled={saving}
          onChange={event => setDraft({ ...draft, text: event.target.value })}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void useDraft(false); } }} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={saving || !draft.text.trim()} onClick={() => void useDraft(false)}>Usa nella stazione</Button>
          <Button type="button" size="sm" disabled={saving || !draft.text.trim()} onClick={() => void useDraft(true)}>Salva come mia voce</Button>
          <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => { setDraft(null); setError(""); }}>Annulla</Button>
        </div>
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      </div>}
      {isError && <p className="text-xs text-muted-foreground">Voci personali al momento non disponibili.</p>}
    </>}
  </div>;
}
