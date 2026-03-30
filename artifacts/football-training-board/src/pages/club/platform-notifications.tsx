import { useState, useEffect } from "react";
import { Bell, Info, AlertTriangle, CreditCard, AlertCircle, CheckCheck, Clock, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Errore API"); }
  return res.json();
}

type Announcement = {
  id: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  sentAt: string;
};

type TypeConfig = {
  icon: React.ElementType;
  label: string;
  badge: string;
  border: string;
  bg: string;
  iconColor: string;
};

const typeConfig: Record<string, TypeConfig> = {
  info: {
    icon: Info,
    label: "Informazione",
    badge: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    border: "border-blue-500/20",
    bg: "bg-blue-500/5",
    iconColor: "text-blue-400",
  },
  warning: {
    icon: AlertTriangle,
    label: "Avviso",
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    iconColor: "text-amber-400",
  },
  billing: {
    icon: CreditCard,
    label: "Fatturazione",
    badge: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    border: "border-purple-500/20",
    bg: "bg-purple-500/5",
    iconColor: "text-purple-400",
  },
  critical: {
    icon: AlertCircle,
    label: "Urgente",
    badge: "bg-red-500/10 text-red-400 border-red-500/20",
    border: "border-red-500/20",
    bg: "bg-red-500/5",
    iconColor: "text-red-400",
  },
};

function getConfig(type: string): TypeConfig {
  return typeConfig[type] ?? typeConfig.info;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function PlatformNotificationsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch("/club/platform-announcements");
      setAnnouncements(data);
    } catch { /* empty */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function markRead(id: number) {
    try {
      await apiFetch(`/club/platform-announcements/${id}/read`, { method: "PATCH" });
      setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, isRead: true } : a));
    } catch { /* empty */ }
  }

  async function markAllRead() {
    setMarkingAll(true);
    const unread = announcements.filter(a => !a.isRead);
    await Promise.all(unread.map(a => apiFetch(`/club/platform-announcements/${a.id}/read`, { method: "PATCH" }).catch(() => {})));
    setAnnouncements(prev => prev.map(a => ({ ...a, isRead: true })));
    setMarkingAll(false);
  }

  const unreadCount = announcements.filter(a => !a.isRead).length;

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" />
            Comunicazioni Piattaforma
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Messaggi e avvisi inviati dal gestore della piattaforma FTB alla tua società
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllRead}
              disabled={markingAll}
              className="gap-2 text-xs"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              {markingAll ? "..." : `Segna tutte come lette (${unreadCount})`}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={load} disabled={loading} className="shrink-0">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && announcements.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bell className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">Nessuna comunicazione ricevuta</p>
          <p className="text-muted-foreground/60 text-sm mt-1">
            Qui appariranno gli avvisi inviati dalla piattaforma FTB
          </p>
        </div>
      )}

      {!loading && announcements.length > 0 && (
        <div className="space-y-3">
          {announcements.map((ann) => {
            const cfg = getConfig(ann.type);
            const Icon = cfg.icon;
            return (
              <div
                key={ann.id}
                className={`relative rounded-xl border p-4 transition-all ${
                  ann.isRead
                    ? "border-border bg-card opacity-70"
                    : `${cfg.border} ${cfg.bg} shadow-sm`
                }`}
              >
                {!ann.isRead && (
                  <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-primary animate-pulse" />
                )}
                <div className="flex items-start gap-3 pr-4">
                  <div className={`mt-0.5 shrink-0 ${ann.isRead ? "text-muted-foreground" : cfg.iconColor}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-semibold text-sm ${ann.isRead ? "text-muted-foreground" : "text-foreground"}`}>
                        {ann.title}
                      </span>
                      <Badge variant="outline" className={`text-xs ${ann.isRead ? "opacity-50" : cfg.badge}`}>
                        {cfg.label}
                      </Badge>
                    </div>
                    <p className={`text-sm leading-relaxed ${ann.isRead ? "text-muted-foreground/70" : "text-foreground/80"}`}>
                      {ann.message}
                    </p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {formatDate(ann.sentAt)}
                      </span>
                      {!ann.isRead && (
                        <button
                          onClick={() => markRead(ann.id)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
                        >
                          Segna come letta
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
