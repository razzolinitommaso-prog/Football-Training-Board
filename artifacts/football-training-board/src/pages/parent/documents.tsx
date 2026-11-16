import { DocumentFilePicker } from "@/components/document-file-picker";
import { downloadDocument, readDocumentFile } from "@/lib/document-files";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect, useRef } from "react";
import { FileText, Upload, Check, AlertTriangle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { withApi } from "@/lib/api-base";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(withApi(`/api${path}`), { credentials: "include", headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    throw new Error(error?.error ?? "Il server ha rifiutato la richiesta.");
  }
  return res.json();
}

export default function ParentDocuments() {
  const [data, setData] = useState<{ clubDocs: any[]; uploads: any[] }>({ clubDocs: [], uploads: [] });
  const [child, setChild] = useState<{ id: number; firstName: string; lastName: string } | null>(null);
  const { profileKey } = useAuth();
  const currentProfile = useRef(profileKey);
  currentProfile.current = profileKey;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError(false);
    setChild(null);
    setFile(null);
    setNotes("");
    apiFetch("/parent/documents?view=upload").then(d => {
      if (!current) return;
      setChild(d.child ?? null);
      setData(Array.isArray(d) ? { clubDocs: d, uploads: [] } : {
        clubDocs: d.clubDocs ?? [], uploads: d.uploads ?? [],
      });
    }).catch(() => { if (current) setLoadError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [profileKey]);

  async function handleUpload(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !child) return;
    setUploading(true);
    try {
      const attachment = await readDocumentFile(file, 5 * 1024 * 1024);
      const doc = await apiFetch("/parent/documents", { method: "POST",
        body: JSON.stringify({ playerId: child.id, ...attachment, notes: notes || undefined }) });
      if (!doc.id || doc.playerId !== child.id || !doc.fileData) throw new Error("Il server non ha confermato il salvataggio.");
      if (currentProfile.current !== profileKey) return;
      setData(prev => ({ ...prev, uploads: [{ ...doc, playerName: child.firstName + " " + child.lastName }, ...prev.uploads] }));
      setNotes("");
      setFile(null);
      toast({ title: "Documento inviato alla società", description: doc.fileName });
    } catch (error) {
      toast({ title: "Impossibile inviare il documento", description: (error as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  function fileDownload(doc: { fileData?: string; fileName?: string }) {
    if (!doc.fileData) return null;
    return <Button type="button" variant="outline" size="sm" onClick={() => {
      try { downloadDocument(doc.fileData!, doc.fileName ?? "documento"); }
      catch (error) { toast({ title: "Impossibile scaricare il documento", description: (error as Error).message, variant: "destructive" }); }
    }}>Scarica</Button>;
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  const statusColor: Record<string, string> = { valid: "default", expired: "destructive", expiring_soon: "secondary" };

  if (loadError) return <p role="alert">Non è stato possibile caricare i documenti. Riprova aggiornando la pagina.</p>;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Documenti</h1>
        <p className="text-muted-foreground text-sm mt-1">Documenti e certificati dei tuoi figli</p>
      </div>

      {child && <div className="bg-card border rounded-2xl p-5">
        <h2 className="font-semibold mb-4">Carica Documento</h2>
        <form onSubmit={handleUpload} className="space-y-3">
          <p className="text-sm text-muted-foreground">{child.firstName} {child.lastName} · PDF o immagine, massimo 5 MB</p>
          <DocumentFilePicker file={file} onChange={setFile} disabled={uploading} />
          <div>
            <Label className="text-sm">Note (opzionale)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Es. Certificato medico 2025-2026" className="mt-1" />
          </div>
          <Button type="submit" disabled={uploading || !file} className="w-full gap-2">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Caricamento..." : "Carica Documento"}
          </Button>
        </form>
      </div>}

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
                {fileDownload(doc)}
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
              {fileDownload(doc)}
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
