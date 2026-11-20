import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { withApi } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Rule = { sessions: number; minimum: number; allowUnratedConduct?: boolean };
export type Eligibility = { rule: Rule; weekStart: string; rows: { id: number; name: string; present: number; conduct: string | null; state: "eligible" | "pending" | "blocked"; reasons: string[] }[] };
type Preview = Eligibility & { opponent: string };
export const eligibilityLabels = { eligible: "Convocabile", blocked: "Indisponibile", pending: "Da verificare" } as const;
type Rules = { canEdit: boolean; teams: { id: number; name: string; section: string; rule: Rule | null }[] };
const counts = [1, 2, 3, 4, 5];

async function request<T>(path: string, method = "GET", body?: Rule): Promise<T> {
  const response = await fetch(withApi("/api/callup-rules" + path), { credentials: "include", method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throw new Error(problem?.error ?? "Operazione non disponibile per questa squadra.");
  }
  return response.status === 204 ? undefined as T : response.json();
}

export function CallupRulesCard({ teamId, section, role }: { teamId?: number | null; section?: string | null; role?: string | null }) {
  const auth = useAuth();
  const currentRole = role ?? auth.role;
  const enabled = ["technical_director", "director", "sporting_director", "coach", "fitness_coach", "athletic_director", "team_manager"].includes(currentRole ?? "");
  const queryClient = useQueryClient();
  const [selectedTeam, setSelectedTeam] = useState<number>();
  const [draft, setDraft] = useState<Rule | null>(null);
  const [preview, setPreview] = useState<Preview | null>();
  const [error, setError] = useState("");
  const filters = new URLSearchParams();
  if (teamId) filters.set("teamId", String(teamId));
  if (section) filters.set("section", section);
  const search = filters.toString();
  const { data, isPending, isError } = useQuery<Rules>({ queryKey: ["/api/callup-rules", auth.club?.id, auth.user?.id, currentRole, search], queryFn: () => request(search ? "?" + search : ""), enabled: enabled && !!auth.user });
  const teams = data?.teams.filter(team => !section || section === team.section) ?? [];
  const team = teams.find(item => item.id === selectedTeam) ?? teams[0];
  const update = useMutation({ mutationFn: async (action: "preview" | "save") => {
    if (!team || !draft) return;
    setError("");
    if (action === "preview") { setPreview(await request<Preview | null>("/" + team.id + "/preview", "POST", draft)); return; }
    await request("/" + team.id, "PUT", draft);
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["/api/callup-rules"] }), queryClient.invalidateQueries({ queryKey: ["/api/matches"] })]);
    setDraft(null);
  }, onError: (err: Error) => setError(err.message) });
  if (!enabled) return null;
  return <section className="mb-4 space-y-3 rounded-xl border bg-card p-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-semibold"><ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" />Regole convocazioni</h2>
    {teams.length > 1 && <select aria-label="Annata" className="min-h-9 rounded-lg border bg-background px-2" value={team?.id ?? ""} onChange={event => setSelectedTeam(Number(event.target.value))}>{teams.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}</div>
    {isPending ? <p role="status">Caricamento regole…</p> : isError ? <p role="alert">Regole non disponibili.</p> : team ? <>
      <div className="grid gap-3 rounded-lg bg-muted/40 px-3 py-2 sm:grid-cols-2"><div><span className="block text-xs text-muted-foreground">{team.name} · Allenamenti settimanali</span><strong>{team.rule ? team.rule.minimum + " presenze su " + team.rule.sessions + " allenamenti" : "Regola non impostata"}</strong></div>
      {team.rule && <div><span className="block text-xs text-muted-foreground">Condotta ammessa</span><strong>{team.rule.allowUnratedConduct ? "Da verificare, Buona o Ottima" : "Buona o Ottima"}</strong><span className="block text-xs text-muted-foreground">Insufficiente: non convocabile</span></div>}</div>
      {data?.canEdit && <Button size="sm" variant="outline" onClick={() => { setDraft(team.rule ?? { sessions: 2, minimum: 1 }); setPreview(undefined); setError(""); }}>{team.rule ? "Modifica regola" : "Imposta regola"}</Button>}
    </> : <p className="text-muted-foreground">Nessuna annata disponibile in questo ambito.</p>}
    <Dialog open={draft !== null} onOpenChange={open => { if (!open && !update.isPending) setDraft(null); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Regole convocazioni · {team?.name}</DialogTitle><DialogDescription>Imposta presenze minime e gestione della condotta per questa annata.</DialogDescription></DialogHeader>
        {draft && <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">Allenamenti settimanali<select className="min-h-10 rounded-lg border bg-background px-2" disabled={update.isPending} value={draft.sessions} onChange={event => { const sessions = Number(event.target.value); setDraft({ ...draft, sessions, minimum: Math.min(draft.minimum, sessions) }); setPreview(undefined); }}>{counts.map(count => <option key={count}>{count}</option>)}</select></label>
          <label className="grid gap-1 text-sm">Presenze minime<select className="min-h-10 rounded-lg border bg-background px-2" disabled={update.isPending} value={draft.minimum} onChange={event => { setDraft({ ...draft, minimum: Number(event.target.value) }); setPreview(undefined); }}>{counts.slice(0, draft.sessions).map(count => <option key={count}>{count}</option>)}</select></label></div>
          <fieldset className="space-y-3 rounded-lg border p-3 text-sm"><legend className="px-1 font-medium">Condotta e convocazione</legend>
            <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={draft.allowUnratedConduct === true} disabled={update.isPending} onChange={event => { setDraft({ ...draft, allowUnratedConduct: event.target.checked }); setPreview(undefined); }} /><span><strong className="block">Da verificare: consenti convocazione</strong><span className="text-xs text-muted-foreground">Vale quando non è ancora stata registrata alcuna condotta. Le presenze minime e gli altri blocchi restano obbligatori.</span></span></label>
            <div className="grid gap-2 border-t pt-3 sm:grid-cols-3"><span>Buona <strong className="text-emerald-700">· Sì</strong></span><span>Ottima <strong className="text-emerald-700">· Sì</strong></span><span>Insufficiente <strong className="text-red-700">· No</strong></span></div>
          </fieldset>
          {preview === null && <p className="text-sm text-muted-foreground">Nessuna prossima partita in calendario.</p>}
          {preview && <div className="space-y-2 text-sm"><h3 className="font-medium">Anteprima · {preview.opponent}</h3><ul className="max-h-56 divide-y overflow-auto rounded-lg border px-3">{preview.rows.map(row => <li className="grid gap-1 py-2" key={row.id}><div className="flex flex-wrap justify-between gap-2"><strong>{row.name}</strong><span>{eligibilityLabels[row.state]}</span></div><span className="text-xs text-muted-foreground">{[row.present + "/" + preview.rule.sessions + " presenze", ...row.reasons].join(" · ")}</span></li>)}</ul></div>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={update.isPending} onClick={() => update.mutate("preview")}>Vedi anteprima</Button><Button disabled={preview === undefined || update.isPending} onClick={() => update.mutate("save")}>Salva regola</Button></div>
        </div>}
      </DialogContent>
    </Dialog>
  </section>;
}
