import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Layers, Trash2, Star, Download, Archive, ArchiveRestore,
  CalendarDays, ChevronDown, ChevronRight, Loader2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { withApi } from "@/lib/api-base";

interface Season {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isArchived: boolean;
}

async function apiFetch(url: string, options?: RequestInit) {
  const fullUrl = url.startsWith("/api/") ? withApi(url) : url;
  const res = await fetch(fullUrl, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

function formatDate(d: string) {
  try { return format(parseISO(d), "d MMMM yyyy", { locale: it }); }
  catch { return d; }
}

function SeasonCard({
  season, onSetActive, onArchive, onDelete, onDownload, isDownloading,
}: {
  season: Season;
  onSetActive: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onDownload: () => void;
  isDownloading: boolean;
}) {
  return (
    <Card className={`transition-all ${season.isActive ? "border-primary/60 shadow-md bg-primary/[0.02]" : season.isArchived ? "opacity-80 bg-muted/20" : ""}`}>
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {season.isActive && <Star className="w-4 h-4 text-amber-500 fill-amber-500 flex-shrink-0" />}
            <CardTitle className="text-lg">{season.name}</CardTitle>
            {season.isActive && (
              <Badge className="bg-green-100 text-green-700 border border-green-200 text-xs font-medium">
                Attiva
              </Badge>
            )}
            {season.isArchived && (
              <Badge variant="secondary" className="text-xs font-medium gap-1">
                <Archive className="w-3 h-3" /> Archiviata
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {!season.isActive && !season.isArchived && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onSetActive}>
                Imposta attiva
              </Button>
            )}
            <Button
              size="icon" variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-primary"
              onClick={onDownload}
              title="Scarica archivio stagione"
              disabled={isDownloading}
            >
              {isDownloading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Download className="w-3.5 h-3.5" />
              }
            </Button>
            <Button
              size="icon" variant="ghost"
              className={`h-7 w-7 ${season.isArchived ? "text-amber-600 hover:text-amber-700" : "text-muted-foreground hover:text-amber-600"}`}
              onClick={onArchive}
              title={season.isArchived ? "Ripristina da archivio" : "Archivia stagione"}
            >
              {season.isArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
            </Button>
            {!season.isActive && (
              <Button
                size="icon" variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
                title="Elimina stagione"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="w-3.5 h-3.5" />
          <span>{formatDate(season.startDate)}</span>
          <span className="text-muted-foreground/40">→</span>
          <span>{formatDate(season.endDate)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SeasonsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const { data: seasons = [], isLoading } = useQuery<Season[]>({
    queryKey: ["/api/seasons"],
    queryFn: () => apiFetch("/api/seasons"),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => apiFetch("/api/seasons", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/seasons"] });
      setOpen(false);
      resetForm();
      toast({ title: "Stagione creata" });
    },
    onError: () => toast({ title: "Errore", variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      apiFetch(`/api/seasons/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/seasons"] });
      toast({ title: "Stagione aggiornata" });
    },
    onError: () => toast({ title: "Errore", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/seasons/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/seasons"] });
      toast({ title: "Stagione eliminata" });
    },
    onError: () => toast({ title: "Errore", variant: "destructive" }),
  });

  async function handleDownload(season: Season) {
    setDownloadingId(season.id);
    try {
      const res = await fetch(withApi(`/api/seasons/${season.id}/export`), { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = season.name.replace(/[^a-zA-Z0-9]/g, "-");
      a.href = url;
      a.download = `stagione-${safeName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Archivio scaricato", description: `stagione-${safeName}.json` });
    } catch {
      toast({ title: "Errore download", variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  }

  function resetForm() { setName(""); setStartDate(""); setEndDate(""); setIsActive(false); }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !startDate || !endDate) return;
    createMutation.mutate({ name, startDate, endDate, isActive });
  }

  const active = seasons.filter(s => !s.isArchived);
  const archived = seasons.filter(s => s.isArchived);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" />
            Archivio Stagioni
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestisci le stagioni sportive del club — scarica e archivia i dati stagionali
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nuova stagione
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-12 text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Caricamento...
        </div>
      )}

      {/* Empty state */}
      {!isLoading && seasons.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Layers className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">Nessuna stagione ancora.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Aggiungi la prima stagione
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Active / current seasons */}
      {active.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Stagioni ({active.length})
          </h2>
          {active.map(s => (
            <SeasonCard
              key={s.id}
              season={s}
              onSetActive={() => patchMutation.mutate({ id: s.id, data: { isActive: true } })}
              onArchive={() => patchMutation.mutate({ id: s.id, data: { isArchived: !s.isArchived, isActive: false } })}
              onDelete={() => {
                if (confirm(`Eliminare la stagione "${s.name}"? L'operazione è irreversibile.`))
                  deleteMutation.mutate(s.id);
              }}
              onDownload={() => handleDownload(s)}
              isDownloading={downloadingId === s.id}
            />
          ))}
        </div>
      )}

      {/* Archived seasons */}
      {archived.length > 0 && (
        <div className="space-y-3">
          <button
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowArchived(v => !v)}
          >
            {showArchived ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Archive className="w-3.5 h-3.5" />
            Archivio ({archived.length})
          </button>

          {showArchived && (
            <div className="space-y-3">
              {archived.map(s => (
                <SeasonCard
                  key={s.id}
                  season={s}
                  onSetActive={() => patchMutation.mutate({ id: s.id, data: { isActive: true, isArchived: false } })}
                  onArchive={() => patchMutation.mutate({ id: s.id, data: { isArchived: false } })}
                  onDelete={() => {
                    if (confirm(`Eliminare definitivamente la stagione "${s.name}"?`))
                      deleteMutation.mutate(s.id);
                  }}
                  onDownload={() => handleDownload(s)}
                  isDownloading={downloadingId === s.id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Download info */}
      {seasons.length > 0 && (
        <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-4 py-3 flex items-start gap-2">
          <Download className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Il download produce un file <strong>.json</strong> con tutti i dati della stagione: squadre, giocatori, partite,
            presenze, stati di transizione e giocatori in osservazione. Archivia le stagioni concluse per mantenerle visibili
            ma separate da quelle correnti.
          </span>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Crea nuova stagione</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Nome stagione</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Es. 2026/2027"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data inizio</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Data fine</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={isActive} onCheckedChange={setIsActive} id="is-active" />
              <Label htmlFor="is-active">Imposta come stagione attiva</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => { setOpen(false); resetForm(); }}>
                Annulla
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Crea
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
