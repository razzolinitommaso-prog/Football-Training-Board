import { useId, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TRAINING_PRINCIPLES, customTrainingPrinciple, encodeCustomTrainingPrinciple, normalizePrincipleSection, trainingPrinciple, trainingPrincipleLabel } from "@workspace/api-zod";
import { useAuth } from "@/hooks/use-auth";
import { withApi } from "@/lib/api-base";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Choice = { parent: string; label: string; value: string };

const triggerClass = "h-auto min-h-9 min-w-0 w-full whitespace-normal text-left [&>span]:line-clamp-none [&>span]:[overflow-wrap:anywhere] [&>svg]:shrink-0";

export function PrinciplePicker({ value, onChange, section, categories }: {
  value: string;
  onChange: (value: string) => void;
  section?: string | null;
  categories: ReactNode;
}) {
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

  function renderDraft(parent: string | undefined, label: string) {
    if (!draft || draft.parent !== parent) return null;
    return <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <label htmlFor={draftId} className="text-xs font-medium">{label}</label>
      <Input id={draftId} value={draft.text} maxLength={160} disabled={saving} autoFocus
        onChange={event => setDraft({ ...draft, text: event.target.value })}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void useDraft(false); } }} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={saving || !draft.text.trim()} onClick={() => void useDraft(false)}>Usa nella stazione</Button>
        <Button type="button" size="sm" disabled={saving || !draft.text.trim()} onClick={() => void useDraft(true)}>Salva come mia voce</Button>
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => { setDraft(null); setError(""); }}>Annulla</Button>
      </div>
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>;
  }

  const detailPicker = <div className="space-y-2">
    <ScrollableSelect className={triggerClass} aria-label="Dettaglio del principio" value={detailValue} disabled={!sub || saving} onValueChange={next => next === "__write" && sub ? openDraft(sub.value) : choose(next || sub?.value || "")}>
      <option value="">Solo sottoprincipio</option>
      {details.map(item => <option key={item.value} value={item.value}>{item.detail}</option>)}
      {sub && personalOptions(sub.value)}{sub && <option value="__write">Scrivi un dettaglio</option>}
    </ScrollableSelect>
    {renderDraft(sub?.value, "Dettaglio libero")}
  </div>;

  return <section className="@container rounded-lg border bg-background p-3 sm:p-4" aria-label="Principi e contesto della stazione">
    <div className="grid min-w-0 items-start gap-4 @min-[620px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Principio e sottoprincipio</h3>
          {scope && <span className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-xs text-primary">Catalogo {names[scope]}</span>}
        </div>
        {scope ? <>
          <Button type="button" size="sm" variant="link" className="h-auto px-0 py-0 text-xs" disabled={saving} onClick={() => openDraft("")}>Scrivi un principio libero</Button>
          <div className="flex flex-wrap gap-2">
            <label className="min-w-0 flex-[1_1_10rem] space-y-1 text-xs">Area
              <ScrollableSelect className={triggerClass} aria-label="Area del principio" value={area} disabled={saving} onValueChange={next => { setChosenArea(next); choose(""); }}>
                <option value="">Scegli area</option>{areas.map(item => <option key={item} value={item}>{item}</option>)}
              </ScrollableSelect>
            </label>
            <label className="min-w-0 flex-[1_1_10rem] space-y-1 text-xs">Principio
              <ScrollableSelect className={triggerClass} aria-label="Principio principale" value={custom?.parent === "" ? value : root?.value ?? ""} disabled={saving} onValueChange={choose}>
                <option value="">{area ? "Scegli principio" : "Scegli un’area o una voce personale"}</option>
                {roots.map(item => <option key={item.value} value={item.value}>{item.principle}</option>)}{personalOptions("")}
              </ScrollableSelect>
            </label>
          </div>
          {renderDraft("", "Principio libero")}
          <label className="block space-y-1 text-xs">Sottoprincipio (facoltativo)
            <ScrollableSelect className={triggerClass} aria-label="Sottoprincipio" value={subValue} disabled={!root || saving} onValueChange={next => next === "__write" && root ? openDraft(root.value) : choose(next || root?.value || "")}>
              <option value="">Solo principio principale</option>
              {subs.map(item => <option key={item.value} value={item.value}>{item.subprinciple}</option>)}
              {root && personalOptions(root.value)}{root && <option value="__write">Scrivi un sottoprincipio</option>}
            </ScrollableSelect>
          </label>
          {renderDraft(root?.value, "Sottoprincipio libero")}
        </> : <ScrollableSelect className={triggerClass} aria-label="Catalogo principi" value={chosenSection} onValueChange={next => { setChosenSection(next); setChosenArea(""); setDraft(null); }}>
          <option value="">Scegli contesto</option>{Object.entries(names).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </ScrollableSelect>}
        {value && !compatible && custom?.parent !== "" && <p className="break-words text-xs text-muted-foreground">Valore selezionato: <strong>{trainingPrincipleLabel(value)}</strong></p>}
        {isError && <p className="text-xs text-muted-foreground">Voci personali al momento non disponibili.</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-3 @min-[620px]:border-l @min-[620px]:pl-4">
        {scope && <details className="space-y-2 @min-[620px]:order-2 @min-[620px]:border-t @min-[620px]:pt-3" open={detailValue ? true : undefined}>
          <summary className="cursor-pointer text-sm font-medium">Dettaglio facoltativo</summary>
          {sub ? detailPicker : <p className="text-xs text-muted-foreground">Scegli un sottoprincipio per aggiungere un dettaglio.</p>}
        </details>}
        {categories}
      </div>
    </div>
  </section>;
}
