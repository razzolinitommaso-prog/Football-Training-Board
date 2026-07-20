import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Package, Plus, Shirt, Goal, AlertTriangle, Pencil, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { withApi } from "@/lib/api-base";
import { exportToExcel } from "@/lib/excel-export";
import { cellToTrimmedString, parseExcelFile } from "@/lib/excel-import";

type WarehouseSection = "apparel" | "field";

type WarehouseItem = {
  id: number;
  section: WarehouseSection;
  code: string;
  name: string;
  itemType: string;
  price?: number | null;
  isActive: number;
  category?: string | null;
  size?: string | null;
  quantityAvailable: number;
  quantityReserved: number;
  reorderThreshold: number;
  supplier?: string | null;
  notes?: string | null;
};

const LOW_STOCK_WARNING_THRESHOLD = 10;

const emptyForm = {
  code: "",
  name: "",
  itemType: "inventory",
  price: "",
  isActive: true,
  category: "",
  size: "",
  quantityAvailable: "0",
  quantityReserved: "0",
  reorderThreshold: "0",
  supplier: "",
  notes: "",
};

const APPAREL_CATEGORY_OPTIONS = [
  "Kit allenamento",
  "Kit gara",
  "Kit rappresentanza",
  "Kit portiere",
  "Calzettone allenamento",
  "Pantaloncino allenamento",
  "Maglietta allenamento",
  "K-Way",
  "Tuta invernale allenamento",
  "Pantalone invernale",
  "Pinocchietto invernale",
  "Felpa invernale allenamento",
  "Pantaloncino gara",
  "Calzettone gara",
  "Maglietta gara",
  "Tuta rappresentanza completa",
  "Pantalone rappresentanza",
  "Felpa rappresentanza",
  "Polo rappresentanza",
  "Giubbotto",
  "Borsa",
  "Zaino",
  "Guanti invernali",
  "Guanti portiere",
  "Maglia portiere",
  "Pantaloncino portiere",
  "Pantalone portiere",
  "Calzettone portiere",
  "Felpa portiere",
];

const FIELD_CATEGORY_OPTIONS = [
  "Pallone",
  "Cinesini",
  "Coni",
  "Paletti",
  "Casacche",
  "Porticine",
  "Rete porta",
  "Scala coordinativa",
  "Ostacoli",
  "Cerchi",
  "Elastici",
  "Pompa palloni",
  "Borracce",
  "Borsa medica",
  "Ghiaccio spray",
];

const APPAREL_SIZE_OPTIONS = [
  "Tutte le taglie",
  "3XS",
  "2XS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "5-6 anni",
  "6-7 anni",
  "7-8 anni",
  "8-9 anni",
  "9-10 anni",
  "10-11 anni",
  "11-12 anni",
  "12-13 anni",
  "13-14 anni",
  "116 cm",
  "128 cm",
  "140 cm",
  "152 cm",
  "164 cm",
];

const FIELD_SIZE_OPTIONS = [
  "Tutti i formati",
  "Unica",
  "Mini",
  "Junior",
  "Senior",
  "Pallone n.3",
  "Pallone n.4",
  "Pallone n.5",
  "Casacca bambino",
  "Casacca adulto",
  "30 cm",
  "40 cm",
  "50 cm",
  "60 cm",
  "Set 10 pezzi",
  "Set 20 pezzi",
];

