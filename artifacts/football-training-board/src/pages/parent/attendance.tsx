import { useEffect, useState } from "react";
import { AlertCircle, CalendarCheck, CheckCircle2, CircleDotDashed, Lock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { withApi } from "@/lib/api-base";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(withApi(`/api${path}`), {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
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

const REASON_OPTIONS = [
  { value: "illness", label: "Malattia" },
  { value: "catechism", label: "Catechismo" },
  { value: "family", label: "Motivi familiari" },
  { value: "other", label: "Altro" },
];

function trainingAvailabilityLabel(session: any) {
  const status = session.parentAttendance?.status;
  if (status === "requested") return "Disponibile";
  if (status === "absent") return "Non disponibile";
  return "Da indicare";
}

function trainingAvailabilityTone(session: any) {
  const status = session.parentAttendance?.status;
  if (status === "requested") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (status === "absent") return "text-red-700 bg-red-50 border-red-200";
  return "text-amber-700 bg-amber-50 border-amber-200";
}

function parseParentNote(note?: string | null) {
  const value = String(note ?? "");
  if (!value.startsWith("Genitore:")) return value;
  return value.replace(/^Genitore:\s*/i, "");
}

function TrainingAvailabilityCard({ session, onUpdated }: { session: any; onUpdated: (next: any) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("illness");
  const [notes, setNotes] = useState("");
  const locked = session.parentAttendanceLocked === true;

  async function save(status: "requested" | "absent") {
    setError("");
    if (locked || !session.parentPlayerId) return;
    setSaving(true);
    try {
      const updated = await apiFetch(`/parent/training-availability/${session.id}/${session.parentPlayerId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          reason: status === "absent" ? reason : undefined,
          notes: status === "absent" ? notes : undefined,
        }),
      });
      onUpdated({
        status: updated.status,
        notes: updated.notes ?? null,
        updatedAt: updated.createdAt ?? null,
      });
    } catch (err: any) {
      setError(err?.message ?? "Impossibile salvare la disponibilita.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{session.title ?? "Allenamento"}</p>
          <p className="text-xs text-muted-foreground">{session.teamName ?? "Squadra"}</p>
          {session.scheduledAt && <p className="text-xs text-primary">{new Date(session.scheduledAt).toLocaleString("it-IT")}</p>}
          {session.location && <p className="text-xs text-muted-foreground">{session.location}</p>}
        </div>
        <Badge variant="outline" className={`border ${trainingAvailabilityTone(session)}`}>
          {trainingAvailabilityLabel(session)}
        </Badge>
      </div>

      {session.parentAttendance?.notes && (
        <p className="text-xs text-muted-foreground">{parseParentNote(session.parentAttendance.notes)}</p>
      )}

      {locked ? (
        <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          Modifica chiusa
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Motivo se non disponibile</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Motivo assenza" />
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" className="gap-2" disabled={saving} onClick={() => void save("requested")}>
              <CheckCircle2 className="h-4 w-4" />
              Disponibile
            </Button>
            <Button type="button" variant="outline" className="gap-2" disabled={saving} onClick={() => void save("absent")}>
              <XCircle className="h-4 w-4" />
              Non disponibile
            </Button>
          </div>
          {reason === "other" && (
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Scrivi il motivo"
              className="min-h-20 text-sm"
            />
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
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
        <h1 className="text-2xl font-bold">Presenze allenamenti</h1>
        <p className="mt-1 text-sm text-muted-foreground">Comunica la disponibilita ai prossimi allenamenti e consulta lo storico.</p>
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Prossimi allenamenti</h2>
          <p className="text-xs text-muted-foreground">La disponibilita si puo modificare fino all'orario dell'allenamento.</p>
        </div>
        {training.length === 0 ? (
          <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">Nessun allenamento futuro da mostrare.</div>
        ) : (
          training.map((session) => (
            <TrainingAvailabilityCard
              key={session.id}
              session={session}
              onUpdated={(parentAttendance) => {
                setTraining((prev) => prev.map((item) =>
                  item.id === session.id ? { ...item, parentAttendance } : item,
                ));
              }}
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
