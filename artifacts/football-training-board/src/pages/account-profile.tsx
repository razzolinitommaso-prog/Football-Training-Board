import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { CreditCard, KeyRound, Monitor, UserRound } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useAccountAppearance } from "@/components/layout/appearance-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { withApi } from "@/lib/api-base";

type Profile = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  loginContact?: string | null;
  directParentLogin: boolean;
  sessions: { current: boolean; expiresAt: string }[];
};

const card = "space-y-4 rounded-xl border bg-card p-4 sm:p-6";
const select = "h-10 w-full rounded-md border bg-background px-3 text-sm";

async function loadProfile(): Promise<Profile> {
  const response = await fetch(withApi("/api/account/profile"), { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error("Impossibile caricare il profilo.");
  return response.json();
}

export default function AccountProfile() {
  const { role, club, logout, profileKey } = useAuth();
  const family = role === "parent";
  const { theme, setTheme, font, setFont } = useAccountAppearance();
  const { data, isError, isPending } = useQuery({
    queryKey: ["account-profile", profileKey], queryFn: loadProfile, enabled: Boolean(profileKey), retry: false,
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setMessage("");
    setError("");
    if (fields.get("password") !== fields.get("confirmPassword")) { setError("Le password non coincidono."); return; }
    setBusy(true);
    try {
      const response = await fetch(withApi("/api/account/password"), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(fields)),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Impossibile cambiare la password.");
      form.reset();
      if (result?.signInAgain) {
        setMessage("Password aggiornata. Esci e accedi con quella nuova.");
        return;
      }
      setMessage("Password aggiornata.");
    } catch (error) { setError(error instanceof Error ? error.message : "Errore di connessione."); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-4xl space-y-4">
    <header><h1 className="text-2xl font-semibold">Il mio profilo</h1><p className="mt-1 text-sm text-muted-foreground">{club?.name ?? "Football Training Board"}</p></header>
    {isError && <p role="alert" className="text-destructive">Impossibile caricare i dati del profilo.</p>}
    {isPending && <p role="status" className="text-sm text-muted-foreground">Caricamento del profilo…</p>}
    {data && <section className={card}>
      <h2 className="flex items-center gap-2 font-semibold"><UserRound className="h-5 w-5 text-primary" /> Dati personali</h2>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Nome</dt><dd>{data.firstName} {data.lastName}</dd></div>
        <div><dt className="text-muted-foreground">Email</dt><dd className="break-all">{data.email || "—"}</dd></div>
        <div><dt className="text-muted-foreground">Cellulare</dt><dd>{data.phone || "—"}</dd></div>
        {data.loginContact && <div><dt className="text-muted-foreground">Recapito di accesso</dt><dd className="break-all">{data.loginContact}</dd></div>}
      </dl>
    </section>}
    <section className={card}>
      <h2 className="flex items-center gap-2 font-semibold"><Monitor className="h-5 w-5 text-primary" /> Aspetto e leggibilità</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="profile-theme">Tema</Label><select id="profile-theme" className={select} value={theme ?? "system"} onChange={event => setTheme(event.target.value)}>
          <option value="system">Come il dispositivo</option><option value="light">Chiaro</option><option value="dark">Scuro</option>
        </select></div>
        <div className="space-y-1.5"><Label htmlFor="profile-text">Dimensione dei caratteri</Label><select id="profile-text" className={select} value={font} onChange={event => setFont(event.target.value)}>
          <option value="standard">Standard</option><option value="large">Grande</option><option value="extra">Molto grande</option>
        </select></div>
      </div>
      <p className="text-sm text-muted-foreground">Preferenze salvate per questo profilo su questo dispositivo.</p>
    </section>
    {data && <section className={card}>
      <h2 className="flex items-center gap-2 font-semibold"><KeyRound className="h-5 w-5 text-primary" /> Accesso e sicurezza</h2>
      {family && !data.directParentLogin ? <Button variant="outline" asChild><Link href="/parent/access">Gestisci la chiave personale</Link></Button>
        : <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-3">
          {[
            { name: "currentPassword", label: "Password attuale", autoComplete: "current-password", max: 256 },
            { name: "password", label: "Nuova password", autoComplete: "new-password", max: 72 },
            { name: "confirmPassword", label: "Conferma password", autoComplete: "new-password", max: 72 },
          ].map(field => <div className="space-y-1.5" key={field.name}><Label htmlFor={field.name}>{field.label}</Label>
            <Input id={field.name} name={field.name} type="password" autoComplete={field.autoComplete} required maxLength={field.max}
              minLength={field.name === "currentPassword" ? undefined : 8} /></div>)}
          <div className="space-y-2 sm:col-span-3">
            <p className="text-xs text-muted-foreground">Nuova password da 8 caratteri fino a 72 byte.</p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {message && <p role="status" className="text-sm">{message}</p>}
            <Button disabled={busy} variant="outline">Cambia password</Button>
          </div>
        </form>}
      <div className="space-y-2 border-t pt-3">
        <h3 className="text-sm font-medium">Sessioni registrate</h3>
        {data.sessions.length ? <ul className="space-y-1 text-sm text-muted-foreground">{data.sessions.map((session, index) => (
          <li key={index}>{session.current ? "Sessione attuale" : "Sessione"} · Scadenza {new Date(session.expiresAt).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</li>
        ))}</ul> : <p className="text-sm text-muted-foreground">Nessuna sessione registrata sul server.</p>}
        <Button variant="ghost" onClick={logout}>Esci da questo dispositivo</Button>
      </div>
    </section>}
    {family && <section className={card}>
      <h2 className="flex items-center gap-2 font-semibold"><CreditCard className="h-5 w-5 text-primary" /> Pagamenti</h2>
      <p className="text-sm text-muted-foreground">Consulta quote e versamenti dei figli collegati al tuo accesso.</p>
      <Button variant="outline" asChild><Link href="/parent/payments">Apri i pagamenti</Link></Button>
    </section>}
  </div>;
}
