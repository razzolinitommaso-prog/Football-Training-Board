import { useState, useEffect } from "react";
import { Heart, Copy, RefreshCw, Eye, EyeOff, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Errore API"); }
  return res.json();
}

export default function ParentAdminManagement() {
  const { toast } = useToast();
  const [data, setData] = useState<{ accessCode: string; parentCode: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showParentCode, setShowParentCode] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    apiFetch("/admin/parent-code")
      .then(setData)
      .catch(err => toast({ title: "Errore", description: err.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() =>
      toast({ title: "Copiato!", description: `${label} copiato negli appunti.` })
    );
  }

  async function regenerateCode() {
    setRegenerating(true);
    try {
      const result = await apiFetch("/admin/parent-code/regenerate", { method: "POST" });
      setData(prev => prev ? { ...prev, parentCode: result.parentCode } : null);
      toast({ title: "Codice rigenerato", description: "Il nuovo codice è attivo. Comunicalo ai genitori." });
    } catch (err: any) {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    } finally {
      setRegenerating(false);
      setConfirmOpen(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Accesso Genitori</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gestisci le credenziali di accesso condivise per i genitori della tua società
        </p>
      </div>

      <div className="bg-pink-500/5 border border-pink-500/20 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center">
            <Heart className="w-5 h-5 text-pink-400" />
          </div>
          <div>
            <p className="font-semibold">Area Genitori — Credenziali Condivise</p>
            <p className="text-sm text-muted-foreground">
              Tutti i genitori della società usano questi due codici per accedere
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="bg-background border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">Codice Club (1° campo)</p>
            <div className="flex items-center gap-3">
              <span className="font-mono text-2xl font-bold tracking-widest text-foreground flex-1">
                {data?.accessCode ?? "—"}
              </span>
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(data?.accessCode ?? "", "Codice Club")}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Il codice a 4 cifre del club — invariato</p>
          </div>

          <div className="bg-background border rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">Codice Genitori (2° campo)</p>
            <div className="flex items-center gap-3">
              <span className="font-mono text-2xl font-bold tracking-widest text-pink-400 flex-1">
                {showParentCode ? (data?.parentCode ?? "—") : "••••••••"}
              </span>
              <Button variant="outline" size="sm" onClick={() => setShowParentCode(!showParentCode)}>
                {showParentCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(data?.parentCode ?? "", "Codice Genitori")}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Il codice di 8 caratteri — puoi rigenerarlo se necessario</p>
          </div>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3">
          <CheckCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-300 space-y-1">
            <p className="font-medium">Come comunicare i codici ai genitori</p>
            <p className="text-blue-300/80">
              Condividi entrambi i codici ai genitori degli atleti. Li useranno nell'<strong>Area Genitori</strong> (link con icona cuore rosa). 
              Il codice club è fisso; il codice genitori può essere rigenerato se compromesso.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={() => setConfirmOpen(true)}
          disabled={regenerating}
          className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10"
        >
          {regenerating ? (
            <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Rigenerazione...</>
          ) : (
            <><RefreshCw className="w-4 h-4 mr-2" /> Rigenera Codice Genitori</>
          )}
        </Button>
      </div>

      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-300/80">
          <strong>Attenzione:</strong> Se rigeneri il codice genitori, tutti i genitori non potranno più accedere fino a quando non comunichi loro il nuovo codice.
        </p>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rigenerare il Codice Genitori?</AlertDialogTitle>
            <AlertDialogDescription>
              Il vecchio codice smetterà di funzionare immediatamente. Dovrai comunicare il nuovo codice a tutti i genitori prima che possano rientrare nell'area genitori.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={regenerateCode} className="bg-red-600 hover:bg-red-700 text-white">
              Sì, rigenera
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
