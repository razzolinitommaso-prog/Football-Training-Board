import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Users, Trophy, CalendarDays, Bell, ChevronRight, Banknote, MessageSquare } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string) {
  const res = await fetch(`${BASE}/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export default function ParentDashboard() {
  const { club } = useAuth();
  const [teams, setTeams] = useState<any[]>([]);
  const [training, setTraining] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch("/parent/children"),
      apiFetch("/parent/training"),
      apiFetch("/parent/matches"),
      apiFetch("/parent/payments"),
      apiFetch("/parent/notifications"),
    ]).then(([t, tr, m, p, n]) => {
      setTeams(t);
      setTraining(tr);
      setMatches(m);
      setPayments(p);
      setNotifications(n);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const totalPlayers = teams.reduce((sum, t) => sum + (t.players?.length ?? 0), 0);
  const pendingPayments = payments.filter(p => p.status === "pending");
  const now = new Date();
  const unreadNotifications = notifications.filter((n) => !n.isRead);
  const upcomingTraining = training.filter(t => new Date(t.scheduledAt) >= now).slice(0, 1)[0];
  const upcomingMatch = matches.filter(m => new Date(m.date) >= now).slice(0, 1)[0];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Area Genitori</h1>
        <p className="text-muted-foreground text-sm mt-1">{club?.name ?? "La tua società"} — tutte le informazioni sulle squadre</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/parent/children">
          <div className="bg-card border rounded-xl p-4 hover:border-primary/50 transition-all cursor-pointer">
            <Users className="w-6 h-6 text-primary mb-2" />
            <div className="text-2xl font-bold">{teams.length}</div>
            <div className="text-xs text-muted-foreground">Squadr{teams.length === 1 ? "a" : "e"} · {totalPlayers} atleti</div>
          </div>
        </Link>
        <Link href="/parent/payments">
          <div className={`border rounded-xl p-4 hover:border-primary/50 transition-all cursor-pointer ${pendingPayments.length > 0 ? "bg-red-500/5 border-red-500/20" : "bg-card"}`}>
            <Banknote className={`w-6 h-6 mb-2 ${pendingPayments.length > 0 ? "text-red-400" : "text-muted-foreground"}`} />
            <div className="text-2xl font-bold">{pendingPayments.length}</div>
            <div className="text-xs text-muted-foreground">Pagamenti in sospeso</div>
          </div>
        </Link>
      </div>

      {unreadNotifications.length > 0 && (
        <Link href="/parent/notifications">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 hover:border-amber-400 transition-all cursor-pointer">
            <div className="flex items-center gap-2 mb-1">
              <Bell className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold">Nuove convocazioni/comunicazioni</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Hai {unreadNotifications.length} notifica{unreadNotifications.length === 1 ? "" : "he"} non letta{unreadNotifications.length === 1 ? "" : "e"}.
            </p>
          </div>
        </Link>
      )}

      {upcomingTraining && (
        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Prossimo Allenamento</span>
          </div>
          <p className="font-medium">{upcomingTraining.title}</p>
          {upcomingTraining.teamName && <p className="text-sm text-muted-foreground">{upcomingTraining.teamName}</p>}
          <p className="text-sm text-primary mt-1">
            {new Date(upcomingTraining.scheduledAt).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      )}

      {upcomingMatch && (
        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-sm">Prossima Partita</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">vs {upcomingMatch.opponent}</p>
              {upcomingMatch.teamName && <p className="text-sm text-muted-foreground">{upcomingMatch.teamName}</p>}
              <p className="text-sm text-amber-500 mt-1">
                {new Date(upcomingMatch.date).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link href="/parent/communications">
          <div className="bg-card border rounded-xl p-4 hover:border-primary/50 transition-all cursor-pointer flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-blue-400" />
            <span className="text-sm font-medium">Comunicazioni</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
          </div>
        </Link>
        <Link href="/parent/matches">
          <div className="bg-card border rounded-xl p-4 hover:border-primary/50 transition-all cursor-pointer flex items-center gap-3">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span className="text-sm font-medium">Partite</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
          </div>
        </Link>
      </div>

      {teams.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nessuna squadra ancora</p>
          <p className="text-sm mt-1">Le squadre create dall'amministratore appariranno qui.</p>
        </div>
      )}
    </div>
  );
}
