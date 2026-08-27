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
import { withApi } from "@/lib/api-base";

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
interface Player {
  id: number;
  firstName: string;
  lastName: string;
  teamId?: number | null;
  teamName?: string | null;
  available?: boolean | null;
  unavailabilityReason?: string | null;
  availabilityOverrideActive?: boolean | null;
  availabilityOverrideFrom?: string | null;
  availabilityOverrideUntil?: string | null;
}
interface AttendanceRecord { id: number; playerId: number; playerName?: string; status: string; notes?: string | null; }
interface AttendanceSummary {
  present: number;
  absent: number;
  requested: number;
  injured: number;
  total: number;
  recorded: number;
  percentage: number;
}
type TrainingConduct = "ottima" | "buona" | "insufficiente";
type ClubSection = "scuola_calcio" | "settore_giovanile" | "prima_squadra";
type Team = { id: number; name: string; clubSection?: string | null };

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(withApi(url), { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
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
const conductLabels: Record<TrainingConduct, string> = {
  ottima: "Ottima",
  buona: "Buona",
  insufficiente: "Insufficiente",
};
const ATTENDANCE_META_PREFIX = "[FTB_ATTENDANCE_META]";

function parseAttendanceMeta(notes?: string | null): { conduct?: TrainingConduct } {
  const raw = String(notes ?? "").trim();
  const line = raw.split(/\r?\n/).find((item) => item.startsWith(ATTENDANCE_META_PREFIX));
  if (!line) return {};
  try {
    const parsed = JSON.parse(line.slice(ATTENDANCE_META_PREFIX.length).trim());
    const conduct = parsed?.conduct;
    return conduct === "ottima" || conduct === "buona" || conduct === "insufficiente" ? { conduct } : {};
  } catch {
    return {};
  }
}

function composeAttendanceNotes(existingNotes: string | null | undefined, meta: { conduct?: TrainingConduct }) {
  const plain = String(existingNotes ?? "")
    .split(/\r?\n/)
    .filter((line) => !line.startsWith(ATTENDANCE_META_PREFIX))
    .join("\n")
    .trim();
  const encoded = `${ATTENDANCE_META_PREFIX}${JSON.stringify(meta)}`;
  return plain ? `${plain}\n${encoded}` : encoded;
}

function reasonLabel(reason?: string | null) {
  if (reason === "payment") return "pagamenti non in regola";
  if (reason === "injury") return "infortunio";
  if (reason === "other") return "certificato/tesseramento da verificare";
  return "non disponibile";
}

function hasActiveAvailabilityOverride(player: Player) {
  if (player.availabilityOverrideActive !== true) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (player.availabilityOverrideFrom && player.availabilityOverrideFrom > today) return false;
  if (!player.availabilityOverrideUntil || player.availabilityOverrideUntil < today) return false;
  return true;
}

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

export default function AttendancePage({ section }: { section?: ClubSection } = {}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { role } = useAuth();
  const qc = useQueryClient();
  const initialParams = new URLSearchParams(window.location.search);
  const initialSessionId = initialParams.get("sessionId");
  const initialTeamId = initialParams.get("teamId");
  const initialDate = initialParams.get("date");
  const initialStart = initialParams.get("start");
  const [sessionId, setSessionId] = useState<number | null>(initialSessionId ? Number(initialSessionId) : null);
  const directSessionMode = !!initialSessionId;
  const isTechnicalDirector = role === "technical_director";
  const [teamScope, setTeamScope] = useState<string>(initialTeamId || "");
  const [sessionDateFilter, setSessionDateFilter] = useState<"all" | string>(initialDate || "all");
  const [sessionKindFilter, setSessionKindFilter] = useState<"all" | string>("all");
  const [sessionObjectiveFilter, setSessionObjectiveFilter] = useState<"all" | string>("all");

  const { data: rawSessions = [] } = useQuery<TrainingSession[]>({ queryKey: ["/api/training-sessions"], queryFn: () => apiFetch("/api/training-sessions") });
  const { data: sectionTeams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams", section || "all", "attendance"],
    queryFn: () => apiFetch(section ? `/api/teams?section=${encodeURIComponent(section)}` : "/api/teams"),
  });
  const sectionTeamIds = useMemo(() => new Set(sectionTeams.map((team) => Number(team.id))), [sectionTeams]);
  const sessions = useMemo(() => {
    if (!section) return rawSessions;
    return rawSessions.filter((session) => session.teamId != null && sectionTeamIds.has(Number(session.teamId)));
  }, [rawSessions, section, sectionTeamIds]);
  const { data: players = [] } = useQuery<Player[]>({
    queryKey: ["/api/players", section || "all", "attendance"],
    queryFn: () => apiFetch(section ? `/api/players?section=${encodeURIComponent(section)}` : "/api/players"),
  });
  const { data: attendance = [], isLoading: attLoading } = useQuery<AttendanceRecord[]>({
    queryKey: ["/api/attendance", sessionId],
    queryFn: () => apiFetch(`/api/attendance?sessionId=${sessionId}`),
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (sessionId || !sessions.length) return;
    const match = sessions.find((session) => {
      if (initialTeamId && String(session.teamId ?? "") !== initialTeamId) return false;
      if (initialDate && sessionDateKey(session.scheduledAt) !== initialDate) return false;
      if (initialStart) {
        const d = new Date(session.scheduledAt);
        const time = Number.isNaN(d.getTime())
          ? ""
          : d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false });
        if (time !== initialStart) return false;
      }
      return true;
    });
    if (match) {
      setSessionId(match.id);
      if (match.teamId != null) setTeamScope(String(match.teamId));
      setSessionDateFilter(sessionDateKey(match.scheduledAt) || "all");
    }
  }, [sessionId, sessions, initialTeamId, initialDate, initialStart]);

  useEffect(() => {
    if (!directSessionMode || !sessionId || !sessions.length) return;
    const selected = sessions.find((session) => session.id === sessionId);
    if (!selected) return;
    if (selected.teamId != null) setTeamScope(String(selected.teamId));
    setSessionDateFilter(sessionDateKey(selected.scheduledAt) || "all");
  }, [directSessionMode, sessionId, sessions]);

  const markAttendance = useMutation({
    mutationFn: (data: { trainingSessionId: number; playerId: number; status: string; notes?: string | null }) =>
      apiFetch("/api/attendance", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/attendance", sessionId] });
      qc.invalidateQueries({ queryKey: ["/api/attendance-summary"] });
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  function getPlayerStatus(playerId: number) {
    return attendance.find(a => a.playerId === playerId)?.status ?? null;
  }

  function getPlayerAttendance(playerId: number) {
    return attendance.find(a => a.playerId === playerId) ?? null;
  }

  function handleStatusChange(playerId: number, status: string) {
    if (!sessionId || isTechnicalDirector) return;
    const existing = getPlayerAttendance(playerId);
    markAttendance.mutate({ trainingSessionId: sessionId, playerId, status, notes: existing?.notes ?? null });
  }

  function handleConductChange(playerId: number, conduct: TrainingConduct) {
    if (!sessionId || isTechnicalDirector) return;
    const existing = getPlayerAttendance(playerId);
    markAttendance.mutate({
      trainingSessionId: sessionId,
      playerId,
      status: existing?.status ?? "present",
      notes: composeAttendanceNotes(existing?.notes, { conduct }),
    });
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
  const filteredSessionIds = useMemo(() => filteredSessions.map((session) => session.id), [filteredSessions]);
  const { data: attendanceSummaries = {} } = useQuery<Record<string, AttendanceSummary>>({
    queryKey: ["/api/attendance-summary", filteredSessionIds.join(",")],
    queryFn: () => apiFetch(`/api/attendance-summary?sessionIds=${filteredSessionIds.join(",")}`),
    enabled: filteredSessionIds.length > 0,
  });

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

      {directSessionMode && selectedSession ? (
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seduta selezionata</div>
                <div className="mt-1 font-semibold leading-snug">{selectedSession.title ?? "Allenamento"}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {formatSessionDateTime(selectedSession.scheduledAt)}
                  {selectedSession.teamName ? ` · ${selectedSession.teamName}` : ""}
                  {selectedSession.location ? ` · ${selectedSession.location}` : ""}
                </div>
              </div>
              <Badge variant="secondary" className="w-fit">Presenze</Badge>
            </div>
          </CardContent>
        </Card>
      ) : (
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
                  {filteredSessions.map((s) => {
                    const summary = attendanceSummaries[String(s.id)];
                    const total = summary?.total ?? 0;
                    const present = summary?.present ?? 0;
                    const absent = summary?.absent ?? 0;
                    const percentage = summary?.percentage ?? 0;
                    const hasSummary = Boolean(summary);
                    return (
                      <Card
                        key={s.id}
                        className={`cursor-pointer transition-colors ${sessionId === s.id ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
                        onClick={() => setSessionId(s.id)}
                      >
                        <CardContent className="py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-sm truncate">
                                {formatSessionDateTime(s.scheduledAt)} {s.title ? `— ${s.title}` : ""}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {s.teamName ? `${s.teamName} · ` : ""}
                                {s.sessionKind ? `${s.sessionKind} · ` : ""}
                                {s.location ?? "Luogo non indicato"}
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 border border-emerald-100">
                                  {hasSummary ? `${present} su ${total || present}` : "0 su 0"}
                                </span>
                                <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700 border border-red-100">
                                  {absent} assenze
                                </span>
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary border border-primary/10">
                                  {percentage}% presenze
                                </span>
                              </div>
                            </div>
                            {sessionId === s.id && <Badge>Selezionata</Badge>}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {filteredSessions.length === 0 && (
                    <div className="text-sm text-muted-foreground py-2">Nessuna sessione trovata con questi filtri.</div>
                  )}
                </div>
              </>
            )}
            </div>
          </CardContent>
        </Card>
      )}

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
                const existingAttendance = getPlayerAttendance(player.id);
                const conduct = parseAttendanceMeta(existingAttendance?.notes).conduct;
                const Icon = status ? statusIcons[status as keyof typeof statusIcons] : Users;
                const blocked = player.available === false && !hasActiveAvailabilityOverride(player);
                return (
                  <Card key={player.id} className={`transition-shadow ${blocked ? "border-red-200 bg-red-50/50" : "hover:shadow-sm"}`}>
                    <CardContent className="py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <Icon className={`w-5 h-5 ${status ? statusColors[status as keyof typeof statusColors] : "text-muted-foreground"}`} />
                        <div className="min-w-0">
                          <span className="font-medium">{player.lastName} {player.firstName}</span>
                          {blocked && (
                            <p className="text-xs font-medium text-red-700">
                              Non disponibile: {reasonLabel(player.unavailabilityReason)}
                            </p>
                          )}
                        </div>
                      </div>
                      {isTechnicalDirector ? (
                        <Badge variant={status ? "default" : "secondary"}>
                          {status === "requested" ? "Richiesto" : status ? (t[status as keyof typeof t] as string) : "Non segnato"}
                        </Badge>
                      ) : (
                        <div className="flex flex-col gap-2 sm:items-end">
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
                              disabled={blocked && s !== "absent"}
                              onClick={() => handleStatusChange(player.id, s)}>
                              {s === "requested" ? "Richiesto" : (t[s as keyof typeof t] as string)}
                            </Button>
                          ))}
                        </div>
                        <Select value={conduct ?? ""} onValueChange={(value) => handleConductChange(player.id, value as TrainingConduct)}>
                          <SelectTrigger className="h-8 w-full sm:w-[170px] text-xs">
                            <SelectValue placeholder="Condotta" />
                          </SelectTrigger>
                          <SelectContent>
                            {(["ottima", "buona", "insufficiente"] as TrainingConduct[]).map((value) => (
                              <SelectItem key={value} value={value}>{conductLabels[value]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
