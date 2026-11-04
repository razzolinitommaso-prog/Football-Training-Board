import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTechnicalScope, technicalSections } from "@/components/technical-scope";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { withApi } from "@/lib/api-base";
import { useAuth } from "@/hooks/use-auth";
type Session = { id: number; title: string; teamId: number | null; sessionKind: string; scheduledAt: string };
export default function TechnicalDashboard({ matches = false }: { matches?: boolean }) {
  const scope = useTechnicalScope();
  const { club, user } = useAuth();
  const teams = scope.teams.filter(t => (!scope.section || t.clubSection === scope.section) && (!scope.teamId || t.id === scope.teamId));
  const query = useQuery<Session[]>({ queryKey: ["/api/training-sessions", "technical-dashboard", club?.id, user?.id], queryFn: async () => { const r = await fetch(withApi("/api/training-sessions"), { credentials: "include" }); if (!r.ok) throw Error("Sedute non disponibili"); return r.json(); } });
  const sessions = (query.data ?? []).filter(s => s.teamId == null || teams.some(t => t.id === s.teamId));
  return <div className="space-y-6"><div><h1 className="text-2xl font-semibold">{matches ? "Partite per annata" : "Cruscotto direzione tecnica"}</h1><p className="mt-2 text-sm text-muted-foreground">{matches ? "Apri il programma dell’annata interessata." : "Consulta le sedute del mister e prepara linee guida facoltative."}</p></div>
    {!matches && <><div className="grid gap-4 sm:grid-cols-3">{[{ title: "Annate", value: teams.length, href: "/teams" }, { title: "Sedute del mister", value: sessions.filter(s => s.sessionKind === "regular").length, href: "/training?view=operational" }, { title: "Linee guida proposte", value: sessions.filter(s => s.sessionKind === "tipo").length, href: "/training?view=guidelines" }].map(c => <Link key={c.title} href={c.href}><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{c.title}</p><p className="mt-2 text-3xl font-semibold">{query.isPending && c.title !== "Annate" ? "…" : c.value}</p></CardContent></Card></Link>)}</div>
    {query.isError && <p role="alert">Impossibile caricare le sedute.</p>}<div className="grid gap-4 md:grid-cols-2">{[{ title: "Sedute del mister", kind: "regular", href: "/training?view=operational" }, { title: "Linee guida proposte", kind: "tipo", href: "/training?view=guidelines" }].map(c => <Card key={c.kind}><CardContent className="space-y-4 p-5"><h2 className="text-lg font-semibold">{c.title}</h2><p className="text-sm text-muted-foreground">{c.kind === "tipo" ? "Il mister consulta e decide se adottare la proposta." : "Preparazione operativa curata dall’allenatore."}</p>{sessions.filter(s => s.sessionKind === c.kind).slice(0,3).map(s => <p key={s.id} className="border-t pt-3 text-sm">{s.title}</p>)}<Button asChild variant="outline"><Link href={c.href}>Apri {c.title.toLowerCase()}</Link></Button></CardContent></Card>)}</div></>}
    <div className="grid gap-4 md:grid-cols-2">{teams.map(team => <Link key={team.id} href={matches ? `/${(team.clubSection ?? "scuola_calcio").replaceAll("_", "-")}/${team.clubSection === "settore_giovanile" ? `campionati?teamId=${team.id}` : `calendari/${team.id}`}` : `/training?teamId=${team.id}`}><Card><CardContent className="p-5"><h2 className="text-base font-semibold">{team.name}</h2><p className="mt-1 text-xs text-muted-foreground">{technicalSections[team.clubSection as keyof typeof technicalSections]} · {matches ? "Apri programma partite" : "Apri sedute"}</p></CardContent></Card></Link>)}</div></div>;
}
