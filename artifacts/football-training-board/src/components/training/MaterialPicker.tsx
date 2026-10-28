import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Material = { id: string; label: string; category?: string };
export function MaterialPicker({ options, selection, onConfirm }: {
  options: readonly Material[];
  selection: Partial<Record<string, number>>;
  onConfirm: (selection: Partial<Record<string, number>>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(selection);
  const count = Object.values(selection).filter(q => Number(q) > 0).length;
  const visible = options.filter(o => `${o.label} ${o.category ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()));
  return <>
    <Button type="button" variant="outline" onClick={() => { setDraft({ ...selection }); setSearch(""); setOpen(true); }}>Seleziona materiali{count ? ` (${count})` : ""}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl flex-col overflow-hidden">
        <DialogHeader><DialogTitle>Materiali</DialogTitle><DialogDescription>Cerca, scegli i materiali e indica le quantità.</DialogDescription></DialogHeader>
        <Input aria-label="Cerca materiale" placeholder="Cerca materiale..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
          {visible.map(o => <label key={o.id} className="flex min-h-12 items-center gap-3 rounded-lg border p-3">
            <Checkbox checked={Number(draft[o.id]) > 0} onCheckedChange={checked => setDraft(prev => { const next = { ...prev }; if (checked) next[o.id] = 1; else delete next[o.id]; return next; })} />
            <span className="min-w-0 flex-1 break-words text-sm">{o.label}{o.category && <span className="block text-xs text-muted-foreground">{o.category}</span>}</span>
            {Number(draft[o.id]) > 0 && <Input aria-label={`Quantità ${o.label}`} className="w-20 shrink-0" type="number" min={1} step={1} value={draft[o.id]} onChange={e => { const qty = Number(e.target.value); if (Number.isFinite(qty) && qty >= 1) setDraft(prev => ({ ...prev, [o.id]: Math.floor(qty) })); }} />}
          </label>)}
          {!visible.length && <p className="py-4 text-sm text-muted-foreground">Nessun materiale trovato.</p>}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Annulla</Button><Button type="button" onClick={() => { onConfirm(draft); setOpen(false); }}>Conferma materiali</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}
