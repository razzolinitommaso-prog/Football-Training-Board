import { useState, useEffect, useRef } from "react";
import { FileText, Upload, Check, AlertTriangle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ParentDocuments() {
  const [data, setData] = useState<{ clubDocs: any[]; uploads: any[] }>({ clubDocs: [], uploads: [] });
  const [children, setChildren] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedChild, setSelectedChild] = useState("");
  const [notes, setNotes] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([apiFetch("/parent/documents"), apiFetch("/parent/children")])
      .then(([d, c]) => { setData(d); setChildren(c); if (c.length === 1) setSelectedChild(String(c[0].id)); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !selectedChild) { toast({ title: "Errore", description: "Seleziona un figlio e un file.", variant: "destructive" }); return; }
    if (file.size > 5 * 1024 * 1024) { toast({ title: "File troppo grande", description: "Max 5MB.", variant: "destructive" }); return; }

    setUploading(true);
    try {
      const fileData = await fileToBase64(file);
      const doc = await apiFetch("/parent/documents", {
        method: "POST",
        body: JSON.stringify({
          playerId: Number(selectedChild),
          fileName: file.name,
          fileType: file.type,
          fileData,
          notes: notes || undefined,
        }),
      });
      setData(prev => ({ ...prev, uploads: [{ ...doc, playerName: children.find(c => c.id === Number(selectedChild)) ? `${children.find(c => c.id === Number(selectedChild)).firstName} ${children.find(c => c.id === Number(selectedChild)).lastName}` : "" }, ...prev.uploads] }));
      setNotes(""); if (fileRef.current) fileRef.current.value = "";
      toast({ title: "Documento caricato!", description: file.name });
    } catch {
      toast({ title: "Errore upload", description: "Non è stato possibile caricare il file.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  const statusColor: Record<string, string> = { valid: "default", expired: "destructive", expiring_soon: "secondary" };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Documenti</h1>
        <p className="text-muted-foreground text-sm mt-1">Documenti e certificati dei tuoi figli</p>
      </div>

      <div className="bg-card border rounded-2xl p-5">
        <h2 className="font-semibold mb-4">Carica Documento</h2>
        <form onSubmit={handleUpload} className="space-y-3">
          {children.length > 1 && (
            <div>
              <Label className="text-sm">Figlio</Label>
              <select value={selectedChild} onChange={e => setSelectedChild(e.target.value)} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm">
                <option value="">Seleziona...</option>
                {children.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
              </select>
            </div>
          )}
          <div>
            <Label className="text-sm">File (PDF, immagine, max 5MB)</Label>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" capture="environment" className="mt-1 w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer" />
          </div>
          <div>
            <Label className="text-sm">Note (opzionale)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Es. Certificato medico 2025-2026" className="mt-1" />
          </div>
          <Button type="submit" disabled={uploading} className="w-full gap-2">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Caricamento..." : "Carica Documento"}
          </Button>
        </form>
      </div>

      {data.clubDocs.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Documenti Club</h2>
          {data.clubDocs.map(doc => {
            const expiry = doc.expiryDate ? new Date(doc.expiryDate) : null;
            const isExpired = expiry && expiry < new Date();
            const isExpiringSoon = expiry && !isExpired && expiry < new Date(Date.now() + 30 * 86400000);
            return (
              <div key={doc.id} className="bg-card border rounded-xl p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isExpired ? "bg-red-500/10" : isExpiringSoon ? "bg-amber-500/10" : "bg-green-500/10"}`}>
                  <FileText className={`w-5 h-5 ${isExpired ? "text-red-400" : isExpiringSoon ? "text-amber-400" : "text-green-400"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{doc.type}</p>
                  <p className="text-xs text-muted-foreground">{doc.playerName}</p>
                  {expiry && <p className={`text-xs mt-0.5 ${isExpired ? "text-red-400" : isExpiringSoon ? "text-amber-400" : "text-muted-foreground"}`}>Scade: {expiry.toLocaleDateString("it-IT")}</p>}
                </div>
                {isExpired && <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />}
                {isExpiringSoon && !isExpired && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
                {!isExpired && !isExpiringSoon && <Check className="w-4 h-4 text-green-400 shrink-0" />}
              </div>
            );
          })}
        </div>
      )}

      {data.uploads.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Documenti Caricati da Te</h2>
          {data.uploads.map(doc => (
            <div key={doc.id} className="bg-card border rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{doc.fileName}</p>
                <p className="text-xs text-muted-foreground">{doc.playerName}</p>
                {doc.notes && <p className="text-xs text-muted-foreground truncate">{doc.notes}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">{new Date(doc.createdAt).toLocaleDateString("it-IT")}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {data.clubDocs.length === 0 && data.uploads.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-25" />
          <p className="font-semibold">Nessun documento</p>
        </div>
      )}
    </div>
  );
}
