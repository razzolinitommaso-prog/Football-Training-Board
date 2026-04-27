import { useState, useEffect } from "react";
import { Copy, Eye, EyeOff, Key, Heart, Shield, Check, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Errore API"); }
  return res.json();
}

const ROLE_PERMISSIONS: { role: string; label: string; color: string; areas: string[] }[] = [
  {
    role: "admin",
    label: "Amministratore",
    color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    areas: ["Dashboard", "Squadre", "Giocatori", "Allenamenti", "Partite", "Presenze", "Bacheca tattica", "Esercizi", "Stagioni", "Segreteria", "Fitness", "Fatturazione", "Accesso Genitori"],
  },
  {
    role: "technical_director",
    label: "Direttore Tecnico",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    areas: ["Dashboard", "Sessioni allenamento", "Esercitazioni", "Squadre", "Giocatori", "Partite", "Presenze", "Stagioni"],
  },
  {
    role: "coach",
    label: "Allenatore",
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    areas: ["Dashboard", "Squadre", "Giocatori", "Allenamenti", "Presenze", "Bacheca tattica", "Esercizi"],
  },
  {
    role: "director",
    label: "Direttore Generale",
    color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    areas: ["Dashboard", "Squadre", "Giocatori", "Allenamenti", "Partite", "Stagioni"],
  },
  {
    role: "secretary",
    label: "Segreteria",
    color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    areas: ["Dashboard", "Squadre", "Giocatori", "Iscrizioni", "Pagamenti segreteria", "Documenti", "Attrezzatura"],
  },
  {
    role: "fitness_coach",
    label: "Preparatore Atletico",
    color: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    areas: ["Dashboard", "Squadre", "Giocatori", "Fitness Dashboard", "Programmi Fitness", "Performance Giocatori"],
  },
  {
    role: "athletic_director",
    label: "Direttore Atletico",
    color: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    areas: ["Dashboard", "Squadre", "Giocatori", "Allenamenti", "Fitness Dashboard", "Programmi Fitness", "Performance Giocatori"],
  },
  {
    role: "parent",
    label: "Genitore",
    color: "bg-pink-500/10 text-pink-400 border-pink-500/20",
    areas: ["Dashboard Genitori", "Squadre & Atleti", "Comunicazioni", "Partite", "Documenti", "Pagamenti atleti"],
  },
];

const LOGIN_PATHS = [
  { role: "admin",             label: "Amministratore",     path: "/admin/login",    icon: "🛡️" },
  { role: "coach",             label: "Allenatore",         path: "/coach/login",    icon: "⚽" },
  { role: "technical_director",label: "Direttore Tecnico",  path: "/technical/login",icon: "📊" },
  { role: "director",          label: "Direttore Generale", path: "/director/login", icon: "🏢" },
  { role: "secretary",         label: "Segreteria",         path: "/secretary/login",icon: "📋" },
  { role: "fitness_coach",     label: "Prep. Atletico",     path: "/fitness/login",  icon: "💪" },
  { role: "athletic_director", label: "Dir. Atletico",      path: "/athletic/login", icon: "🏃" },
  { role: "parent",            label: "Genitore",           path: "/parent/login",   icon: "❤️" },
];

