import { useDialogViewport } from "@/hooks/use-dialog-viewport";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const RECENTS_KEY = "ftb.recentExerciseMaterials";
function readRecents(): string[] {
  try { const value = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]"); return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []; } catch { return []; }
}

type Material = { id: string; label: string; category?: string };
export function MaterialPicker({ options, selection, onConfirm }: {
  options: readonly Material[];
  selection: Partial<Record<string, number>>;
  onConfirm: (selection: Partial<Record<string, number>>) => void;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const dialogViewport = useDialogViewport(open);
  const [recents, setRecents] = useState<string[]>(readRecents);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(selection);
  const count = Object.values(selection).filter(q => Number(q) > 0).length;
  const preferred = [...new Set([...Object.keys(selection).filter(id => Number(selection[id]) > 0), ...recents, "palloni", "cinesini", "coni", "casacche", "porticine"])];
  const rank = (id: string) => preferred.includes(id) ? preferred.indexOf(id) : preferred.length;
  const visible = options.filter(o => `${o.label} ${o.category ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim())).sort((a,b) => rank(a.id) - rank(b.id));
  return <>
    <Button type="button" variant="outline" onClick={() => { setDraft({ ...selection }); setRecents(readRecents()); setSearch(""); setOpen(true); }}>Seleziona materiali{count ? ` (${count})` : ""}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent style={dialogViewport} className="flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl flex-col overflow-hidden">
        <DialogHeader><DialogTitle>Materiali</DialogTitle><DialogDescription>Cerca, scegli i materiali e indica le quantità. Recenti e già selezionati per primi.</DialogDescription></DialogHeader>
        <Input aria-label="Cerca materiale" placeholder="Cerca materiale..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
          {visible.map(o => <div key={o.id} className="flex min-h-12 items-center gap-3 rounded-lg border p-3">
            <Checkbox id={`${uid}-${o.id}`} aria-label={o.label} checked={Number(draft[o.id]) > 0} onCheckedChange={checked => setDraft(prev => { const next = { ...prev }; if (checked) next[o.id] = 1; else delete next[o.id]; return next; })} />
            <label htmlFor={`${uid}-${o.id}`} className="min-w-0 flex-1 cursor-pointer break-words text-sm">{o.label}{o.category && <span className="block text-xs text-muted-foreground">{o.category}</span>}</label>
            {Number(draft[o.id]) > 0 && <Input aria-label={`Quantità ${o.label}`} className="w-20 shrink-0" type="number" min={1} step={1} value={draft[o.id]} onChange={e => { const qty = Number(e.target.value); if (Number.isFinite(qty) && qty >= 1) setDraft(prev => ({ ...prev, [o.id]: Math.floor(qty) })); }} />}
          </div>)}
          {!visible.length && <p className="py-4 text-sm text-muted-foreground">Nessun materiale trovato.</p>}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Annulla</Button><Button type="button" onClick={() => { const next = [...new Set([...Object.keys(draft).filter(id => Number(draft[id]) > 0), ...recents])].slice(0, 12); try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* Selection remains usable when storage is unavailable. */ } setRecents(next); onConfirm(draft); setOpen(false); }}>Conferma materiali</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}
