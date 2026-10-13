import { useEffect, useState } from "react";
import { AlertCircle, CalendarCheck, CheckCircle2, CircleDotDashed, MapPin, Shirt, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { withApi } from "@/lib/api-base";

async function apiFetch(path: string) {
  const res = await fetch(withApi(`/api${path}`), {
    credentials: "include",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `API error: ${res.status}`);
  return data;
}

const STATUS = {
  present: { label: "Presente", icon: CheckCircle2, variant: "default" as const },
  absent: { label: "Assente", icon: XCircle, variant: "destructive" as const },
  requested: { label: "Richiesta", icon: CircleDotDashed, variant: "secondary" as const },
  injured: { label: "Infortunato", icon: AlertCircle, variant: "secondary" as const },
};

function TrainingScheduleCard({ session }: { session: any }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{session.title ?? "Allenamento"}</p>
          <p className="text-xs text-muted-foreground">{session.teamName ?? "Squadra"}</p>
          {session.scheduledAt && (
            <p className="text-xs text-primary">
              {new Date(session.scheduledAt).toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" })}
              {session.startTime ? `, ${session.startTime}` : ""}
              {session.endTime ? `-${session.endTime}` : ""}
            </p>
          )}
          {session.campo && (
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {session.campo}
            </p>
          )}
          {session.lockerRoom && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Shirt className="h-3.5 w-3.5" />
              Spogliatoio {session.lockerRoom}
            </p>
          )}
        </div>
        <Badge variant="outline">Calendario</Badge>
      </div>
    </div>
  );
}

export default function ParentAttendance() {
  const [items, setItems] = useState<any[]>([]);
  const [training, setTraining] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const historyItems = items.filter((item) => !item.scheduledAt || new Date(item.scheduledAt) < new Date());

  useEffect(() => {
    Promise.all([
      apiFetch("/parent/training"),
      apiFetch("/parent/attendance"),
    ])
      .then(([trainingRows, attendanceRows]) => {
        setTraining(trainingRows);
        setItems(attendanceRows);
      })
      .catch((error) => { if (import.meta.env.DEV) console.error(error); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Calendario allenamenti</h1>
        <p className="mt-1 text-sm text-muted-foreground">Programma generale della squadra con giorni, orari, campo e spogliatoio.</p>
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Prossimi allenamenti</h2>
          <p className="text-xs text-muted-foreground">Sono mostrati solo gli allenamenti del calendario generale, non le sessioni tecniche del mister.</p>
        </div>
        {training.length === 0 ? (
          <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">Nessun allenamento fisso configurato per la squadra.</div>
        ) : (
          training.map((session) => (
            <TrainingScheduleCard
              key={session.id}
              session={session}
            />
          ))
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold">Storico</h2>
      {historyItems.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <CalendarCheck className="mx-auto mb-4 h-14 w-14 opacity-25" />
          <p className="font-semibold">Nessuna presenza registrata</p>
        </div>
      ) : (
        <div className="space-y-3">
          {historyItems.map((item) => {
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
    </div>
  );
}
