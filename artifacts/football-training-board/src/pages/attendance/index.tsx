import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarCheck, Users, CheckCircle2, XCircle, AlertCircle, CircleDotDashed } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface TrainingSession {
  id: number;
  scheduledAt: string;
  title?: string;
  teamId?: number | null;
  teamName?: string;
  sessionKind?: string | null;
  location?: string | null;
  objectives?: string | null;
  notes?: string | null;
  description?: string | null;
}
interface Player { id: number; firstName: string; lastName: string; teamId?: number | null; teamName?: string | null; }
interface AttendanceRecord { id: number; playerId: number; playerName?: string; status: string; }

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

const statusIcons = { present: CheckCircle2, absent: XCircle, requested: CircleDotDashed, injured: AlertCircle };
const statusColors = {
  present: "text-green-600",
  absent: "text-red-500",
  requested: "text-sky-600",
  injured: "text-amber-500",
};

function formatSessionDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function sessionDateKey(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

type TeamOption = { id: string; label: string; teamId: number | null };

export default function AttendancePage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { role } = useAuth();
  const qc = useQueryClient();
  const initialSessionId = new URLSearchParams(window.location.search).get("sessionId");
  const [sessionId, setSessionId] = useState<number | null>(initialSessionId ? Number(initialSessionId) : null);
  const isTechnicalDirector = role === "technical_director";
  const [teamScope, setTeamScope] = useState<string>("");
  const [sessionDateFilter, setSessionDateFilter] = useState<"all" | string>("all");
  const [sessionKindFilter, setSessionKindFilter] = useState<"all" | string>("all");
  const [sessionObjectiveFilter, setSessionObjectiveFilter] = useState<"all" | string>("all");

  const { data: sessions = [] } = useQuery<TrainingSession[]>({ queryKey: ["/api/training-sessions"], queryFn: () => apiFetch("/api/training-sessions") });
  const { data: players = [] } = useQuery<Player[]>({ queryKey: ["/api/players"], queryFn: () => apiFetch("/api/players") });
  const { data: attendance = [], isLoading: attLoading } = useQuery<AttendanceRecord[]>({
    queryKey: ["/api/attendance", sessionId],
    queryFn: () => apiFetch(`/api/attendance?sessionId=${sessionId}`),
    enabled: !!sessionId,
  });

  const markAttendance = useMutation({
    mutationFn: (data: { trainingSessionId: number; playerId: number; status: string }) =>
      apiFetch("/api/attendance", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/attendance", sessionId] }),
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  function getPlayerStatus(playerId: number) {
    return attendance.find(a => a.playerId === playerId)?.status ?? null;
  }

  function handleStatusChange(playerId: number, status: string) {
    if (!sessionId || isTechnicalDirector) return;
    markAttendance.mutate({ trainingSessionId: sessionId, playerId, status });
  }

  const teamOptions = useMemo<TeamOption[]>(() => {
    const map = new Map<string, TeamOption>();
    for (const s of sessions) {
      const key = s.teamId != null ? String(s.teamId) : "__none__";
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          teamId: s.teamId ?? null,
          label: s.teamName?.trim() || "Senza squadra",
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "it"));
  }, [sessions]);

  useEffect(() => {
    if (teamOptions.length === 1 && !teamScope) setTeamScope(teamOptions[0].id);
  }, [teamOptions, teamScope]);

  const sessionsByScope = useMemo(() => {
    if (!teamScope) return [];
    if (teamScope === "__none__") return sessions.filter((s) => s.teamId == null);
    const id = Number(teamScope);
    return sessions.filter((s) => s.teamId === id);
  }, [sessions, teamScope]);

  const visibleSessionKinds = useMemo(() => {
    const kinds = new Set<string>();
    for (const s of sessionsByScope) {
      const kind = (s.sessionKind ?? "").trim();
      if (kind) kinds.add(kind);
    }
    return Array.from(kinds.values());
  }, [sessionsByScope]);
  const visibleSessionDates = useMemo(() => {
    const dates = new Set<string>();
    for (const s of sessionsByScope) {
      const d = new Date(s.scheduledAt);
      if (!Number.isNaN(d.getTime())) dates.add(d.toISOString().slice(0, 10));
    }
    return Array.from(dates.values()).sort((a, b) => b.localeCompare(a));
  }, [sessionsByScope]);
  const visibleSessionObjectives = useMemo(() => {
    const objectives = new Set<string>();
    for (const s of sessionsByScope) {
      const value = (s.objectives ?? "").trim();
      if (value) objectives.add(value);
    }
    return Array.from(objectives.values()).sort((a, b) => a.localeCompare(b, "it"));
  }, [sessionsByScope]);

  const filteredSessions = useMemo(() => {
    return sessionsByScope
      .filter((s) => (sessionDateFilter === "all" ? true : sessionDateKey(s.scheduledAt) === sessionDateFilter))
      .filter((s) => (sessionKindFilter === "all" ? true : (s.sessionKind ?? "") === sessionKindFilter))
      .filter((s) => (sessionObjectiveFilter === "all" ? true : (s.objectives ?? "").trim() === sessionObjectiveFilter))
      .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt));
  }, [sessionsByScope, sessionDateFilter, sessionKindFilter, sessionObjectiveFilter]);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === sessionId) ?? null,
    [sessions, sessionId],
  );

  const sessionAnnata = useMemo(() => {
    const source = `${selectedSession?.title ?? ""} ${selectedSession?.teamName ?? ""}`;
    const m = source.match(/\(([^)]+)\)/);
    if (m?.[1]) return m[1].trim().toLowerCase();
    return "";
  }, [selectedSession]);

  const filteredPlayers = useMemo(() => {
    if (!selectedSession) return players;
    if (selectedSession.teamId != null) {
      return players.filter((p) => p.teamId === selectedSession.teamId);
    }
    if (sessionAnnata) {
      return players.filter((p) => (p.teamName ?? "").toLowerCase().includes(sessionAnnata));
    }
    return players;
  }, [players, selectedSession, sessionAnnata]);
  const sortedFilteredPlayers = useMemo(() => {
    const collator = new Intl.Collator("it", { sensitivity: "base", numeric: true });
    return [...filteredPlayers].sort((a, b) => {
      const last = collator.compare((a.lastName ?? "").trim(), (b.lastName ?? "").trim());
      if (last !== 0) return last;
      const first = collator.compare((a.firstName ?? "").trim(), (b.firstName ?? "").trim());
      if (first !== 0) return first;
      return a.id - b.id;
    });
  }, [filteredPlayers]);

  const filteredPlayerIds = useMemo(() => new Set(filteredPlayers.map((p) => p.id)), [filteredPlayers]);
  const visibleAttendance = useMemo(
    () => attendance.filter((a) => filteredPlayerIds.has(a.playerId)),
    [attendance, filteredPlayerIds],
  );

  const presentCount = visibleAttendance.filter(a => a.status === "present").length;
  const absentCount = visibleAttendance.filter(a => a.status === "absent").length;
  const requestedCount = visibleAttendance.filter(a => a.status === "requested").length;
  const injuredCount = visibleAttendance.filter(a => a.status === "injured").length;
  const totalPlayers = sortedFilteredPlayers.length;
  const totalStatuses = presentCount + absentCount + requestedCount + injuredCount;
  const totalsAligned = totalStatuses === totalPlayers;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarCheck className="w-6 h-6 text-primary" />{t.trainingAttendance}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.attendanceDesc}</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            {teamOptions.length > 1 ? (
              <div className="space-y-2">
                <Label>Annata / squadra di riferimento</Label>
                <Select value={teamScope} onValueChange={setTeamScope}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona annata / squadra" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : teamOptions.length === 1 ? (
              <div className="flex items-center gap-2">
                <Label className="mb-0">Annata / squadra:</Label>
                <Badge variant="secondary">{teamOptions[0].label}</Badge>
              </div>
            ) : null}

            {teamScope && (
              <>
                <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
                  <Select value={sessionDateFilter} onValueChange={(v) => setSessionDateFilter(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Data sessione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutte le date</SelectItem>
                      {visibleSessionDates.map((dateIso) => (
                        <SelectItem key={dateIso} value={dateIso}>
                          {dateIso.split("-").reverse().join("/")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sessionKindFilter} onValueChange={(v) => setSessionKindFilter(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tipologia" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutte le tipologie</SelectItem>
                      {visibleSessionKinds.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {kind}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select value={sessionObjectiveFilter} onValueChange={(v) => setSessionObjectiveFilter(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Principio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti i principi</SelectItem>
                      {visibleSessionObjectives.map((objective) => (
                        <SelectItem key={objective} value={objective}>
                          {objective}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  {filteredSessions.map((s) => (
                    <Card
                      key={s.id}
                      className={`cursor-pointer transition-colors ${sessionId === s.id ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
                      onClick={() => setSessionId(s.id)}
                    >
                      <CardContent className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">
                              {formatSessionDateTime(s.scheduledAt)} {s.title ? `— ${s.title}` : ""}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {s.teamName ? `${s.teamName} · ` : ""}
                              {s.sessionKind ? `${s.sessionKind} · ` : ""}
                              {s.location ?? "Luogo non indicato"}
                            </div>
                          </div>
                          {sessionId === s.id && <Badge>Selezionata</Badge>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {filteredSessions.length === 0 && (
                    <div className="text-sm text-muted-foreground py-2">Nessuna sessione trovata con questi filtri.</div>
                  )}
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {sessionId && (
        <>
          {visibleAttendance.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Badge variant="outline">Totale giocatori: {totalPlayers}</Badge>
                <Badge variant="outline">Somma stati: {totalStatuses}</Badge>
              </div>
              {!totalsAligned && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                  Attenzione: la somma degli stati non coincide con il totale giocatori.
                </div>
              )}
              <div className="flex flex-wrap gap-3">
              <Badge variant="default" className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{presentCount} {t.present}</Badge>
              <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="w-3 h-3" />{absentCount} {t.absent}</Badge>
              <Badge className="flex items-center gap-1 bg-sky-500 hover:bg-sky-600 border-sky-500 text-white">
                <CircleDotDashed className="w-3 h-3" />{requestedCount} Richiesto
              </Badge>
              <Badge className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 border-amber-500 text-white">
                <AlertCircle className="w-3 h-3" />{injuredCount} {t.injured}
              </Badge>
              </div>
            </div>
          )}

          {attLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t.loading}</div>
          ) : (
            <div className="grid gap-2">
              {sortedFilteredPlayers.map((player) => {
                const status = getPlayerStatus(player.id);
                const Icon = status ? statusIcons[status as keyof typeof statusIcons] : Users;
                return (
                  <Card key={player.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Icon className={`w-5 h-5 ${status ? statusColors[status as keyof typeof statusColors] : "text-muted-foreground"}`} />
                        <span className="font-medium">{player.firstName} {player.lastName}</span>
                      </div>
                      {isTechnicalDirector ? (
                        <Badge variant={status ? "default" : "secondary"}>
                          {status === "requested" ? "Richiesto" : status ? (t[status as keyof typeof t] as string) : "Non segnato"}
                        </Badge>
                      ) : (
                        <div className="flex gap-2">
                          {(["present", "absent", "requested", "injured"] as const).map(s => (
                            <Button key={s} size="sm" variant={status === s ? "default" : "outline"}
                              className={
                                status === s && s === "absent"
                                  ? "bg-red-500 hover:bg-red-600 border-red-500"
                                  : status === s && s === "requested"
                                    ? "bg-sky-500 hover:bg-sky-600 border-sky-500"
                                    : status === s && s === "injured"
                                      ? "bg-amber-500 hover:bg-amber-600 border-amber-500"
                                      : ""
                              }
                              onClick={() => handleStatusChange(player.id, s)}>
                              {s === "requested" ? "Richiesto" : (t[s as keyof typeof t] as string)}
                            </Button>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
