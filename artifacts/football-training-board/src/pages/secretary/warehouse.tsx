import { Link } from "wouter";
import { KIT_REQUEST_STATUS, PLAYER_KIT_ROWS, PLAYER_KIT_SLOTS, kitRowNeedsLink, savedKitSelections, suggestKitSlots, type KitRequestLine } from "@/lib/player-kit-catalog";
import { useAuth } from "@/hooks/use-auth";
import { normalizeSessionRole } from "@/lib/session-role";
import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Download, FileSpreadsheet, Package, Plus, Shirt, Goal, AlertTriangle, Pencil, Trash2, Upload } from "lucide-react";
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
import { cn } from "@/lib/utils";

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
  kitSlots?: string[] | null;
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
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Operazione di magazzino non riuscita");
  if (res.status === 204) return null;
  return res.json();
}

function sectionLabel(section: WarehouseSection) {
  return section === "apparel" ? "Abbigliamento" : "Materiale da campo";
}

function itemTypeLabel(type: string) {
  if (type === "registration_fee") return "Iscrizione";
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
  const label = value.toLowerCase();
  if (label.includes("assicur")) return "insurance_fee";
  if (label.includes("pulmino")) return "shuttle_fee";
  if (label.includes("quota") || label.includes("annuale") || label.includes("iscrizione")) return "annual_fee";
  return section === "apparel" && label.includes("kit") ? "kit" : "inventory";
}

function normalizeItemType(value: string, section: WarehouseSection, fallback: string) {
  const label = value.trim().toLowerCase();
  if (["registration_fee", "iscrizione"].includes(label)) return "registration_fee";
  if (["annual_fee", "quota annuale", "quota iscrizione", "quota"].includes(label)) return "annual_fee";
  if (["insurance_fee", "assicurazione", "quota assicurazione"].includes(label)) return "insurance_fee";
  if (["shuttle_fee", "pulmino", "quota pulmino"].includes(label)) return "shuttle_fee";
  if (["kit", "abbigliamento kit"].includes(label)) return "kit";
  if (["inventory", "solo magazzino", "magazzino"].includes(label)) return "inventory";
  return automaticItemType(section, fallback);
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
    "Tipo voce": itemTypeLabel(item.itemType),
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
    "Tipo voce": "Kit",
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
    "Tipo voce": "Kit",
    "Categoria": "Guanti portiere",
    "Taglia / formato": "8-9 anni",
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
    "Nome articolo": "Quota annuale Pulcini",
    "Tipo voce": "Quota annuale",
    "Categoria": "Quota annuale",
    "Taglia / formato": "",
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
    "Nome articolo": "Quota assicurazione",
    "Tipo voce": "Assicurazione",
    "Categoria": "Assicurazione",
    "Taglia / formato": "",
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
    "Nome articolo": "Quota pulmino mensile",
    "Tipo voce": "Pulmino",
    "Categoria": "Pulmino",
    "Taglia / formato": "",
    "Prezzo listino": "",
    "Quantita disponibile": "",
    "Soglia minima": "",
    "Fornitore": "",
    "Attivo": "Si",
    "Note": "",
  },
];

