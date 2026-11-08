import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Download, FileSpreadsheet, Pencil, Plus, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { withApi } from "@/lib/api-base";
import { exportToExcel } from "@/lib/excel-export";
import { parseExcelFile } from "@/lib/excel-import";
import { feeLabels, parseFeeAmount, parseFeeRows, type FeeInput, type FeeItem, type FeeType } from "@/lib/fee-list";

const formatEuro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const template = [
  { Tipo: "Iscrizione", Codice: "ISCR-01", "Nome quota": "Quota iscrizione", "Importo (€)": "", Attivo: "Sì" },
  { Tipo: "Assicurazione", Codice: "ASS-01", "Nome quota": "Quota assicurazione", "Importo (€)": "", Attivo: "Sì" },
];
const emptyDraft = { itemType: "registration_fee" as FeeType, code: "", name: "", price: "", isActive: true };
type Draft = typeof emptyDraft & { id?: number };
type Catalog = { canEdit: boolean; items: FeeItem[] };

async function requestFeeList<T>(options?: RequestInit): Promise<T> {
  const response = await fetch(withApi("/api/fee-list"), { credentials: "include", ...options });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? "Operazione sul listino non disponibile.");
  }
  return response.json();
}

export default function FeeListPage() {
  const { club, user, role } = useAuth();
  const { toast } = useToast();
  const cache = useQueryClient();
  const importInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [importing, setImporting] = useState(false);
  const list = useQuery({
    queryKey: ["/api/fee-list", club?.id, user?.id, role],
    queryFn: () => requestFeeList<Catalog>(),
    enabled: Boolean(club?.id),
  });
  const save = useMutation({
    mutationFn: ({ rows, createOnly = false }: { rows: FeeInput[]; createOnly?: boolean }) => requestFeeList<{ created: number; updated: number }>({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows, createOnly }),
    }),
    onSuccess: ({ created, updated }) => {
      void cache.invalidateQueries({ queryKey: ["/api/fee-list"] });
      void cache.invalidateQueries({ queryKey: ["/api/warehouse-items"] });
      setDraft(null);
      toast({ title: "Listino salvato", description: created + " nuove voci · " + updated + " aggiornate" });
    },
    onError: error => toast({ title: "Listino non salvato", description: error.message, variant: "destructive" }),
  });

  function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!draft || !list.data?.canEdit) return;
    try {
      save.mutate({ rows: [{ ...draft, price: parseFeeAmount(draft.price) }], createOnly: draft.id === undefined });
    } catch (error) {
      toast({ title: "Controlla l’importo", description: (error as Error).message, variant: "destructive" });
    }
  }

  async function handleImport(file: File | undefined) {
    if (!file || !list.data?.canEdit) return;
    setImporting(true);
    try {
      const rows = parseFeeRows(await parseExcelFile(file));
      await save.mutateAsync({ rows }).catch(() => undefined);
    } catch (error) {
      toast({ title: "File non importato", description: (error as Error).message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  const items = list.data?.items ?? [];
  const canEdit = list.data?.canEdit;
  const busy = importing || save.isPending;

  return <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Banknote className="h-6 w-6 text-primary" />Listino quote</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tariffe di iscrizione, assicurazione e quota annuale per le schede giocatore di tutti i settori della società.</p>
      </div>
      {canEdit && <Button type="button" onClick={() => setDraft(emptyDraft)} disabled={busy}><Plus className="h-4 w-4" />Nuova quota</Button>}
    </div>

    {list.isPending ? <p role="status">Caricamento listino…</p> : list.isError ? (
      <div role="alert" className="flex flex-wrap items-center gap-2">Impossibile caricare il listino.
        <Button type="button" variant="outline" size="sm" onClick={() => void list.refetch()}>Riprova</Button>
      </div>
    ) : <>
      <div className="flex flex-wrap gap-2">
        {canEdit && <>
          <input ref={importInput} type="file" accept=".xlsx,.xls" className="hidden" onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            void handleImport(file);
          }} />
          <Button type="button" variant="outline" disabled={busy} onClick={() => importInput.current?.click()}>
            <Upload className="h-4 w-4" />{importing ? "Importazione…" : "Importa Excel"}
          </Button>
          <Button type="button" variant="outline" onClick={() => exportToExcel(template, "modello_listino_quote.xlsx", "Quote")}>
            <FileSpreadsheet className="h-4 w-4" />Scarica modello Excel
          </Button>
        </>}
        <Button type="button" variant="outline" disabled={!items.length} onClick={() => exportToExcel(items.map(item => ({
          Tipo: feeLabels[item.itemType], Codice: item.code, "Nome quota": item.name, "Importo (€)": item.price ?? "",
          Attivo: item.isActive ? "Sì" : "No",
        })), "listino_quote.xlsx", "Quote")}>
          <Download className="h-4 w-4" />Esporta listino
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {canEdit ? "L’importazione aggiorna le voci dello stesso tipo e codice. Se il codice manca, cerca per nome. Le quote già registrate nelle schede giocatore conservano il loro importo." : "Listino in sola consultazione. La Segreteria gestisce importazione e modifiche."}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {(Object.keys(feeLabels) as FeeType[]).map(type => {
          const group = items.filter(item => item.itemType === type);
          return <section key={type} className="min-w-0 rounded-xl border bg-card">
            <h2 className="border-b px-4 py-3 text-sm font-medium">{feeLabels[type]}</h2>
            {group.length ? <ul className="divide-y">{group.map(item => <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <div className="min-w-32 flex-1 break-words">
                <p className="text-sm font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.code}</p>
              </div>
              <span className="text-sm tabular-nums">{item.price == null ? "Senza importo" : formatEuro.format(item.price)}</span>
              {(!item.isActive || item.price == null) && <Badge variant="outline">{item.isActive ? "Da completare" : "Inattiva"}</Badge>}
              {canEdit && <Button type="button" size="icon" variant="ghost" aria-label={"Modifica " + item.name} disabled={busy} onClick={() => setDraft({
                id: item.id, itemType: item.itemType, name: item.name, code: item.code,
                price: item.price == null ? "" : String(item.price), isActive: item.isActive !== 0,
              })}><Pencil className="h-4 w-4" /></Button>}
            </li>)}</ul> : <p className="px-4 py-5 text-sm text-muted-foreground">Nessuna tariffa inserita.</p>}
          </section>;
        })}
      </div>
    </>}

    <Dialog open={draft !== null} onOpenChange={open => { if (!open && !busy) setDraft(null); }}>
      {draft && <DialogContent>
        <DialogHeader><DialogTitle>{draft.id ? "Modifica quota" : "Nuova quota"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-3">
          <label className="block space-y-1 text-sm">Tipo
            <ScrollableSelect aria-label="Tipo" className="w-full" value={draft.itemType} onValueChange={value => setDraft({ ...draft, itemType: value as FeeType })}>
              {(Object.keys(feeLabels) as FeeType[]).map(type => <option key={type} value={type}>{feeLabels[type]}</option>)}
            </ScrollableSelect>
          </label>
          <label className="block space-y-1 text-sm">Nome quota
            <Input value={draft.name} maxLength={150} required onChange={event => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label className="block space-y-1 text-sm">Codice (facoltativo)
            <Input value={draft.code} maxLength={80} onChange={event => setDraft({ ...draft, code: event.target.value })} />
          </label>
          <label className="block space-y-1 text-sm">Importo (€)
            <Input value={draft.price} inputMode="decimal" required onChange={event => setDraft({ ...draft, price: event.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={draft.isActive} onCheckedChange={checked => setDraft({ ...draft, isActive: checked === true })} />Visibile nella scheda giocatore
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setDraft(null)}>Annulla</Button>
            <Button type="submit" disabled={busy}>Salva quota</Button>
          </DialogFooter>
        </form>
      </DialogContent>}
    </Dialog>
  </div>;
}
