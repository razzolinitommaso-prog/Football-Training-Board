import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { withApi } from "@/lib/api-base";

type AccessState = {
  hasPersonalAccessCode: boolean;
  personalAccessCodeSetAt?: string | null;
  resetRequestedAt?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  relation?: string | null;
};

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(withApi(`/api${path}`), {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `API error: ${res.status}`);
  return data;
}

function normalizeCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 16);
}

export default function ParentAccess() {
  const [state, setState] = useState<AccessState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requestingReset, setRequestingReset] = useState(false);
  const [currentCode, setCurrentCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      setState(await apiFetch<AccessState>("/parent/access-code"));
    } catch (err: any) {
      setError(err?.message ?? "Impossibile leggere lo stato accesso.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function savePersonalCode() {
    setError("");
    setMessage("");
    if (newCode.length < 6) {
      setError("La nuova chiave deve avere almeno 6 caratteri.");
      return;
    }
    if (newCode !== confirmCode) {
      setError("La conferma non coincide con la nuova chiave.");
      return;
    }
    setSaving(true);
    try {
      const next = await apiFetch<AccessState>("/parent/access-code", {
        method: "POST",
        body: JSON.stringify({ currentCode, newCode }),
      });
      setState((prev) => ({ ...(prev ?? {}), ...next }));
      setCurrentCode("");
      setNewCode("");
      setConfirmCode("");
      setMessage("Chiave personale aggiornata.");
    } catch (err: any) {
      setError(err?.message ?? "Impossibile aggiornare la chiave.");
    } finally {
      setSaving(false);
    }
  }

  async function requestEmergencyReset() {
    setError("");
    setMessage("");
    setRequestingReset(true);
    try {
      const result = await apiFetch<{ resetRequestedAt: string | null }>("/parent/access-code/reset-request", { method: "POST" });
      setState((prev) => ({ ...(prev ?? { hasPersonalAccessCode: true }), resetRequestedAt: result.resetRequestedAt }));
      setMessage("Reset abilitato. Il codice iniziale potra essere usato una volta per impostare una nuova chiave.");
    } catch (err: any) {
      setError(err?.message ?? "Impossibile abilitare il reset.");
    } finally {
      setRequestingReset(false);
    }
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>;
  }

  const hasPersonal = state?.hasPersonalAccessCode === true;
  const delegateName = [state?.firstName, state?.lastName].filter(Boolean).join(" ");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Accesso genitore</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gestisci la chiave personale usata per entrare nell'area genitori.
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-500" />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{delegateName || "Delegato genitore"}</p>
              <Badge variant={hasPersonal ? "default" : "secondary"}>
                {hasPersonal ? "Chiave personale attiva" : "Primo accesso"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Il codice iniziale fornito dalla societa resta codice di emergenza/reset. Dopo aver impostato una chiave personale,
              l'accesso ordinario usa solo la chiave scelta dal genitore.
            </p>
            {state?.resetRequestedAt && (
              <p className="text-xs text-amber-600">
                Reset abilitato: puoi usare il codice iniziale per entrare e impostare una nuova chiave.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">{hasPersonal ? "Cambia chiave personale" : "Imposta chiave personale"}</h2>
        </div>

        {hasPersonal && (
          <div className="space-y-2">
            <Label>Chiave attuale</Label>
            <Input
              value={currentCode}
              onChange={(e) => setCurrentCode(normalizeCode(e.target.value))}
              placeholder="Chiave personale attuale"
              className="font-mono tracking-widest"
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Nuova chiave</Label>
            <Input
              value={newCode}
              onChange={(e) => setNewCode(normalizeCode(e.target.value))}
              placeholder="Minimo 6 caratteri"
              className="font-mono tracking-widest"
            />
          </div>
          <div className="space-y-2">
            <Label>Conferma nuova chiave</Label>
            <Input
              value={confirmCode}
              onChange={(e) => setConfirmCode(normalizeCode(e.target.value))}
              placeholder="Ripeti la chiave"
              className="font-mono tracking-widest"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {message && <p className="text-sm text-emerald-600">{message}</p>}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="button" onClick={() => void savePersonalCode()} disabled={saving}>
            {saving ? "Salvataggio..." : hasPersonal ? "Aggiorna chiave" : "Imposta chiave"}
          </Button>
          {hasPersonal && (
            <Button type="button" variant="outline" onClick={() => void requestEmergencyReset()} disabled={requestingReset}>
              {requestingReset ? "Abilitazione..." : "Abilita reset con codice iniziale"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
