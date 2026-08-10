import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle, Clock, Trophy, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { withApi } from "@/lib/api-base";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(withApi(`/api${path}`), {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function statusLabel(status: string) {
  if (status === "available") return "Disponibile";
  if (status === "unavailable") return "Non disponibile";
  return "In attesa";
}

export default function ParentCallups() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/parent/callups")
      .then(setItems)
      .catch((error) => { if (import.meta.env.DEV) console.error(error); })
      .finally(() => setLoading(false));
  }, []);

  async function updateStatus(matchId: number, playerId: number, status: string) {
    await apiFetch(`/parent/availability/${matchId}/${playerId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setItems((prev) => prev.map((item) => item.matchId === matchId && item.playerId === playerId ? { ...item, status } : item));
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Convocazioni</h1>
        <p className="mt-1 text-sm text-muted-foreground">Partite e convocazioni del figlio collegato.</p>
      </div>

      {items.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <Trophy className="mx-auto mb-4 h-14 w-14 opacity-25" />
          <p className="font-semibold">Nessuna convocazione</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">vs {item.match?.opponent ?? "Avversario"}</p>
                  <p className="text-xs text-muted-foreground">{item.teamName ?? "Squadra"}</p>
                  {item.match?.date && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-primary">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {new Date(item.match.date).toLocaleString("it-IT", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
                <Badge variant={item.status === "available" ? "default" : item.status === "unavailable" ? "destructive" : "secondary"}>
                  {statusLabel(item.status)}
                </Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" className="gap-2" onClick={() => updateStatus(item.matchId, item.playerId, "available")}>
                  <CheckCircle className="h-4 w-4" />
                  Disponibile
                </Button>
                <Button type="button" variant="outline" className="gap-2" onClick={() => updateStatus(item.matchId, item.playerId, "unavailable")}>
                  <XCircle className="h-4 w-4" />
                  Non disponibile
                </Button>
              </div>
              {item.status === "pending" && (
                <p className="mt-2 flex items-center gap-1 text-xs text-amber-600"><Clock className="h-3.5 w-3.5" /> Conferma richiesta.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
