import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { withApi } from "@/lib/api-base";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
export type TechnicalSection = "scuola_calcio" | "settore_giovanile" | "prima_squadra";
export type TechnicalTeam = { id: number; name: string; clubSection?: string | null };
export const technicalSections = { scuola_calcio: "Scuola Calcio", settore_giovanile: "Settore Giovanile", prima_squadra: "Prima Squadra" };
type Scope = { enabled: boolean; section?: TechnicalSection; teamId?: number; teams: TechnicalTeam[]; loading: boolean; error: boolean; setSection: (value: string) => void; setTeam: (value: string) => void };
const Context = createContext<Scope>({ enabled: false, teams: [], loading: false, error: false, setSection: () => {}, setTeam: () => {} });
export function TechnicalScopeProvider({ children }: { children: ReactNode }) {
  const { role, club, user } = useAuth();
  const enabled = role === "technical_director";
  const key = `ftb-technical-scope:${club?.id}:${user?.id}`;
  const [stored, setStored] = useState<{ key: string; section?: string; teamId?: number }>({ key: "" });
  useEffect(() => { try { setStored({ ...JSON.parse(localStorage.getItem(key) ?? "{}"), key }); } catch { setStored({ key }); } }, [key]);
  const query = useQuery<TechnicalTeam[]>({ queryKey: ["technical-scope", club?.id, user?.id], enabled: enabled && !!club?.id, queryFn: async () => { const r = await fetch(withApi("/api/exercises/my-teams"), { credentials: "include" }); if (!r.ok) throw Error("Annate non disponibili"); return r.json(); } });
  const teams = query.data ?? [];
  const section = stored.key === key && stored.section && teams.some(t => t.clubSection === stored.section) ? stored.section as TechnicalSection : undefined;
  const teamId = stored.key === key && teams.some(t => t.id === stored.teamId && (!section || t.clubSection === section)) ? stored.teamId : undefined;
  const save = (value: { section?: string; teamId?: number }) => { setStored({ ...value, key }); try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  return <Context.Provider value={{ enabled, section, teamId, teams, loading: query.isPending, error: query.isError, setSection: value => save({ section: value === "all" ? undefined : value }), setTeam: value => save({ section: value === "all" ? section : teams.find(team => team.id === Number(value))?.clubSection ?? section, teamId: value === "all" ? undefined : Number(value) }) }}>{children}</Context.Provider>;
}
export const useTechnicalScope = () => useContext(Context);
export function TechnicalScopeBar() {
  const scope = useTechnicalScope();
  if (!scope.enabled) return null;
  return <section aria-label="Ambito direzione tecnica" className="mb-6 grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2">
    <div className="space-y-2"><label className="text-xs text-muted-foreground">Settore</label><Select value={scope.section ?? "all"} onValueChange={scope.setSection}><SelectTrigger aria-label="Settore direzione tecnica"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tutti i settori</SelectItem>{Object.entries(technicalSections).filter(([key]) => scope.teams.some(t => t.clubSection === key)).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-2"><label className="text-xs text-muted-foreground">Annata</label><Select value={scope.teamId ? String(scope.teamId) : "all"} onValueChange={scope.setTeam}><SelectTrigger aria-label="Annata direzione tecnica"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tutte le annate del settore</SelectItem>{scope.teams.filter(t => !scope.section || t.clubSection === scope.section).map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent></Select></div>
    {scope.loading && <p className="text-xs text-muted-foreground">Caricamento annate…</p>}{scope.error && <p role="alert">Impossibile caricare le annate. Ricarica la pagina.</p>}
  </section>;
}