export default function WarehousePage() {
  const { user, club, role } = useAuth();
  const canManageKit = normalizeSessionRole(role) === "secretary";
  const [kitMapping, setKitMapping] = useState<{ title: string; ids: number[]; slots: string[] } | null>(null);
  const [kitRequestView, setKitRequestView] = useState<"open" | "delivered" | "unlinked">("open");
  const [section, setSection] = useState<WarehouseSection>("apparel");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const { toast } = useToast();
  const qc = useQueryClient();
  const categoryOptions = section === "apparel" ? APPAREL_CATEGORY_OPTIONS : FIELD_CATEGORY_OPTIONS;
  const sizeOptions = section === "apparel" ? APPAREL_SIZE_OPTIONS : FIELD_SIZE_OPTIONS;

  const { data: items = [], isLoading } = useQuery<WarehouseItem[]>({
    queryKey: ["/api/warehouse-items", club?.id, user?.id, section],
    queryFn: () => apiFetch(`/api/warehouse-items?section=${section}`),
  });

  const kitRequests = useQuery<KitRequestLine[]>({
    queryKey: ["/api/warehouse-kit-requests", club?.id, user?.id],
    enabled: section === "apparel",
    queryFn: () => apiFetch("/api/warehouse-kit-requests"),
  });
  const openKitRequests = (kitRequests.data ?? []).filter((line) => line.status !== "delivered");
  const unlinkedKits = useQuery<{ playerId: number; playerName?: string; trainingKit?: string }[]>({
    queryKey: ["/api/equipment", club?.id, user?.id, "warehouse-review"],
    enabled: section === "apparel" && canManageKit && kitRequestView === "unlinked",
    queryFn: () => apiFetch("/api/equipment"),
  });
  const activeKitItemIds = new Set(items.filter((item) => item.isActive !== 0 && item.price != null).map((item) => String(item.id)));
  const unlinkedPlayers = (unlinkedKits.data ?? []).flatMap((record) => {
    const labels = savedKitSelections(record.trainingKit).flatMap((row) => {
      return kitRowNeedsLink(row, activeKitItemIds)
        ? [PLAYER_KIT_ROWS.find((slot) => slot.key === row.key)?.label ?? row.label] : [];
    });
    return labels.length ? [{ ...record, labels }] : [];
  });
  const visibleKitRequests = kitRequestView === "delivered"
    ? (kitRequests.data ?? []).filter((line) => line.status === "delivered")
    : openKitRequests;
  const changeKitRequest = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiFetch(`/api/warehouse-kit-requests/${id}`, {
      method: "PATCH", body: JSON.stringify({ status }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/warehouse-kit-requests"] });
      qc.invalidateQueries({ queryKey: ["/api/warehouse-items"] });
      toast({ title: "Richiesta kit aggiornata" });
    },
    onError: (error) => toast({ title: "Richiesta non aggiornata", description: error.message, variant: "destructive" }),
  });
  const saveKitMapping = useMutation({
    mutationFn: (mapping: NonNullable<typeof kitMapping>) => apiFetch("/api/warehouse-kit-catalog", {
      method: "PATCH", body: JSON.stringify({ ids: mapping.ids, kitSlots: mapping.slots }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/warehouse-items"] });
      setKitMapping(null);
      toast({ title: "Collegamenti al kit salvati" });
    },
    onError: (error) => toast({ title: "Collegamenti non salvati", description: error.message, variant: "destructive" }),
  });

  function openKitMapping(title: string, variants: WarehouseItem[]) {
    const first = variants[0];
    const firstSlots = first.kitSlots ?? suggestKitSlots(first);
    const sharedSlots = firstSlots.filter((slot) => variants.every((item) =>
      (item.kitSlots ?? suggestKitSlots(item)).includes(slot)));
    setKitMapping({ title, ids: variants.map((item) => item.id), slots: sharedSlots });
  }

  const reorderItems = useMemo(() => items.filter(isUnderStockWarning), [items]);
  const availablePiecesCount = useMemo(() => items.reduce((sum, item) => sum + Math.max(0, netAvailable(item)), 0), [items]);
  const availableRowsCount = useMemo(() => items.filter((item) => netAvailable(item) > 0).length, [items]);
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
      itemType: form.itemType || automaticItemType(section, `${form.category} ${cleanName}`),
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
        const rawItemType = cellToTrimmedString(row["Tipo voce"]);
        return {
          section: rowSection,
          code: cellToTrimmedString(row["Codice articolo"]) || automaticCode(rowSection, category, size, name),
          name,
          itemType: normalizeItemType(rawItemType, rowSection, `${category} ${name}`),
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
          <Button type="button" variant="outline" className="gap-2" onClick={() => exportToExcel(WAREHOUSE_TEMPLATE_ROWS, "modello_listino_magazzino.xlsx", "Listino", { preferSavePicker: true })}>
            <FileSpreadsheet className="h-4 w-4" />
            Esporta modello listino
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
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pezzi disponibili</p>
            <p className="text-2xl font-bold">{availablePiecesCount}</p>
            <p className="text-xs text-muted-foreground">{availableRowsCount} taglie/formati disponibili</p>
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


      {section === "apparel" && (
        <details className="group rounded-lg border bg-card">
          <DisclosureSummary className="px-4 py-3">
            <span className="font-medium">Richieste kit giocatori · {openKitRequests.length} aperte</span>
          </DisclosureSummary>
          <div className="space-y-2 border-t px-4 pb-4 pt-3">
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={kitRequestView === "open" ? "secondary" : "ghost"}
                onClick={() => setKitRequestView("open")}>Aperte</Button>
              <Button type="button" size="sm" variant={kitRequestView === "delivered" ? "secondary" : "ghost"}
                onClick={() => setKitRequestView("delivered")}>Consegnate</Button>
              {canManageKit && <Button type="button" size="sm" variant={kitRequestView === "unlinked" ? "secondary" : "ghost"}
                onClick={() => setKitRequestView("unlinked")}>Da collegare</Button>}
            </div>
            {kitRequestView === "unlinked" ? (
              <div className="divide-y">
                {(unlinkedKits.isPending || isLoading) && <p className="text-sm text-muted-foreground">Caricamento kit…</p>}
                {unlinkedKits.isError && <p className="text-sm text-destructive">Impossibile caricare i kit.</p>}
                {unlinkedKits.isSuccess && !isLoading && unlinkedPlayers.length === 0 &&
                  <p className="text-sm text-muted-foreground">Nessun kit da collegare.</p>}
                {!isLoading && unlinkedPlayers.map((record) => (
                  <div key={record.playerId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <p>{record.playerName ?? "Giocatore"}</p>
                      <p className="text-xs text-muted-foreground">{record.labels.join(" · ")}</p>
                    </div>
                    <Button asChild type="button" size="sm" variant="outline">
                      <Link href={`/players?openPlayerId=${record.playerId}&focus=kit`}>Apri kit</Link>
                    </Button>
                  </div>
                ))}
              </div>
            ) : <>
            {kitRequests.isPending && <p className="text-sm text-muted-foreground">Caricamento richieste…</p>}
            {kitRequests.isError && <p className="text-sm text-destructive">Impossibile caricare le richieste del kit.</p>}
            {kitRequests.isSuccess && visibleKitRequests.length === 0 && <p className="text-sm text-muted-foreground">Nessuna richiesta in questa vista.</p>}
            <div className="divide-y">
              {visibleKitRequests.map((line) => {
                const next = line.status === "pending" ? "ordered" : line.status === "ordered" ? "arrived" : "delivered";
                const canCancel = line.status === "pending" || line.status === "reserved";
                return (
                  <div key={line.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <p>{line.playerName} · {line.itemName} · {line.quantity} pz</p>
                      <p className="text-xs text-muted-foreground">
                        {[PLAYER_KIT_ROWS.find((row) => row.key === line.rowKey)?.label, line.size, line.variantNotes, line.code].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{KIT_REQUEST_STATUS[line.status]}</Badge>
                      {canManageKit && line.status !== "delivered" && (
                        <Button type="button" size="sm" variant="outline" disabled={changeKitRequest.isPending}
                          onClick={() => changeKitRequest.mutate({ id: line.id, status: next })}>Segna {KIT_REQUEST_STATUS[next].toLowerCase()}</Button>
                      )}
                      {canManageKit && canCancel && (
                        <Button type="button" size="sm" variant="ghost" disabled={changeKitRequest.isPending}
                          onClick={() => {
                            if (window.confirm("Annullare questa richiesta e liberare gli eventuali pezzi riservati?")) {
                              changeKitRequest.mutate({ id: line.id, status: "canceled" });
                            }
                          }}>Annulla richiesta</Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            </>}
          </div>
        </details>
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
            <details key={group.key} className={cn("group rounded-lg border bg-card shadow-sm", group.hasWarning && "border-amber-300")}>
              <DisclosureSummary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3" indicator={false}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{group.name}</p>
                  <p className="text-xs text-muted-foreground">{group.category} - {group.items.length} taglie/formati</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">Netto {group.totalNet}</Badge>
                  {group.hasWarning && <Badge className="bg-amber-500 text-white">Da riordinare</Badge>}
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </div>
              </DisclosureSummary>
              <div className="space-y-3 border-t px-4 pb-4 pt-3 text-sm">
                {section === "apparel" && canManageKit && (
                  <Button type="button" size="sm" variant="outline"
                    onClick={() => openKitMapping(group.name, group.items)}>Collega tutte le varianti al kit</Button>
                )}
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
                          {section === "apparel" && canManageKit && (
                            <Button type="button" size="sm" variant="ghost" onClick={() => openKitMapping(item.name, [item])}>Kit</Button>
                          )}
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
              </div>
            </details>
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

      <Dialog open={Boolean(kitMapping)} onOpenChange={(open) => { if (!open) setKitMapping(null); }}>
        <DialogContent className="flex max-h-[85dvh] max-w-md flex-col">
          <DialogHeader><DialogTitle>Collega al kit · {kitMapping?.title}</DialogTitle></DialogHeader>
          {kitMapping && (
            <>
              <p className="text-sm text-muted-foreground">{kitMapping.ids.length} varianti. Seleziona le voci che devono proporle nel kit giocatore.</p>
              <div className="min-h-0 space-y-2 overflow-y-auto py-1">
                {PLAYER_KIT_SLOTS.map((slot) => (
                  <label key={slot.key} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={kitMapping.slots.includes(slot.key)} onCheckedChange={(checked) =>
                      setKitMapping((current) => current ? { ...current, slots: checked === true
                        ? [...current.slots, slot.key] : current.slots.filter((key) => key !== slot.key) } : null)} />
                    {slot.label}
                  </label>
                ))}
              </div>
              <Button type="button" disabled={saveKitMapping.isPending} onClick={() => saveKitMapping.mutate(kitMapping)}>Salva collegamenti</Button>
            </>
          )}
        </DialogContent>
      </Dialog>

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
                <Label>Tipo voce</Label>
                <Select value={form.itemType || "inventory"} onValueChange={(value) => setForm((prev) => ({ ...prev, itemType: value }))}>
                  <SelectTrigger><SelectValue placeholder="Seleziona tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inventory">Solo magazzino</SelectItem>
                    <SelectItem value="registration_fee">Iscrizione</SelectItem>
                    <SelectItem value="annual_fee">Quota annuale</SelectItem>
                    <SelectItem value="insurance_fee">Assicurazione</SelectItem>
                    <SelectItem value="shuttle_fee">Pulmino</SelectItem>
                    <SelectItem value="kit">Kit</SelectItem>
                  </SelectContent>
                </Select>
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
