import { useEffect, useState } from "react";
import { AlertCircle, CalendarCheck, CheckCircle2, ChevronLeft, ChevronRight, CircleDotDashed, Lock, MapPin, Shirt, XCircle } from "lucide-react";
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

function availabilityLabel(session: any) {
  const status = session.parentAvailability?.status;
  if (status === "available") return "Disponibile";
  if (status === "unavailable") return "Non disponibile";
  return "Da indicare";
}

function availabilityTone(session: any) {
  const status = session.parentAvailability?.status;
  if (status === "available") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (status === "unavailable") return "text-red-700 bg-red-50 border-red-200";
  return "text-amber-700 bg-amber-50 border-amber-200";
}

function fmtDeadline(d?: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleString("it-IT", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function dateKey(value?: string | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function buildCalendarDays(monthDate: Date) {
  const first = startOfMonth(monthDate);
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

function monthTitle(date: Date) {
  return date.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

function TrainingAvailability({ session, onUpdated }: { session: any; onUpdated: (next: any) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState(session.parentAvailability?.reason ?? "illness");
  const [notes, setNotes] = useState(session.parentAvailability?.notes ?? "");
  const locked = session.parentAvailabilityLocked === true;

  useEffect(() => {
    setReason(session.parentAvailability?.reason ?? "illness");
    setNotes(session.parentAvailability?.notes ?? "");
  }, [session.id, session.parentAvailability?.reason, session.parentAvailability?.notes]);

  async function save(status: "available" | "unavailable") {
    setError("");
    if (locked) return;
    setSaving(true);
    try {
      const updated = await apiFetch(`/parent/training-availability/${encodeURIComponent(session.id)}/${session.parentPlayerId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          reason: status === "unavailable" ? reason : undefined,
          notes: status === "unavailable" ? notes : undefined,
        }),
      });
      onUpdated({
        status: updated.status,
        reason: updated.reason ?? null,
        reasonLabel: updated.reasonLabel ?? REASON_OPTIONS.find((item) => item.value === updated.reason)?.label.toLowerCase() ?? null,
        notes: updated.notes ?? null,
        updatedAt: updated.updatedAt ?? null,
      });
    } catch (err: any) {
      setError(err?.message ?? "Impossibile salvare la disponibilita.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border bg-muted/20 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline" className={`border ${availabilityTone(session)}`}>
          {availabilityLabel(session)}
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          {locked ? (
            <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Scaduta</span>
          ) : (
            <>Modificabile fino a {fmtDeadline(session.parentAvailabilityDeadline)}</>
          )}
        </span>
      </div>

      {session.parentAvailability?.status === "unavailable" && (
        <p className="text-xs text-red-600">
          Motivo: {session.parentAvailability.reasonLabel ?? "non indicato"}
          {session.parentAvailability.notes ? ` - ${session.parentAvailability.notes}` : ""}
        </p>
      )}

      {!locked && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Motivo indisponibilita" />
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" className="gap-2" disabled={saving} onClick={() => void save("available")}>
              <CheckCircle2 className="h-4 w-4" />
              Disponibile
            </Button>
            <Button type="button" variant="outline" className="gap-2" disabled={saving} onClick={() => void save("unavailable")}>
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

function TrainingScheduleCard({ session, onUpdated }: { session: any; onUpdated: (next: any) => void }) {
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
      {session.parentPlayerId && (
        <TrainingAvailability
          session={session}
          onUpdated={onUpdated}
        />
      )}
    </div>
  );
}

export default function ParentAttendance() {
  const [items, setItems] = useState<any[]>([]);
  const [training, setTraining] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDateKey, setSelectedDateKey] = useState(dateKey(new Date()));
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(new Date()));
  const historyItems = items.filter((item) => !item.scheduledAt || new Date(item.scheduledAt) < new Date());
  const calendarDays = buildCalendarDays(visibleMonth);
  const trainingByDay = training.reduce<Record<string, any[]>>((acc, session) => {
    const key = dateKey(session.scheduledAt);
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(session);
    return acc;
  }, {});
  const selectedTraining = trainingByDay[selectedDateKey] ?? [];

  function updateTrainingAvailability(sessionId: string, parentAvailability: any) {
    setTraining((prev) => prev.map((session) =>
      session.id === sessionId ? { ...session, parentAvailability } : session,
    ));
  }

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
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Calendario allenamenti</h1>
        <p className="mt-1 text-sm text-muted-foreground">Programma generale della squadra con giorni, orari, campo e spogliatoio.</p>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Button type="button" variant="outline" size="icon" onClick={() => setVisibleMonth((current) => addMonths(current, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <h2 className="text-base font-semibold capitalize">{monthTitle(visibleMonth)}</h2>
            <p className="text-xs text-muted-foreground">Tocca una data per vedere gli allenamenti del calendario generale.</p>
          </div>
          <Button type="button" variant="outline" size="icon" onClick={() => setVisibleMonth((current) => addMonths(current, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-muted-foreground">
          {["L", "M", "M", "G", "V", "S", "D"].map((day) => <div key={day}>{day}</div>)}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1">
          {calendarDays.map((day) => {
            const key = dateKey(day);
            const sessions = trainingByDay[key] ?? [];
            const isSelected = key === selectedDateKey;
            const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
            const hasTraining = sessions.length > 0;

            return (
              <button
                type="button"
                key={key}
                onClick={() => setSelectedDateKey(key)}
                className={[
                  "min-h-14 rounded-xl border p-1 text-left transition-colors",
                  isSelected ? "border-primary bg-primary/10" : "border-transparent bg-muted/30 hover:border-primary/40",
                  isCurrentMonth ? "opacity-100" : "opacity-40",
                ].join(" ")}
              >
                <span className="block text-xs font-semibold">{day.getDate()}</span>
                {hasTraining && (
                  <span className="mt-2 block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">
            {new Date(`${selectedDateKey}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" })}
          </h2>
          <p className="text-xs text-muted-foreground">Sono mostrati solo gli allenamenti del calendario generale, non le sessioni tecniche del mister.</p>
        </div>
        {selectedTraining.length === 0 ? (
          <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">Nessun allenamento fisso in questa data.</div>
        ) : (
          selectedTraining.map((session) => (
            <TrainingScheduleCard
              key={session.id}
              session={session}
              onUpdated={(parentAvailability) => updateTrainingAvailability(session.id, parentAvailability)}
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
