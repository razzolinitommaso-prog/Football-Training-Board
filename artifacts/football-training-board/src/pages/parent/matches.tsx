import { useState, useEffect } from "react";
import { Trophy, MapPin, CalendarDays, ChevronDown, ChevronUp, CheckCircle, XCircle, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const REASON_OPTIONS = [
  { value: "illness", label: "Malattia" },
  { value: "catechism", label: "Catechismo" },
  { value: "family", label: "Motivi familiari" },
  { value: "other", label: "Altro" },
];

function availabilityLabel(match: any) {
  const status = match.parentAvailability?.status;
  if (status === "available") return "Disponibile";
  if (status === "unavailable") return "Non disponibile";
  return "Da indicare";
}

function availabilityTone(match: any) {
  const status = match.parentAvailability?.status;
  if (status === "available") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (status === "unavailable") return "text-red-700 bg-red-50 border-red-200";
  return "text-amber-700 bg-amber-50 border-amber-200";
}

function fmtDeadline(d?: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" });
}

function MatchAvailability({ match, onUpdated }: { match: any; onUpdated: (next: any) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState(match.parentAvailability?.reason ?? "illness");
  const [notes, setNotes] = useState(match.parentAvailability?.notes ?? "");
  const locked = match.parentAvailabilityLocked === true;

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
        status: updated.status,
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
            <Button type="button" variant="outline" className="gap-2" disabled={saving} onClick={() => void save("available")}>
              <CheckCircle className="h-4 w-4" />
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

function applyParentAvailability(match: any, parentAvailability: any) {
  return { ...match, parentAvailability };
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: any }> = {
    scheduled: { label: "Programmata", variant: "outline" },
    played: { label: "Giocata", variant: "default" },
    cancelled: { label: "Annullata", variant: "destructive" },
    postponed: { label: "Rinviata", variant: "secondary" },
  };
  const s = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={s.variant} className="text-xs">{s.label}</Badge>;
}

export default function ParentMatches() {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    apiFetch("/parent/matches")
      .then(data => {
        setMatches(data);
        if (data.length > 0) setExpanded({ [data[0].teamId]: true });
      })
      .catch((error) => {
        if (import.meta.env.DEV) console.error(error);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  const grouped = matches.reduce<Record<string, { teamName: string; teamId: number; items: any[] }>>((acc, m) => {
    const key = String(m.teamId);
    if (!acc[key]) acc[key] = { teamName: m.teamName ?? `Squadra ${m.teamId}`, teamId: m.teamId, items: [] };
    acc[key].items.push(m);
    return acc;
  }, {});

  const groups = Object.values(grouped);

  function toggle(id: number) { setExpanded(prev => ({ ...prev, [id]: !prev[id] })); }

  function updateMatchAvailability(matchId: number, parentAvailability: any) {
    setMatches((prev) => prev.map((match) =>
      match.id === matchId ? applyParentAvailability(match, parentAvailability) : match,
    ));
  }

  if (groups.length === 0) return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">Partite</h1>
      <div className="text-center py-20 text-muted-foreground">
        <Trophy className="w-14 h-14 mx-auto mb-4 opacity-25" />
        <p className="font-semibold">Nessuna partita programmata</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Partite</h1>
        <p className="text-muted-foreground text-sm mt-1">{matches.length} partit{matches.length === 1 ? "a" : "e"} in totale</p>
      </div>

      <div className="space-y-4">
        {groups.map(group => (
          <div key={group.teamId} className="bg-card border rounded-2xl overflow-hidden">
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => toggle(group.teamId)}
            >
              <div className="flex items-center gap-3">
                <Trophy className="w-5 h-5 text-amber-500" />
                <div>
                  <p className="font-semibold">{group.teamName}</p>
                  <p className="text-xs text-muted-foreground">{group.items.length} partit{group.items.length === 1 ? "a" : "e"}</p>
                </div>
              </div>
              {expanded[group.teamId] ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>

            {expanded[group.teamId] && (
              <div className="border-t divide-y">
                {group.items.map(match => (
                  <div key={match.id} className="p-4 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          {match.homeAway === "home" ? "🏠 Casa" : "✈️ Trasferta"} — <span className="text-primary">vs {match.opponent}</span>
                        </p>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                          <CalendarDays className="w-3 h-3" />
                          {fmtDate(match.date)}
                        </div>
                        {(match.location || match.venue) && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MapPin className="w-3 h-3" />
                            {match.location || match.venue}
                          </div>
                        )}
                        {match.status === "played" && match.homeScore != null && match.awayScore != null && (
                          <p className="text-sm font-bold mt-1">{match.homeScore} – {match.awayScore}</p>
                        )}
                      </div>
                      <StatusBadge status={match.status} />
                    </div>
                    {match.parentPlayerId && (
                      <MatchAvailability
                        match={match}
                        onUpdated={(parentAvailability) => updateMatchAvailability(match.id, parentAvailability)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
