import { useEffect, useState } from "react";
import { AlertCircle, CalendarCheck, CheckCircle2, CircleDotDashed, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { withApi } from "@/lib/api-base";

async function apiFetch(path: string) {
  const res = await fetch(withApi(`/api${path}`), { credentials: "include" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

const STATUS = {
  present: { label: "Presente", icon: CheckCircle2, variant: "default" as const },
  absent: { label: "Assente", icon: XCircle, variant: "destructive" as const },
  requested: { label: "Richiesta", icon: CircleDotDashed, variant: "secondary" as const },
  injured: { label: "Infortunato", icon: AlertCircle, variant: "secondary" as const },
};

export default function ParentAttendance() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/parent/attendance")
      .then(setItems)
      .catch((error) => { if (import.meta.env.DEV) console.error(error); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Presenze allenamenti</h1>
        <p className="mt-1 text-sm text-muted-foreground">Storico presenze registrate dalla societa.</p>
      </div>

      {items.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <CalendarCheck className="mx-auto mb-4 h-14 w-14 opacity-25" />
          <p className="font-semibold">Nessuna presenza registrata</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const info = STATUS[item.status as keyof typeof STATUS] ?? STATUS.present;
            const Icon = info.icon;
            return (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4">
                <div className="min-w-0">
                  <p className="font-semibold">{item.sessionTitle ?? "Allenamento"}</p>
                  <p className="text-xs text-muted-foreground">{item.teamName ?? "Squadra"}</p>
                  {item.scheduledAt && <p className="text-xs text-primary">{new Date(item.scheduledAt).toLocaleString("it-IT")}</p>}
                  {item.notes && <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>}
                </div>
                <Badge variant={info.variant} className="gap-1">
                  <Icon className="h-3.5 w-3.5" />
                  {info.label}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
