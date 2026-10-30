import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
export function StationVariants({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  return <section className="space-y-2 rounded-lg border p-3">
    <div className="flex items-center justify-between gap-2"><Label>Varianti della stazione</Label><Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, ""])}>+ Variante</Button></div>
    <p className="text-xs text-muted-foreground">Adattamenti della stazione nel suo insieme. Restano separate le varianti dei singoli esercizi.</p>
    {value.map((variant, index) => <div key={index} className="flex items-start gap-2"><Textarea aria-label={`Variante stazione ${index + 1}`} rows={2} value={variant} onChange={event => onChange(value.map((item, i) => i === index ? event.target.value : item))} /><Button type="button" variant="ghost" size="sm" aria-label={`Rimuovi variante stazione ${index + 1}`} onClick={() => onChange(value.filter((_, i) => i !== index))}>−</Button></div>)}
  </section>;
}
export function StationVariantsView({ value }: { value: string[] }) {
  if (!value.some(item => item.trim())) return null;
  return <section className="space-y-2"><Label>Varianti della stazione</Label><ul className="list-disc space-y-1 rounded-md border bg-muted/30 py-3 pl-7 pr-3 text-sm">{value.filter(item => item.trim()).map((item, index) => <li key={index} className="whitespace-pre-wrap break-words">{item}</li>)}</ul></section>;
}