function optionsForCurrent(value: string, options: string[]) {
  const clean = value.trim();
  if (!clean || options.some((option) => option.toLowerCase() === clean.toLowerCase())) return options;
  return [clean, ...options];
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(withApi(path), {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

function sectionLabel(section: WarehouseSection) {
  return section === "apparel" ? "Abbigliamento" : "Materiale da campo";
}

function itemTypeLabel(type: string) {
  if (type === "annual_fee") return "Quota annuale";
  if (type === "insurance_fee") return "Assicurazione";
  if (type === "shuttle_fee") return "Pulmino";
  if (type === "kit") return "Kit";
  return "Magazzino";
}

function slugPart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);
}

function automaticItemType(section: WarehouseSection, value: string) {
  return section === "apparel" && value.toLowerCase().includes("kit") ? "kit" : "inventory";
}

function automaticCode(section: WarehouseSection, category: string, size: string, name: string) {
  const prefix = section === "apparel" ? "ABB" : "CAMPO";
  const parts = [prefix, slugPart(category || name || sectionLabel(section)), slugPart(size)].filter(Boolean);
  return parts.join("-");
}

function formatEuro(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numberField(value: unknown) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function warehouseRowsForExcel(rows: WarehouseItem[]) {
  return rows.map((item) => ({
    "Sezione": item.section === "field" ? "Materiale da campo" : "Abbigliamento",
    "Codice articolo": item.code ?? "",
    "Nome articolo": item.name ?? "",
    "Categoria": item.category ?? "",
    "Taglia / formato": item.size ?? "",
    "Prezzo listino": item.price ?? "",
    "Quantita disponibile": item.quantityAvailable ?? 0,
    "Soglia minima": item.reorderThreshold ?? 0,
    "Fornitore": item.supplier ?? "",
    "Attivo": item.isActive === 0 ? "No" : "Si",
    "Note": item.notes ?? "",
  }));
}

function netAvailable(item: WarehouseItem) {
  return Number(item.quantityAvailable ?? 0) - Number(item.quantityReserved ?? 0);
}

function isUnderStockWarning(item: WarehouseItem) {
  const net = netAvailable(item);
  const threshold = Number(item.reorderThreshold ?? 0);
  return net < LOW_STOCK_WARNING_THRESHOLD || (threshold > 0 && net <= threshold);
}

const WAREHOUSE_TEMPLATE_ROWS = [
  {
    "Sezione": "Abbigliamento",
    "Codice articolo": "",
    "Nome articolo": "Maglietta allenamento",
    "Categoria": "Maglietta allenamento",
    "Taglia / formato": "XS",
    "Prezzo listino": "",
    "Quantita disponibile": "",
    "Soglia minima": "",
    "Fornitore": "",
    "Attivo": "Si",
    "Note": "",
  },
  {
    "Sezione": "Abbigliamento",
    "Codice articolo": "",
    "Nome articolo": "Guanti portiere",
    "Categoria": "Guanti portiere",
    "Taglia / formato": "8-9 anni",
    "Prezzo listino": "",
    "Quantita disponibile": "",
    "Soglia minima": "",
    "Fornitore": "",
    "Attivo": "Si",
    "Note": "",
  },
];

export default function WarehousePage() {
  const [section, setSection] = useState<WarehouseSection>("apparel");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const { toast } = useToast();
  const qc = useQueryClient();
  const categoryOptions = section === "apparel" ? APPAREL_CATEGORY_OPTIONS : FIELD_CATEGORY_OPTIONS;
  const sizeOptions = section === "apparel" ? APPAREL_SIZE_OPTIONS : FIELD_SIZE_OPTIONS;

  const { data: items = [], isLoading } = useQuery<WarehouseItem[]>({
    queryKey: ["/api/warehouse-items", section],
    queryFn: () => apiFetch(`/api/warehouse-items?section=${section}`),
  });

  const reorderItems = useMemo(() => items.filter(isUnderStockWarning), [items]);
  const availableItems = useMemo(() => items.filter((item) => netAvailable(item) > 0), [items]);
  const reservedCount = useMemo(() => items.reduce((sum, item) => sum + Number(item.quantityReserved ?? 0), 0), [items]);
  const groupedItems = useMemo(() => {
    const byModel = new Map<string, WarehouseItem[]>();
    for (const item of items) {
      const groupName = item.name || item.category || "Articolo";
      const groupCategory = item.category || groupName;
      const key = `${groupCategory}|${groupName}`;
      byModel.set(key, [...(byModel.get(key) ?? []), item]);
    }
    return Array.from(byModel.entries()).map(([key, group]) => {
      const [category, name] = key.split("|");
      const sorted = [...group].sort((a, b) => String(a.size ?? "").localeCompare(String(b.size ?? ""), "it"));
      return {
        key,
        category,
        name,
        items: sorted,
        totalAvailable: sorted.reduce((sum, item) => sum + Number(item.quantityAvailable ?? 0), 0),
        totalReserved: sorted.reduce((sum, item) => sum + Number(item.quantityReserved ?? 0), 0),
        totalNet: sorted.reduce((sum, item) => sum + netAvailable(item), 0),
        hasWarning: sorted.some(isUnderStockWarning),
      };
    }).sort((a, b) => a.name.localeCompare(b.name, "it"));
  }, [items]);

  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown> | Record<string, unknown>[]) => {
      if (Array.isArray(payload)) {
        return Promise.all(payload.map((entry) => apiFetch("/api/warehouse-items", {
          method: "POST",
          body: JSON.stringify(entry),
        })));
      }
      return apiFetch(editing ? `/api/warehouse-items/${editing.id}` : "/api/warehouse-items", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/warehouse-items"] });
      setEditing(null);
      setForm(emptyForm);
      setIsDialogOpen(false);
      toast({ title: "Articolo magazzino salvato" });
    },
    onError: (error) => toast({
      title: "Errore salvataggio magazzino",
      description: error instanceof Error ? error.message : "Controlla i dati inseriti.",
      variant: "destructive",
    }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/warehouse-items/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/warehouse-items"] });
      toast({ title: "Articolo eliminato" });
    },
    onError: () => toast({ title: "Errore eliminazione articolo", variant: "destructive" }),
  });

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setIsDialogOpen(true);
  }

  function openEdit(item: WarehouseItem) {
    setEditing(item);
    setIsDialogOpen(true);
    setForm({
      code: item.code ?? "",
      name: item.name ?? "",
      itemType: item.itemType ?? "inventory",
      price: item.price != null ? String(item.price) : "",
      isActive: item.isActive !== 0,
      category: item.category ?? "",
      size: item.size ?? "",
      quantityAvailable: String(item.quantityAvailable ?? 0),
      quantityReserved: String(item.quantityReserved ?? 0),
      reorderThreshold: String(item.reorderThreshold ?? 0),
      supplier: item.supplier ?? "",
      notes: item.notes ?? "",
    });
  }

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const cleanName = form.name.trim() || form.category.trim();
    const cleanCode = form.code.trim() || automaticCode(section, form.category, form.size, cleanName);
    if (!cleanName) {
      toast({
        title: "Nome articolo richiesto",
        description: "Seleziona una categoria oppure scrivi il nome articolo.",
        variant: "destructive",
      });
      return;
    }
    const selectedSizes = !editing && (form.size === "Tutte le taglie" || form.size === "Tutti i formati")
      ? sizeOptions.filter((size) => size !== "Tutte le taglie" && size !== "Tutti i formati")
      : [form.size];
    const payloads = selectedSizes.map((size) => ({
      section,
      code: selectedSizes.length > 1 ? automaticCode(section, form.category, size, cleanName) : cleanCode,
      name: cleanName,
      itemType: automaticItemType(section, `${form.category} ${cleanName}`),
      price: form.price || null,
      isActive: form.isActive,
      category: form.category || null,
      size: size || null,
      quantityAvailable: Number(form.quantityAvailable || 0),
      reorderThreshold: Number(form.reorderThreshold || 0),
      supplier: form.supplier || null,
      notes: form.notes || null,
    }));
    save.mutate(payloads.length === 1 ? payloads[0] : payloads);
  }

  async function handleImport(file: File | null) {
    if (!file) return;
    try {
      const rows = await parseExcelFile(file);
      const payloads = rows.map((row) => {
        const rawSection = cellToTrimmedString(row["Sezione"]).toLowerCase();
        const rowSection: WarehouseSection = rawSection.includes("campo") ? "field" : "apparel";
        const category = cellToTrimmedString(row["Categoria"]);
        const name = cellToTrimmedString(row["Nome articolo"]) || category;
        const size = cellToTrimmedString(row["Taglia / formato"]);
        return {
          section: rowSection,
          code: cellToTrimmedString(row["Codice articolo"]) || automaticCode(rowSection, category, size, name),
          name,
          itemType: automaticItemType(rowSection, `${category} ${name}`),
          price: cellToTrimmedString(row["Prezzo listino"]) || null,
          isActive: cellToTrimmedString(row["Attivo"]).toLowerCase() !== "no",
          category: category || null,
          size: size || null,
          quantityAvailable: numberField(row["Quantita disponibile"]),
          reorderThreshold: numberField(row["Soglia minima"]),
          supplier: cellToTrimmedString(row["Fornitore"]) || null,
          notes: cellToTrimmedString(row["Note"]) || null,
        };
      }).filter((row) => row.name);
      if (payloads.length === 0) {
        toast({ title: "Nessun articolo valido trovato", variant: "destructive" });
        return;
      }
      save.mutate(payloads);
    } catch (error) {
      toast({
        title: "Errore import magazzino",
        description: error instanceof Error ? error.message : "File non valido.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Package className="h-6 w-6 text-primary" />
            Magazzino
          </h1>
          <p className="text-sm text-muted-foreground">Gestisci arrivi, disponibilita, taglie e riassortimenti.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="warehouse-import"
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(event) => {
              void handleImport(event.target.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
          <Button type="button" variant="outline" className="gap-2" onClick={() => document.getElementById("warehouse-import")?.click()}>
            <Upload className="h-4 w-4" />
            Importa Excel
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={() => exportToExcel(WAREHOUSE_TEMPLATE_ROWS, "modello_magazzino.xlsx", "Magazzino", { preferSavePicker: true })}>
            <FileSpreadsheet className="h-4 w-4" />
            Esporta modello
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={() => exportToExcel(warehouseRowsForExcel(items), `magazzino_${section}.xlsx`, "Magazzino", { preferSavePicker: true })}>
            <Download className="h-4 w-4" />
            Esporta Excel
          </Button>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" />
            Nuovo articolo
          </Button>
        </div>
      </div>

      <Tabs value={section} onValueChange={(value) => setSection(value as WarehouseSection)}>
        <TabsList className="grid w-full grid-cols-2 sm:w-[420px]">
          <TabsTrigger value="apparel" className="gap-2"><Shirt className="h-4 w-4" />Abbigliamento</TabsTrigger>
          <TabsTrigger value="field" className="gap-2"><Goal className="h-4 w-4" />Materiale da campo</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Articoli disponibili</p>
            <p className="text-2xl font-bold">{availableItems.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pezzi riservati</p>
            <p className="text-2xl font-bold">{reservedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Da riordinare</p>
            <p className="text-2xl font-bold">{reorderItems.length}</p>
          </CardContent>
        </Card>
      </div>

      {reorderItems.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/70">
          <CardContent className="flex flex-col gap-2 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {reorderItems.length} taglie/formati sotto soglia o sotto {LOW_STOCK_WARNING_THRESHOLD} disponibili.
            </div>
            <Badge variant="outline" className="w-fit border-amber-300 text-amber-900">Export fornitore nel punto 5</Badge>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">Caricamento magazzino...</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Nessun articolo in {sectionLabel(section).toLowerCase()}.
          </CardContent>
        </Card>
      ) : (
        <>
        <div className="grid gap-3 lg:grid-cols-2">
          {groupedItems.map((group) => (
            <Card key={group.key} className={group.hasWarning ? "border-amber-300" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{group.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{group.category} - {group.items.length} taglie/formati</p>
                  </div>
                  {group.hasWarning && <Badge className="bg-amber-500 text-white">Da riordinare</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">Disponibili</p>
                    <p className="text-lg font-bold">{group.totalAvailable}</p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">Riservati</p>
                    <p className="text-lg font-bold">{group.totalReserved}</p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">Netto</p>
                    <p className={`text-lg font-bold ${group.hasWarning ? "text-amber-700" : ""}`}>{group.totalNet}</p>
                  </div>
                </div>
                <div className="rounded-md border">
                  {group.items.map((item) => {
                    const net = netAvailable(item);
                    const underThreshold = isUnderStockWarning(item);
                    return (
                      <div key={item.id} className="grid grid-cols-[1fr_auto] gap-2 border-b px-3 py-2 last:border-b-0 sm:grid-cols-[1.2fr_0.8fr_0.8fr_auto] sm:items-center">
                        <div>
                          <p className="font-medium">{item.size || "Senza taglia"}</p>
                          <p className="text-xs text-muted-foreground">{item.code}</p>
                        </div>
                        <div className="text-xs sm:text-sm"><span className="text-muted-foreground">Disp.</span> {item.quantityAvailable}</div>
                        <div className={`text-xs sm:text-sm ${underThreshold ? "font-semibold text-amber-700" : ""}`}><span className="text-muted-foreground">Netto</span> {net}</div>
                        <div className="flex justify-end gap-1">
                          {underThreshold && <Badge variant="outline" className="hidden border-amber-300 text-amber-700 sm:inline-flex">Sotto 10</Badge>}
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove.mutate(item.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="hidden">
          {items.map((item) => {
            const netAvailable = Number(item.quantityAvailable ?? 0) - Number(item.quantityReserved ?? 0);
            const underThreshold = netAvailable <= Number(item.reorderThreshold ?? 0);
            return (
              <Card key={item.id} className={underThreshold ? "border-amber-300" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{item.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{item.code}{item.size ? ` · Taglia ${item.size}` : ""}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(item)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove.mutate(item.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md border p-2">
                      <p className="text-xs text-muted-foreground">Disponibili</p>
                      <p className="text-lg font-bold">{item.quantityAvailable}</p>
                    </div>
                    <div className="rounded-md border p-2">
                      <p className="text-xs text-muted-foreground">Riservati</p>
                      <p className="text-lg font-bold">{item.quantityReserved}</p>
                    </div>
                    <div className="rounded-md border p-2">
                      <p className="text-xs text-muted-foreground">Netto</p>
                      <p className={`text-lg font-bold ${underThreshold ? "text-amber-700" : ""}`}>{netAvailable}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={item.itemType === "inventory" ? "secondary" : "outline"}>{itemTypeLabel(item.itemType)}</Badge>
                    {item.price != null && <Badge variant="outline">Euro {formatEuro(item.price)}</Badge>}
                    {item.isActive === 0 && <Badge variant="destructive">Non attivo</Badge>}
                    {item.category && <Badge variant="secondary">{item.category}</Badge>}
                    {item.supplier && <Badge variant="outline">{item.supplier}</Badge>}
                    {underThreshold && <Badge className="bg-amber-500 text-white">Da riordinare</Badge>}
                  </div>
                  {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
        </>
      )}

      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setEditing(null); setForm(emptyForm); } }}>
        <DialogContent className="sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica articolo" : "Nuovo articolo"} - {sectionLabel(section)}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Codice articolo</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                  placeholder="Automatico se vuoto"
                />
              </div>
              <div className="space-y-2">
                <Label>Nome articolo</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Automatico da categoria se vuoto"
                />
              </div>
              <div className="space-y-2">
                <Label>Prezzo listino</Label>
                <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={form.category || "_none"}
                  onValueChange={(value) => {
                    const next = value === "_none" ? "" : value;
                    setForm((prev) => ({
                      ...prev,
                      category: next,
                      name: prev.name || next,
                    }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder={section === "apparel" ? "Seleziona tipologia" : "Seleziona materiale"} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Nessuna categoria</SelectItem>
                    {optionsForCurrent(form.category, categoryOptions).map((option) => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Taglia / formato</Label>
                <Select
                  value={form.size || "_none"}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, size: value === "_none" ? "" : value }))}
                >
                  <SelectTrigger><SelectValue placeholder={section === "apparel" ? "Seleziona taglia" : "Seleziona formato"} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Nessuna taglia/formato</SelectItem>
                    {optionsForCurrent(form.size, sizeOptions).map((option) => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantita disponibile</Label>
                <Input type="number" value={form.quantityAvailable} onChange={(e) => setForm((prev) => ({ ...prev, quantityAvailable: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Quantita riservata</Label>
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {editing ? form.quantityReserved : "Automatica dalle richieste giocatore"}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Soglia minima</Label>
                <Input type="number" value={form.reorderThreshold} onChange={(e) => setForm((prev) => ({ ...prev, reorderThreshold: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Fornitore</Label>
                <Input value={form.supplier} onChange={(e) => setForm((prev) => ({ ...prev, supplier: e.target.value }))} />
              </div>
              <label className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                <Checkbox checked={form.isActive} onCheckedChange={(value) => setForm((prev) => ({ ...prev, isActive: value === true }))} />
                Voce attiva nel listino
              </label>
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); setEditing(null); setForm(emptyForm); }}>Annulla</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? "Salvataggio..." : "Salva articolo"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
