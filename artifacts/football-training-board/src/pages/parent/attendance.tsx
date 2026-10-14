import { useEffect, useState } from "react";
import { AlertCircle, CalendarCheck, CheckCircle2, ChevronLeft, ChevronRight, CircleDotDashed, Lock, MapPin, Shirt, Trophy, XCircle } from "lucide-react";
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

function matchCallupLabel(match: any) {
  const ownCallup = Array.isArray(match.callUps)
    ? match.callUps.find((callup: any) => Number(callup.playerId) === Number(match.parentPlayerId))
    : null;
  const status = String(ownCallup?.status ?? "").toLowerCase();
  if (["called", "pending"].includes(status)) return "Convocato";
  return "Non convocato";
}

function matchFilterValue(match: any) {
  const availability = match.parentAvailability?.status;
  if (availability === "unavailable") return "unavailable";
  if (!availability) return "missing";
  if (matchCallupLabel(match) === "Convocato") return "called";
  return "not_called";
}

function TrainingAvailability({ session, onUpdated }: { session: any; onUpdated: (next: any) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState(session.parentAvailability?.reason ?? "illness");
  const [notes, setNotes] = useState(session.parentAvailability?.notes ?? "");
  const locked = session.parentAvailabilityLocked === true;
  const selectedStatus = session.parentAvailability?.status;

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
            <Button
              type="button"
              variant="outline"
              className={`gap-2 ${selectedStatus === "available" ? "border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white" : ""}`}
              disabled={saving}
              onClick={() => void save("available")}
            >
              <CheckCircle2 className="h-4 w-4" />
              Disponibile
            </Button>
            <Button
              type="button"
              variant="outline"
              className={`gap-2 ${selectedStatus === "unavailable" ? "border-red-500 bg-red-600 text-white hover:bg-red-700 hover:text-white" : ""}`}
              disabled={saving}
              onClick={() => void save("unavailable")}
            >
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

function MatchAvailability({ match, onUpdated }: { match: any; onUpdated: (next: any) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState(match.parentAvailability?.reason ?? "illness");
  const [notes, setNotes] = useState(match.parentAvailability?.notes ?? "");
  const locked = match.parentAvailabilityLocked === true;
  const selectedStatus = match.parentAvailability?.status;

  useEffect(() => {
    setReason(match.parentAvailability?.reason ?? "illness");
    setNotes(match.parentAvailability?.notes ?? "");
  }, [match.id, match.parentAvailability?.reason, match.parentAvailability?.notes]);

  async function save(status: "available" | "unavailable") {
    setError("");
    if (locked) return;
    setSaving(true);
    try {
      const updated = await apiFetch(`/parent/availability/${match.id}/${match.parentPlayerId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          reason: status === "unavailable" ? reason : undefined,
          notes: status === "unavailable" ? notes : undefined,
        }),
      });
      onUpdated({
        status: updated.parentAvailabilityStatus ?? updated.status,
        reason: updated.parentAvailabilityReason ?? null,
        reasonLabel: REASON_OPTIONS.find((item) => item.value === updated.parentAvailabilityReason)?.label.toLowerCase() ?? null,
        notes: updated.parentAvailabilityNotes ?? null,
        updatedAt: updated.parentAvailabilityUpdatedAt ?? null,
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
        <Badge variant="outline" className={`border ${availabilityTone(match)}`}>
          {availabilityLabel(match)}
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          {locked ? (
            <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Scaduta</span>
          ) : (
            <>Modificabile fino a {fmtDeadline(match.parentAvailabilityDeadline)}</>
          )}
        </span>
      </div>

      {match.parentAvailability?.status === "unavailable" && (
        <p className="text-xs text-red-600">
          Motivo: {match.parentAvailability.reasonLabel ?? "non indicato"}
          {match.parentAvailability.notes ? ` - ${match.parentAvailability.notes}` : ""}
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
            <Button
              type="button"
              variant="outline"
              className={`gap-2 ${selectedStatus === "available" ? "border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white" : ""}`}
              disabled={saving}
              onClick={() => void save("available")}
            >
              <CheckCircle2 className="h-4 w-4" />
              Disponibile
            </Button>
            <Button
              type="button"
              variant="outline"
              className={`gap-2 ${selectedStatus === "unavailable" ? "border-red-500 bg-red-600 text-white hover:bg-red-700 hover:text-white" : ""}`}
              disabled={saving}
              onClick={() => void save("unavailable")}
            >
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

function MatchScheduleCard({ match, onUpdated }: { match: any; onUpdated: (next: any) => void }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">vs {match.opponent ?? "Avversario"}</p>
          <p className="text-xs text-muted-foreground">{match.teamName ?? "Squadra"}</p>
          {match.date && (
            <p className="text-xs text-amber-600">
              {new Date(match.date).toLocaleString("it-IT", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          {(match.location || match.venue) && (
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {match.location || match.venue}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Partita</Badge>
          <Badge variant={matchCallupLabel(match) === "Convocato" ? "default" : "secondary"}>
            {matchCallupLabel(match)}
          </Badge>
        </div>
      </div>
      {match.parentPlayerId && (
        <MatchAvailability match={match} onUpdated={onUpdated} />
      )}
    </div>
  );
}

export default function ParentAttendance() {
  const [items, setItems] = useState<any[]>([]);
  const [training, setTraining] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [matchFilter, setMatchFilter] = useState("all");
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
  const matchesByDay = matches.reduce<Record<string, any[]>>((acc, match) => {
    const key = dateKey(match.date);
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(match);
    return acc;
  }, {});
  const selectedMatches = (matchesByDay[selectedDateKey] ?? []).filter((match) => {
    if (matchFilter === "all") return true;
    return matchFilterValue(match) === matchFilter;
  });

  function updateTrainingAvailability(sessionId: string, parentAvailability: any) {
    setTraining((prev) => prev.map((session) =>
      session.id === sessionId ? { ...session, parentAvailability } : session,
    ));
  }

  function updateMatchAvailability(matchId: number, parentAvailability: any) {
    setMatches((prev) => prev.map((match) =>
      match.id === matchId ? { ...match, parentAvailability } : match,
    ));
  }

  useEffect(() => {
    Promise.all([
      apiFetch("/parent/training"),
      apiFetch("/parent/attendance"),
      apiFetch("/parent/matches"),
    ])
      .then(([trainingRows, attendanceRows, matchRows]) => {
        setTraining(trainingRows);
        setItems(attendanceRows);
        setMatches(matchRows);
      })
      .catch((error) => { if (import.meta.env.DEV) console.error(error); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Calendario allenamenti</h1>
        <p className="mt-1 text-sm text-muted-foreground">Programma generale della squadra con allenamenti e partite.</p>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Button type="button" variant="outline" size="icon" onClick={() => setVisibleMonth((current) => addMonths(current, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <h2 className="text-base font-semibold capitalize">{monthTitle(visibleMonth)}</h2>
            <p className="text-xs text-muted-foreground">Tocca una data per vedere allenamenti e partite.</p>
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
            const dayMatches = matchesByDay[key] ?? [];
            const isSelected = key === selectedDateKey;
            const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
            const hasTraining = sessions.length > 0;
            const hasMatch = dayMatches.length > 0;

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
                <span className="mt-2 flex gap-1">
                  {hasTraining && <span className="block h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                  {hasMatch && <span className="block h-1.5 w-1.5 rounded-full bg-amber-500" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Allenamento</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Partita</span>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">
            {new Date(`${selectedDateKey}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" })}
          </h2>
          <p className="text-xs text-muted-foreground">Sono mostrati calendario generale e partite della squadra.</p>
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold"><Trophy className="h-4 w-4 text-amber-500" /> Partite</h2>
            <p className="text-xs text-muted-foreground">Filtra le partite del giorno selezionato.</p>
          </div>
          <Select value={matchFilter} onValueChange={setMatchFilter}>
            <SelectTrigger className="h-9 sm:w-56">
              <SelectValue placeholder="Filtro partite" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte</SelectItem>
              <SelectItem value="called">Convocato</SelectItem>
              <SelectItem value="not_called">Non convocato</SelectItem>
              <SelectItem value="missing">Disponibilita da indicare</SelectItem>
              <SelectItem value="unavailable">Non disponibile</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {selectedMatches.length === 0 ? (
          <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">Nessuna partita con questo filtro in questa data.</div>
        ) : (
          selectedMatches.map((match) => (
            <MatchScheduleCard
              key={match.id}
              match={match}
              onUpdated={(parentAvailability) => updateMatchAvailability(match.id, parentAvailability)}
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
