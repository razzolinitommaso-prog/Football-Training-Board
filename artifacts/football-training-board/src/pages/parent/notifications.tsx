import { useState, useEffect } from "react";
import { Bell, FileText, Trophy, Banknote, MessageSquare, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

const typeConfig: Record<string, { icon: any; color: string; bg: string }> = {
  missing_document: { icon: FileText, color: "text-red-400", bg: "bg-red-500/10" },
  upcoming_match: { icon: Trophy, color: "text-amber-400", bg: "bg-amber-500/10" },
  unpaid_payment: { icon: Banknote, color: "text-orange-400", bg: "bg-orange-500/10" },
  new_communication: { icon: MessageSquare, color: "text-blue-400", bg: "bg-blue-500/10" },
};

export default function ParentNotifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    apiFetch("/parent/notifications").then(setNotifications).catch(console.error).finally(() => setLoading(false));
  }, []);

  async function markRead(id: number) {
    try {
      await apiFetch(`/parent/notifications/${id}/read`, { method: "PATCH" });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch { /* silent */ }
  }

  async function markAllRead() {
    try {
      await apiFetch("/parent/notifications/read-all", { method: "PATCH" });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      toast({ title: "Tutte lette!", description: "Notifiche segnate come lette." });
    } catch { /* silent */ }
  }

  const unread = notifications.filter(n => !n.isRead);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifiche</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {unread.length > 0 ? `${unread.length} non lett${unread.length === 1 ? "a" : "e"}` : "Tutte lette"}
          </p>
        </div>
        {unread.length > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} className="gap-2">
            <Check className="w-4 h-4" />
            Segna tutte lette
          </Button>
        )}
      </div>

      {notifications.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <Bell className="w-14 h-14 mx-auto mb-4 opacity-25" />
          <p className="font-semibold">Nessuna notifica</p>
          <p className="text-sm mt-1">Le notifiche importanti appariranno qui.</p>
        </div>
      )}

      <div className="space-y-2">
        {notifications.map(notif => {
          const cfg = typeConfig[notif.type] ?? { icon: Bell, color: "text-muted-foreground", bg: "bg-muted/50" };
          const Icon = cfg.icon;
          return (
            <div
              key={notif.id}
              onClick={() => !notif.isRead && markRead(notif.id)}
              className={`flex items-start gap-3 rounded-2xl p-4 transition-all cursor-pointer ${notif.isRead ? "bg-card border opacity-60" : "bg-card border border-primary/20 shadow-sm hover:shadow-md"}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg}`}>
                <Icon className={`w-5 h-5 ${cfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={`font-semibold text-sm ${notif.isRead ? "" : "text-foreground"}`}>{notif.title}</p>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(notif.createdAt).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{notif.message}</p>
              </div>
              {!notif.isRead && <div className="w-2 h-2 rounded-full bg-primary mt-1 shrink-0" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
