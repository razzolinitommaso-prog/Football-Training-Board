import { useEffect, useState } from "react";
import { Star, UsersRound, Users, ShieldCheck, Plus, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { withApi } from "@/lib/api-base";

type SectionStats = { teams: number; players: number; members: number };

function useSectionStats(section: string) {
  const [data, setData] = useState<SectionStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(withApi(`/api/section-stats?section=${section}`), { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [section]);

  return { data, loading };
}

export default function PrimaSquadraPage() {
  const { data: stats, loading } = useSectionStats("prima_squadra");

  const statCards = [
    { label: "Squadre", value: stats?.teams ?? 0, icon: UsersRound, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Giocatori", value: stats?.players ?? 0, icon: Users, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Staff", value: stats?.members ?? 0, icon: ShieldCheck, color: "text-purple-500", bg: "bg-purple-500/10" },
  ];

  const isEmpty = !loading && stats?.teams === 0 && stats?.players === 0 && stats?.members === 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center">
            <Star className="w-6 h-6 text-yellow-500" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">Prima Squadra</h1>
            <p className="text-muted-foreground mt-0.5">Gestione indipendente della prima squadra</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map(s => (
          <Card key={s.label} className="border-border/50 hover:shadow-md transition-shadow">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
                <s.icon className={`w-6 h-6 ${s.color}`} />
              </div>
              <div>
                {loading
                  ? <Skeleton className="h-8 w-10 mb-1" />
                  : <p className="text-3xl font-bold">{s.value}</p>
                }
                <p className="text-sm text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            icon: UsersRound,
            title: "Squadra",
            desc: stats?.teams
              ? `${stats.teams} squadra${stats.teams !== 1 ? "e" : ""} della Prima Squadra.`
              : "Nessuna rosa configurata. Aggiungi la prima squadra e le formazioni.",
            action: "Gestisci Squadre",
            color: "text-blue-500",
            bg: "bg-blue-500/5",
            border: "border-blue-200 dark:border-blue-800/40",
            href: "/teams?section=prima_squadra",
          },
          {
            icon: Users,
            title: "Giocatori",
            desc: stats?.players
              ? `${stats.players} giocator${stats.players !== 1 ? "i" : "e"} nella Prima Squadra.`
              : "Nessun giocatore registrato. Inserisci i giocatori della prima squadra.",
            action: "Gestisci Giocatori",
            color: "text-emerald-500",
            bg: "bg-emerald-500/5",
            border: "border-emerald-200 dark:border-emerald-800/40",
            href: "/players?section=prima_squadra",
          },
          {
            icon: ShieldCheck,
            title: "Staff Tecnico",
            desc: stats?.members
              ? `${stats.members} membro${stats.members !== 1 ? "i" : ""} dello staff tecnico.`
              : "Nessun membro dello staff. Invita l'allenatore e il suo staff.",
            action: "Gestisci Staff",
            color: "text-purple-500",
            bg: "bg-purple-500/5",
            border: "border-purple-200 dark:border-purple-800/40",
            href: "/members?section=prima_squadra",
          },
        ].map(card => (
          <div key={card.title} className={`rounded-2xl border ${card.border} ${card.bg} p-6 flex flex-col gap-4`}>
            <div className="flex items-center gap-3">
              <card.icon className={`w-6 h-6 ${card.color}`} />
              <h3 className="font-semibold text-base">{card.title}</h3>
            </div>
            <p className="text-sm text-muted-foreground flex-1">{loading ? "Caricamento..." : card.desc}</p>
            <Link href={card.href}>
              <Button variant="outline" size="sm" className="gap-2 w-full">
                <Plus className="w-4 h-4" />
                {card.action}
                <ArrowRight className="w-3 h-3 ml-auto" />
              </Button>
            </Link>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-10 text-center">
          <Star className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-muted-foreground/60">Prima Squadra non ancora configurata</h3>
          <p className="text-sm text-muted-foreground/40 mt-2 max-w-md mx-auto">
            Questa sezione è separata dalla Scuola Calcio. Usa i pulsanti sopra per aggiungere squadre, giocatori e staff dedicati alla prima squadra.
          </p>
        </div>
      )}
    </div>
  );
}
