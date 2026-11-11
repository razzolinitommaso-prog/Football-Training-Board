import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { withApi } from "@/lib/api-base";

type FamilyAccount = { id: number; firstName: string; lastName: string; playerId: number; childFirstName: string; childLastName: string };
type FamilyLink = Pick<FamilyAccount, "id" | "firstName" | "lastName">;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(withApi(path), { credentials: "include", ...init });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? "Operazione non riuscita.");
  }
  return response.status === 204 ? undefined as T : response.json();
}

export function ParentFamilyLinks({ playerId, onSelect }: { playerId?: number; onSelect?: (id?: number) => void }) {
  const inputId = useId();
  const client = useQueryClient();
  const [contact, setContact] = useState("");
  const [results, setResults] = useState<FamilyAccount[] | null>(null);
  const [selected, setSelected] = useState<FamilyAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const endpoint = `/api/players/${playerId}/parent-family-links`;
  const links = useQuery({
    queryKey: [endpoint],
    enabled: playerId !== undefined,
    queryFn: () => request<FamilyLink[]>(endpoint),
  });

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try { await action(); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Operazione non riuscita."); }
    finally { setBusy(false); }
  }

  function search() {
    setResults(null);
    void run(async () => {
      const accounts = await request<FamilyAccount[]>("/api/parent-family-accounts/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact }),
      });
      setResults(accounts.filter(account => account.playerId !== playerId));
    });
  }

  function select(account: FamilyAccount) {
    if (!playerId) {
      setSelected(account);
      onSelect?.(account.id);
      return;
    }
    void run(async () => {
      await request(`${endpoint}/${account.id}`, { method: "PUT" });
      await client.invalidateQueries({ queryKey: [endpoint] });
      setMessage("Account collegato.");
      setResults(null);
    });
  }

  function unlink(link: FamilyLink) {
    if (!window.confirm(`Revocare l’accesso a questo atleta per ${link.firstName} ${link.lastName}?`)) return;
    void run(async () => {
      await request(`${endpoint}/${link.id}`, { method: "DELETE" });
      await client.invalidateQueries({ queryKey: [endpoint] });
      setMessage("Collegamento revocato.");
    });
  }

  return (
    <section className="space-y-2 rounded-lg border p-3">
      <h3 className="text-sm font-semibold">Account Genitore esistente</h3>
      {links.error && <p role="alert" className="text-sm text-destructive">{links.error.message}</p>}
      {links.data?.map(link => (
        <div key={link.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>{link.firstName} {link.lastName}</span>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => unlink(link)}>Revoca collegamento</Button>
        </div>
      ))}
      {selected ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>Al salvataggio collega {selected.firstName} {selected.lastName}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => { setSelected(null); onSelect?.(); }}>Rimuovi scelta</Button>
        </div>
      ) : <>
        <label htmlFor={inputId} className="block text-sm">Email o telefono internazionale</label>
        <div className="flex flex-wrap gap-2">
          <Input id={inputId} className="min-w-32 flex-1" value={contact} maxLength={254}
            onChange={event => { setContact(event.target.value); setResults(null); }}
            onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (!busy && contact.trim()) search(); } }} />
          <Button type="button" variant="outline" disabled={busy || !contact.trim()} onClick={search}>Cerca account</Button>
        </div>
        {results?.length === 0 && <p className="text-sm text-muted-foreground">Nessun altro account attivo con questo recapito.</p>}
        {results?.map(account => (
          <div key={account.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 p-2 text-sm">
            <div>{account.firstName} {account.lastName}<span className="block text-xs text-muted-foreground">Già collegato a {account.childFirstName} {account.childLastName}</span></div>
            <Button type="button" size="sm" disabled={busy || links.data?.some(link => link.id === account.id)}
              onClick={() => select(account)}>Collega account</Button>
          </div>
        ))}
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </section>
  );
}
