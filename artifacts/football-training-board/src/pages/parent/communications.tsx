import { useState, useEffect } from "react";
import { MessageSquare, Bell, Info, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string) {
  const res = await fetch(`${BASE}/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

const typeIcons: Record<string, any> = {
  info: Info,
  warning: AlertTriangle,
  urgent: AlertTriangle,
  announcement: Bell,
};

const typeColors: Record<string, string> = {
  info: "text-blue-400",
  warning: "text-amber-400",
  urgent: "text-red-400",
  announcement: "text-emerald-400",
};

export default function ParentCommunications() {
  const [communications, setCommunications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/parent/communications").then(setCommunications).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Comunicazioni</h1>
        <p className="text-muted-foreground text-sm mt-1">Messaggi e aggiornamenti dal club</p>
      </div>

      {communications.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <MessageSquare className="w-14 h-14 mx-auto mb-4 opacity-25" />
          <p className="font-semibold">Nessuna comunicazione</p>
          <p className="text-sm mt-1">Le comunicazioni del club appariranno qui.</p>
        </div>
      )}

      <div className="space-y-3">
        {communications.map(comm => {
          const Icon = typeIcons[comm.type] ?? Bell;
          const color = typeColors[comm.type] ?? "text-muted-foreground";
          return (
            <div key={comm.id} className="bg-card border rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl bg-muted/50 flex items-center justify-center shrink-0`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm">{comm.title}</p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(comm.sentAt).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{comm.message}</p>
                  {comm.type && (
                    <Badge variant="outline" className="mt-2 text-xs capitalize">{comm.type}</Badge>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
