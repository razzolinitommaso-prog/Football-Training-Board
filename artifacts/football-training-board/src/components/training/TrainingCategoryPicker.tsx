import { useState } from "react";
import { TRAINING_CATEGORIES, trainingCategories, encodeTrainingCategories, trainingCategoryLabel } from "@workspace/api-zod";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

const contexts = ["with_ball", "without_ball"];

export function TrainingCategoryPicker({ value, onChange, section }: { value: string | null; onChange: (value: string) => void; section?: string | null }) {
  const { section: active } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const selected = trainingCategories(value);
  const categories = [...new Set([...TRAINING_CATEGORIES, ...selected])].filter(key => !contexts.includes(key));
  const categorySelection = selected.filter(key => !contexts.includes(key));
  const label = (key: string) => trainingCategoryLabel(key, section ?? active);
  const toggle = (key: string) => onChange(encodeTrainingCategories(selected.includes(key) ? selected.filter(item => item !== key) : [...selected, key]));

  return <div className="space-y-3 rounded-lg border p-3">
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Contesto di lavoro</legend>
      <div className="flex flex-wrap gap-2">
        {contexts.map(key => <Button key={key} type="button" size="sm" variant={selected.includes(key) ? "secondary" : "outline"}
          aria-pressed={selected.includes(key)} onClick={() => toggle(key)}>{selected.includes(key) && "✓ "}{label(key)}</Button>)}
      </div>
    </fieldset>
    <div className="space-y-2 border-t pt-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Categorie</p>
        <Button type="button" size="sm" variant="ghost" className="hidden @min-[620px]:inline-flex" aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}>{expanded ? "Chiudi" : `${categorySelection.length} selezionate · Apri`}</Button>
      </div>
      {categorySelection.length > 0 && <p className="hidden text-xs text-muted-foreground @min-[620px]:block">{categorySelection.map(label).join(" · ")}</p>}
      <fieldset aria-label="Categorie" className={`grid gap-2 ${expanded ? "" : "@min-[620px]:hidden"}`}>
        {categories.map(key => <label key={key} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={selected.includes(key)} onChange={() => toggle(key)} />{label(key)}
        </label>)}
      </fieldset>
    </div>
  </div>;
}
