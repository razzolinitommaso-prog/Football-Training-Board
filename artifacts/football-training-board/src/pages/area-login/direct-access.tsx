import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { ArrowLeft, Heart, ShieldCheck } from "lucide-react";
import { Link, Redirect, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { withApi } from "@/lib/api-base";
import { setAuthToken } from "@/lib/auth-token";

function AccessCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="mobile-safe-screen flex items-center justify-center bg-background p-5 sm:p-8">
      <div className="w-full max-w-md space-y-5">
        <Link href="/login-club" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Scegli società
        </Link>
        <section className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
          <div>
            <p className="mb-2 text-sm text-muted-foreground">Football Training Board</p>
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}

async function post(path: string, data: object, signal?: AbortSignal) {
  const response = await fetch(withApi(`/api/auth/${path}`), {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data), signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? (response.status === 404
      ? "Invito scaduto o già usato. Chiedine uno nuovo alla società."
      : "Operazione non riuscita. Riprova tra poco."));
  }
  return response.json();
}

export function DirectParentLogin() {
  const { user, role, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const clubId = Number(new URLSearchParams(location.search).get("clubId"));
  const legacyUrl = "/parent/login";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await post("parent-sign-in", {
        contact: fields.get("contact"), password: fields.get("password"), clubId: clubId || undefined,
      });
      setAuthToken(result.authToken);
      queryClient.setQueryData(getGetCurrentUserQueryKey(), await getCurrentUser());
      navigate("/parent-dashboard");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Accesso non riuscito.");
    } finally { setBusy(false); }
  }
  if (user) return <Redirect to={role === "parent" ? "/parent-dashboard" : "/dashboard"} />;
  return <AccessCard title="Accedi come genitore" subtitle="Usa il recapito su cui hai ricevuto l’invito e la password che hai scelto.">
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-1.5"><Label htmlFor="family-contact">Email o numero di cellulare</Label>
        <Input id="family-contact" name="contact" autoComplete="username" autoCapitalize="none" required maxLength={254} /></div>
      <div className="space-y-1.5"><Label htmlFor="family-password">Password</Label>
        <Input id="family-password" name="password" type="password" autoComplete="current-password" required maxLength={72} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="w-full gap-2" disabled={busy || isLoading}><Heart className="h-4 w-4" />{busy ? "Accesso in corso…" : "Accedi"}</Button>
    </form>
    <div className="space-y-2 border-t pt-4 text-sm text-muted-foreground">
      <Link href={legacyUrl} className="block font-medium text-primary underline-offset-4 hover:underline">Accedi con i codici della società</Link>
      <p>Hai perso l’invito o la password? Chiedi un nuovo accesso alla segreteria.</p>
    </div>
  </AccessCard>;
}

type Activation = { kind: "staff" | "parent"; clubId: number; choosePassword: boolean };
export function ActivateAccess() {
  const [token] = useState(() => window.location.hash.slice(1));
  const [invite, setInvite] = useState<Activation | null>(null);
  const [result, setResult] = useState<Activation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    post("activation/status", { token }, controller.signal).then(setInvite).catch(error => {
      if (!controller.signal.aborted) setError(error.message);
    });
    return () => controller.abort();
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invite) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await post("activation", { token, password: form.get("password") ?? undefined, confirmPassword: form.get("confirmPassword") ?? undefined });
      history.replaceState(history.state, "", location.pathname + location.search);
      setResult(invite);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Attivazione non riuscita.");
    } finally { setBusy(false); }
  }

  return <AccessCard title={result ? "Accesso attivato" : "Attiva il tuo accesso"}
    subtitle={result ? "Ora puoi entrare in Football Training Board." : "L’invito è personale e scade dopo 48 ore."}>
    {result ? <Button asChild className="w-full"><Link href={`${result.kind === "parent" ? "/accesso-genitori" : "/accesso-membri"}?clubId=${result.clubId}`}>Vai all’accesso</Link></Button>
      : invite ? <form className="space-y-4" onSubmit={submit}>
          {invite.choosePassword ? <>
            <div className="space-y-1.5"><Label htmlFor="activation-password">Scegli una password</Label>
              <Input id="activation-password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
              <p className="text-xs text-muted-foreground">Almeno 8 caratteri, fino a 72 byte.</p></div>
            <div className="space-y-1.5"><Label htmlFor="activation-confirm">Conferma password</Label>
              <Input id="activation-confirm" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={72} /></div>
          </> : <p className="text-sm">Conferma l’invito alla nuova società. Potrai continuare a usare la tua password FTB.</p>}
          <Button disabled={busy} className="w-full gap-2"><ShieldCheck className="h-4 w-4" />{busy ? "Attivazione in corso…" : "Attiva accesso"}</Button>
        </form> : !error && <p role="status" className="text-sm">Verifica dell’invito…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </AccessCard>;
}