export default function CredentialsPage() {
  const { toast } = useToast();
  const { role: myRole } = useAuth();
  const [creds, setCreds] = useState<{ name: string; accessCode: string; parentCode: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showParentCode, setShowParentCode] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/clubs/me/credentials")
      .then(setCreds)
      .catch(err => toast({ title: "Errore", description: err.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2500);
      toast({ title: "Copiato negli appunti!" });
    });
  }

  async function regenerateParentCode() {
    setRegenerating(true);
    try {
      const result = await apiFetch("/admin/parent-code/regenerate", { method: "POST" });
      setCreds(prev => prev ? { ...prev, parentCode: result.parentCode } : null);
      toast({ title: "Codice rigenerato", description: "Comunica il nuovo codice ai genitori." });
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

  const origin = window.location.origin;
  const basePath = BASE;

  return (
    <div className="space-y-8 max-w-3xl mx-auto pb-10">
      <div>
        <h1 className="text-2xl font-bold">Credenziali & Accessi</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Codici di accesso della società, link per area e permessi di ogni ruolo
        </p>
      </div>

      {/* ── CODICI ACCESSO ── */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Key className="w-3.5 h-3.5" /> Codici di Accesso
        </h2>

        {/* Staff */}
        <div className="bg-card border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold">Codice Club — Staff & Gestionale</p>
              <p className="text-xs text-muted-foreground">Da comunicare a tutti i membri dello staff al primo accesso</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-primary/5 border border-primary/10 rounded-xl px-5 py-4">
            <span className="font-mono text-4xl font-bold tracking-[0.5em] text-primary flex-1 text-center">
              {creds?.accessCode ?? "—"}
            </span>
            <button onClick={() => copy(creds?.accessCode ?? "", "club")} className="text-muted-foreground hover:text-foreground transition-colors">
              {copied === "club" ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Genitori */}
        <div className="bg-card border border-pink-500/20 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-pink-500/10 flex items-center justify-center shrink-0">
              <Heart className="w-5 h-5 text-pink-400" />
            </div>
            <div>
              <p className="font-semibold">Codici Accesso Genitori</p>
              <p className="text-xs text-muted-foreground">Inserire entrambi nel login dell'Area Genitori (icona cuore rosa)</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-pink-500/5 border border-pink-500/10 rounded-xl p-3 text-center space-y-1">
              <p className="text-xs text-muted-foreground">1° campo — Codice Club</p>
              <div className="flex items-center justify-center gap-2">
                <span className="font-mono text-2xl font-bold tracking-[0.3em] text-pink-400">{creds?.accessCode ?? "—"}</span>
                <button onClick={() => copy(creds?.accessCode ?? "", "pc-club")} className="text-muted-foreground hover:text-pink-400">
                  {copied === "pc-club" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="bg-pink-500/5 border border-pink-500/10 rounded-xl p-3 text-center space-y-1">
              <p className="text-xs text-muted-foreground">2° campo — Codice Genitori</p>
              <div className="flex items-center justify-center gap-2">
                <span className="font-mono text-2xl font-bold tracking-[0.15em] text-pink-400">
                  {showParentCode ? (creds?.parentCode ?? "—") : "••••••••"}
                </span>
                <button onClick={() => setShowParentCode(!showParentCode)} className="text-muted-foreground hover:text-pink-400">
                  {showParentCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button onClick={() => copy(creds?.parentCode ?? "", "pc-parent")} className="text-muted-foreground hover:text-pink-400">
                  {copied === "pc-parent" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={() => copy(
              `Accedi all'Area Genitori: ${origin}${basePath}/parent/login\n\nCodice Club: ${creds?.accessCode}\nCodice Genitori: ${creds?.parentCode}`,
              "full-msg"
            )}
            className="w-full text-xs text-pink-400 border border-pink-500/20 rounded-xl py-2.5 hover:bg-pink-500/5 transition-colors"
          >
            {copied === "full-msg"
              ? <span className="flex items-center justify-center gap-1"><Check className="w-3 h-3" /> Copiato!</span>
              : "📋 Copia messaggio completo da inviare ai genitori"}
          </button>

          {myRole === "admin" && (
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={regenerating}
              className="w-full text-xs text-red-400/80 border border-red-500/10 rounded-xl py-2 hover:bg-red-500/5 transition-colors flex items-center justify-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${regenerating ? "animate-spin" : ""}`} />
              {regenerating ? "Rigenerazione..." : "Rigenera codice genitori (invalida il precedente)"}
            </button>
          )}
        </div>
      </section>

      {/* ── LINK ACCESSO ── */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">🔗 Link di Accesso per Ruolo</h2>
        <div className="bg-card border rounded-2xl divide-y">
          {LOGIN_PATHS.map(lp => (
            <div key={lp.role} className="flex items-center gap-3 px-4 py-3">
              <span className="text-base w-6 text-center">{lp.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{lp.label}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">{origin}{basePath}{lp.path}</p>
              </div>
              <button
                onClick={() => copy(`${origin}${basePath}${lp.path}`, `link-${lp.role}`)}
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                {copied === `link-${lp.role}` ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── PERMESSI PER RUOLO ── */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">📋 Permessi per Ruolo</h2>
        <div className="space-y-3">
          {ROLE_PERMISSIONS.map(rp => (
            <div key={rp.role} className="bg-card border rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className={`text-xs font-semibold ${rp.color}`}>{rp.label}</Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {rp.areas.map(area => (
                  <span key={area} className="text-xs bg-muted/50 text-muted-foreground rounded-md px-2 py-1">{area}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rigenerare il Codice Genitori?</AlertDialogTitle>
            <AlertDialogDescription>
              Il vecchio codice smetterà di funzionare immediatamente. Dovrai comunicare il nuovo codice a tutti i genitori.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={regenerateParentCode} className="bg-red-600 hover:bg-red-700 text-white">
              Sì, rigenera
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
