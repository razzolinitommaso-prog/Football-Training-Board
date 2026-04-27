import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetDashboardStats, useListPlayers, useListTeams } from "@workspace/api-client-react";
import type { TrainingSlot } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UsersRound, Users, ShieldCheck, CalendarDays, ArrowRight, Activity, AlertTriangle, X, Bell, BellRing, CheckCheck, Plus, Send, Info, Siren, Clock, Layers, RefreshCw, Trophy, FileUp, Download, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { it as itLocale } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { withApi } from "@/lib/api-base";
import { normalizeSessionRole } from "@/lib/session-role";

type SecretaryClubFileRow = {
  id: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

/** Elenco file: in caso di errore API rete nulla in UI (lista vuota), solo log in sviluppo. */
async function fetchSecretaryClubFilesList(): Promise<SecretaryClubFileRow[]> {
  try {
    const res = await fetch(withApi("/api/secretary/club-files"), { credentials: "include" });
    const text = await res.text();
    if (!res.ok) {
      if (import.meta.env.DEV) {
        console.warn("[secretary/club-files] elenco non disponibile:", res.status, text.slice(0, 160));
      }
      return [];
    }
    try {
      return JSON.parse(text) as SecretaryClubFileRow[];
    } catch {
      return [];
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn("[secretary/club-files]", e);
    return [];
  }
}

async function secretaryDownloadFile(fileId: number, filename: string) {
  const res = await fetch(withApi(`/api/secretary/club-files/${fileId}/file`), { credentials: "include" });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type ClubNotification = {
  id: number;
  clubId?: number;
  title: string;
  message: string;
  type: string;
  createdAt: string;
  isRead: boolean;
  source?: "internal" | "platform";
};

async function fetchJsonOrThrow<T>(url: string): Promise<T> {
  console.log(`[dashboard] request GET ${url}`);
  const res = await fetch(withApi(url), { credentials: "include" });
  console.log(`[dashboard] response GET ${url} -> ${res.status}`);
  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[dashboard] error GET ${url}:`, errorText);
    throw new Error(`Request failed (${res.status}) for ${url}`);
  }
  const payload = (await res.json()) as T;
  console.log(`[dashboard] payload GET ${url}:`, payload);
  return payload;
}

function typeStyle(type: string) {
  if (type === "urgent") return { bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800", icon: <Siren className="w-4 h-4 text-red-500" />, badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" };
  if (type === "warning") return { bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800", icon: <AlertTriangle className="w-4 h-4 text-amber-500" />, badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" };
  return { bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800", icon: <Info className="w-4 h-4 text-blue-500" />, badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" };
}

function reasonLabel(reason: string | null | undefined, t: ReturnType<typeof useLanguage>["t"]) {
  if (reason === "illness") return t.illness;
  if (reason === "injury") return t.injuryReason;
  if (reason === "vacation") return t.vacationReason;
  if (reason === "other") return t.otherReason;
  return reason || "";
}

export default function Dashboard() {
  const { t, language } = useLanguage();
  const { role, user, club } = useAuth();
  const nr = normalizeSessionRole(role);
  const clubIdNum = Number((club as { id?: number } | null)?.id ?? 0);

  const { data: stats, isLoading } = useGetDashboardStats({
    query: {
      queryKey: ["/api/dashboard/stats", clubIdNum, nr],
      enabled: Boolean(user && nr),
    },
  });
  const { data: allPlayers } = useListPlayers({
    query: {
      queryKey: ["/api/players", clubIdNum, nr],
      // La sessione API ha già clubId: non attendere club.id dal client (evita gare e liste mai caricate).
      enabled: Boolean(user),
    },
  });
  const { data: allTeams } = useListTeams({
    query: {
      queryKey: ["/api/teams", clubIdNum, nr],
      enabled: Boolean(user),
    },
  });
  const canQuickCreateTrainingTools =
    nr === "coach" || nr === "fitness_coach" || nr === "technical_director";

  const queryClient = useQueryClient();
  const showSecretaryFilesCard = nr === "secretary" && clubIdNum > 0;
  const { data: secretaryFiles = [] } = useQuery({
    queryKey: ["/api/secretary/club-files", clubIdNum],
    queryFn: fetchSecretaryClubFilesList,
    enabled: showSecretaryFilesCard,
  });

  const uploadSecretaryFileMutation = useMutation({
    mutationFn: async (payload: { fileName: string; mimeType: string; dataBase64: string }) => {
      const res = await fetch(withApi("/api/secretary/club-files"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Upload failed (${res.status})`);
      }
      return res.json() as Promise<SecretaryClubFileRow>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/secretary/club-files", clubIdNum] });
    },
  });

  const deleteSecretaryFileMutation = useMutation({
    mutationFn: async (fileId: number) => {
      const res = await fetch(withApi(`/api/secretary/club-files/${fileId}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) {
        const text = await res.text();
        throw new Error(text || `Delete failed (${res.status})`);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/secretary/club-files", clubIdNum] });
    },
  });

  const isStaffViewer = nr === "coach" || nr === "technical_director" || nr === "fitness_coach" || nr === "athletic_director";
  const isTrainingStaff = nr === "coach" || nr === "fitness_coach" || nr === "athletic_director";

  const myUserId = Number((user as any)?.id ?? 0);
  const { data: rawDraftExercises = [] } = useQuery<{ id: number; title: string; trainingDay?: string | null; createdByUserId?: number | null }[]>({
    queryKey: ["/api/exercises/drafts"],
    queryFn: () => fetchJsonOrThrow<{ id: number; title: string; trainingDay?: string | null; createdByUserId?: number | null }[]>("/api/exercises/drafts"),
    enabled: isTrainingStaff,
  });
  const draftExercises = rawDraftExercises.filter((ex) => (ex.createdByUserId ?? null) === myUserId);

  const { data: seasons = [] } = useQuery<{ id: number; name: string; isActive: boolean }[]>({
    queryKey: ["/api/seasons"],
    queryFn: () => fetchJsonOrThrow<{ id: number; name: string; isActive: boolean }[]>("/api/seasons"),
  });

  const { data: boards = [] } = useQuery({
    queryKey: ["/api/boards"],
    queryFn: () => fetchJsonOrThrow<any[]>("/api/boards"),
  });

  const activeSeason = seasons.find(s => s.isActive) ?? seasons[seasons.length - 1] ?? null;
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const viewedSeason = seasons.find(s => s.id === (selectedSeasonId ?? activeSeason?.id)) ?? activeSeason;

  const now = new Date();
  const isTransitionWindow = now.getMonth() >= 6 && now.getMonth() <= 7;
  const canManageSeasons = nr === "admin" || nr === "secretary";

  const myTeams = isStaffViewer && user?.id && nr !== "technical_director"
    ? (allTeams ?? []).filter((team: any) =>
        Array.isArray(team.assignedStaff) &&
        team.assignedStaff.some((s: any) => s.userId === user.id)
      )
    : [];
  /** Direttore tecnico: panoramica su tutte le squadre del club (anche senza assegnazione personale). */
  const teamsForStaffUi = nr === "technical_director" ? (allTeams ?? []) : myTeams;

  const isClubWideTechnicalRole = nr === "technical_director" || nr === "director";

  const { data: trainingSessionsForDash = [] } = useQuery({
    queryKey: ["/api/training-sessions", clubIdNum, nr, "dashboard-tiles"],
    queryFn: () =>
      fetchJsonOrThrow<Array<{ status?: string; scheduledAt?: string }>>("/api/training-sessions"),
    enabled: Boolean(isClubWideTechnicalRole && user),
  });

  const dashboardTeamCount = useMemo(() => {
    const fromApi = stats?.totalTeams ?? 0;
    const n = allTeams?.length ?? 0;
    if (isClubWideTechnicalRole && n > fromApi) return n;
    return fromApi;
  }, [stats?.totalTeams, allTeams?.length, isClubWideTechnicalRole]);

  const dashboardPlayerCount = useMemo(() => {
    const fromApi = stats?.totalPlayers ?? 0;
    const n = allPlayers?.length ?? 0;
    if (isClubWideTechnicalRole && n > fromApi) return n;
    return fromApi;
  }, [stats?.totalPlayers, allPlayers?.length, isClubWideTechnicalRole]);

  const dashboardUpcomingCount = useMemo(() => {
    const fromApi = stats?.upcomingTrainingSessions ?? 0;
    if (!isClubWideTechnicalRole || trainingSessionsForDash.length === 0) return fromApi;
    const nowMs = Date.now();
    const n = trainingSessionsForDash.filter(
      (s) => s.status === "scheduled" && new Date(s.scheduledAt ?? 0).getTime() >= nowMs,
    ).length;
    return Math.max(fromApi, n);
  }, [stats?.upcomingTrainingSessions, trainingSessionsForDash, isClubWideTechnicalRole]);

  const [alertDismissed, setAlertDismissed] = useState(false);

  // --- Notifications state ---
  const [notifications, setNotifications] = useState<ClubNotification[]>([]);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifError, setNotifError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formType, setFormType] = useState("info");
  const [formSending, setFormSending] = useState(false);
  const [formError, setFormError] = useState("");

  const canSend = nr === "admin" || nr === "secretary" || nr === "technical_director";

  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true);
    setNotifError("");
    try {
      const [internalRes, platformRes] = await Promise.all([
        fetch(withApi("/api/club/notifications"), { credentials: "include" }),
        (canSend ? fetch(withApi("/api/club/platform-announcements"), { credentials: "include" }) : Promise.resolve(null)),
      ]);

      console.log("[dashboard] response GET /api/club/notifications ->", internalRes.status);
      if (platformRes) {
        console.log("[dashboard] response GET /api/club/platform-announcements ->", platformRes.status);
      }
      if (!internalRes.ok) {
        throw new Error(`Request failed (${internalRes.status}) for /api/club/notifications`);
      }

      const internal: ClubNotification[] = internalRes.ok
        ? (await internalRes.json()).map((n: any) => ({ ...n, source: "internal" as const }))
        : [];

      const platform: ClubNotification[] = (platformRes && platformRes.ok)
        ? (await platformRes.json()).map((n: any) => ({
            id: n.id,
            title: n.title,
            message: n.message,
            type: n.type === "critical" ? "urgent" : n.type,
            createdAt: n.sentAt,
            isRead: n.isRead,
            source: "platform" as const,
          }))
        : [];

      const merged = [...platform, ...internal].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setNotifications(merged);
      console.log("[dashboard] payload notifications:", merged);
    } catch (error) {
      console.error("[dashboard] notifications error:", error);
      setNotifications([]);
      setNotifError("Errore caricamento comunicazioni dal backend.");
    }
    setNotifLoading(false);
  }, [canSend]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markRead = async (id: number, source?: string) => {
    const url = source === "platform"
      ? `/api/club/platform-announcements/${id}/read`
      : `/api/club/notifications/${id}/read`;
    await fetch(withApi(url), { method: "PATCH", credentials: "include" });
    setNotifications(prev => prev.map(n => n.id === id && n.source === source ? { ...n, isRead: true } : n));
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.isRead);
    for (const n of unread) {
      const url = n.source === "platform"
        ? `/api/club/platform-announcements/${n.id}/read`
        : `/api/club/notifications/${n.id}/read`;
      await fetch(withApi(url), { method: "PATCH", credentials: "include" });
    }
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const sendNotification = async () => {
    if (!formTitle.trim() || !formMessage.trim()) { setFormError("Compila titolo e messaggio."); return; }
    setFormSending(true);
    setFormError("");
    try {
      const res = await fetch(withApi("/api/club/notifications"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: formTitle.trim(), message: formMessage.trim(), type: formType }),
      });
      if (!res.ok) { setFormError("Errore durante l'invio."); setFormSending(false); return; }
      setFormTitle(""); setFormMessage(""); setFormType("info"); setShowForm(false);
      await fetchNotifications();
    } catch { setFormError("Errore di rete."); }
    setFormSending(false);
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const showUnavailableAlert = !alertDismissed && (
    nr === "coach" || nr === "technical_director" || nr === "fitness_coach" ||
    nr === "admin" || nr === "athletic_director"
  );

  const unavailablePlayers = (allPlayers as any[] | undefined)?.filter(
    (p: any) => p.available === false
  ) ?? [];

  const chartDataEn = [
    { name: "Mon", sessions: 2 },
    { name: "Tue", sessions: 4 },
    { name: "Wed", sessions: 3 },
    { name: "Thu", sessions: 5 },
    { name: "Fri", sessions: 2 },
    { name: "Sat", sessions: 1 },
    { name: "Sun", sessions: 0 },
  ];
  const chartDataIt = [
    { name: "Lun", sessions: 2 },
    { name: "Mar", sessions: 4 },
    { name: "Mer", sessions: 3 },
    { name: "Gio", sessions: 5 },
    { name: "Ven", sessions: 2 },
    { name: "Sab", sessions: 1 },
    { name: "Dom", sessions: 0 },
  ];
  const chartData = language === "it" ? chartDataIt : chartDataEn;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-[400px] lg:col-span-2 rounded-xl" />
          <Skeleton className="h-[400px] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header + Season Banner */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">{t.dashboard}</h1>
          <p className="text-muted-foreground mt-1 text-lg">{t.overviewDesc}</p>
        </div>

        {/* Season indicator */}
        <div className="flex flex-col items-start sm:items-end gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-sm text-muted-foreground font-medium whitespace-nowrap">Stagione sportiva:</span>
            {canManageSeasons && seasons.length > 1 ? (
              <Select
                value={String(selectedSeasonId ?? activeSeason?.id ?? "")}
                onValueChange={v => setSelectedSeasonId(Number(v))}
              >
                <SelectTrigger className="h-7 text-sm font-semibold border-primary/30 bg-primary/5 hover:bg-primary/10 min-w-[110px]">
                  <SelectValue placeholder="Seleziona..." />
                </SelectTrigger>
                <SelectContent>
                  {seasons.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}{s.isActive ? " ★" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-sm font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                {viewedSeason?.name ?? "—"}
              </span>
            )}
          </div>
          {canManageSeasons && (
            <Link href="/season-transition" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
              <RefreshCw className="w-3 h-3" />
              Transizione stagionale
            </Link>
          )}
        </div>
      </div>

{/* QUICK ACTIONS — Lavagna/Esercitazione solo staff tecnico; Pianifica settimana fuori card solo non-segreteria */}
<div
  className={cn(
    "grid grid-cols-1 gap-3",
    canQuickCreateTrainingTools ? "sm:grid-cols-3" : "sm:grid-cols-1 max-w-md",
  )}
>
  {canQuickCreateTrainingTools && (
    <>
      <Link href="/tactical-board">
        <Button className="w-full h-12 text-sm font-semibold">
          ➕ Nuova Lavagna
        </Button>
      </Link>
      <Link href="/exercises">
        <Button variant="secondary" className="w-full h-12 text-sm font-semibold">
          ➕ Nuova Esercitazione
        </Button>
      </Link>
    </>
  )}
  {nr !== "secretary" && (
    <Link href="/training">
      <Button variant="outline" className="w-full h-12 text-sm font-semibold">
        📅 Pianifica Settimana
      </Button>
    </Link>
  )}
</div>

      {showSecretaryFilesCard && (
        <Card className="shadow-md border-border/50 border-emerald-500/20 bg-emerald-500/[0.03]">
          <CardHeader className="pb-2 border-b border-emerald-500/10">
            <div className="flex items-center gap-2">
              <FileUp className="w-5 h-5 text-emerald-600" />
              <CardTitle className="text-base font-display">File per pianificazione e calendari</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Carica PDF o Excel come riferimento per il club (salvati sul server, visibili da chi accede con le stesse credenziali). Per consultare gli impegni usa il pulsante Pianifica Settimana in questa card.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <div className="flex flex-wrap gap-2">
              <Link href="/training">
                <Button type="button" variant="outline" size="sm" className="gap-2">
                  <CalendarDays className="w-4 h-4" />
                  Pianifica Settimana
                </Button>
              </Link>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={uploadSecretaryFileMutation.isPending}
                onClick={() => {
                  const el = document.getElementById("secretary-file-input");
                  el?.click();
                }}
              >
                <FileUp className="w-4 h-4" />
                Carica file
              </Button>
              <input
                id="secretary-file-input"
                type="file"
                className="hidden"
                accept=".pdf,.xlsx,.xls,.csv,application/pdf"
                onChange={async (e) => {
                  const input = e.target;
                  const file = input.files?.[0];
                  input.value = "";
                  if (!file || clubIdNum <= 0) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const dataBase64 = typeof reader.result === "string" ? reader.result : "";
                    if (!dataBase64) return;
                    uploadSecretaryFileMutation.mutate({
                      fileName: file.name,
                      mimeType: file.type || "application/octet-stream",
                      dataBase64,
                    });
                  };
                  reader.readAsDataURL(file);
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-2"
                disabled={secretaryFiles.length === 0 || uploadSecretaryFileMutation.isPending}
                onClick={async () => {
                  try {
                    const bundle = await fetchJsonOrThrow<
                      { id: number; name: string; mimeType: string; createdAt: string; dataUrl: string }[]
                    >("/api/secretary/club-files/export-bundle");
                    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `ftb-file-condivisione-club-${clubIdNum}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch {
                    /* toast optional */
                  }
                }}
              >
                <Download className="w-4 h-4" />
                Esporta elenco
              </Button>
            </div>
            {secretaryFiles.length > 0 ? (
              <ul className="divide-y rounded-lg border text-sm">
                {secretaryFiles.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <button
                      type="button"
                      className="text-primary hover:underline truncate min-w-0 text-left"
                      onClick={() => void secretaryDownloadFile(f.id, f.originalFilename)}
                    >
                      {f.originalFilename}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      disabled={deleteSecretaryFileMutation.isPending}
                      onClick={() => deleteSecretaryFileMutation.mutate(f.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      )}

<div>
  <h2 className="text-lg font-semibold mb-3">Ultime Lavagne</h2>

  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
    {boards.map((board: any) => (
      <Link key={board.id} href="/tactical-board">
        <div className="p-4 rounded-xl border bg-card hover:shadow-md cursor-pointer transition">
          <p className="font-semibold text-sm">{board.title}</p>
          <p className="text-xs text-muted-foreground">Apri lavagna</p>
        </div>
      </Link>
    ))}
  </div>
</div>
      {/* Transition window CTA */}
      {isTransitionWindow && canManageSeasons && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 dark:bg-blue-950/30 dark:border-blue-800 flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0">
            <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 dark:text-blue-200 text-sm">Periodo di transizione stagionale</h3>
            <p className="text-blue-700 dark:text-blue-300 text-xs mt-0.5 mb-2">
              Siamo nel periodo di transizione (luglio–agosto). Conferma, trasferisci o promuovi i giocatori per la prossima stagione.
            </p>
            <Link href="/season-transition">
              <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-100 h-7 text-xs gap-1.5">
                <ArrowRight className="w-3.5 h-3.5" />
                Vai alla transizione stagionale
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Unavailable Players Alert */}
      {showUnavailableAlert && unavailablePlayers.length > 0 && (
        <div className="relative bg-amber-50 border border-amber-200 rounded-xl p-4 dark:bg-amber-950/30 dark:border-amber-800 animate-in fade-in slide-in-from-top-2 duration-300">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-7 w-7 text-amber-600 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-400"
            onClick={() => setAlertDismissed(true)}
          >
            <X className="w-4 h-4" />
          </Button>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 pr-8">
              <h3 className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
                {t.unavailablePlayers} ({unavailablePlayers.length})
              </h3>
              <p className="text-amber-700 dark:text-amber-300 text-xs mt-0.5 mb-3">
                {t.unavailablePlayersAlert}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {unavailablePlayers.map((p: any) => (
                  <div
                    key={p.id}
                    className="bg-white dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-xs"
                  >
                    <div className="font-semibold text-amber-900 dark:text-amber-200">
                      {p.firstName} {p.lastName}
                    </div>
                    {p.teamName && (
                      <div className="text-amber-600 dark:text-amber-400 text-[11px]">{p.teamName}</div>
                    )}
                    <div className="flex flex-wrap gap-x-3 mt-1 text-amber-700 dark:text-amber-300">
                      {p.unavailabilityReason && (
                        <span>⚠ {reasonLabel(p.unavailabilityReason, t)}</span>
                      )}
                      {p.expectedReturn && (
                        <span>📅 {p.expectedReturn}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <Button size="sm" variant="outline" asChild className="text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900/30 text-xs h-7">
                  <Link href="/players">{t.players} →</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Draft Exercises Banner — coach/fitness_coach/athletic_director */}
      {isTrainingStaff && draftExercises.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 dark:bg-amber-950/30 dark:border-amber-700 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center flex-shrink-0">
              <span className="text-base">✏️</span>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
                {draftExercises.length === 1 ? "1 bozza allenamento da completare" : `${draftExercises.length} bozze allenamento da completare`}
              </h3>
              <p className="text-amber-700 dark:text-amber-300 text-xs mt-0.5 mb-2">
                {draftExercises.length === 1 ? "C'è un'esercitazione in bozza che richiede la tua attenzione." : "Ci sono esercitazioni in bozza che richiedono la tua attenzione."}
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {draftExercises.slice(0, 4).map(ex => (
                  <span key={ex.id} className="inline-flex items-center gap-1.5 text-xs bg-white dark:bg-amber-900/40 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-200 rounded-full px-2.5 py-0.5 font-medium">
                    {ex.title}
                    {ex.trainingDay && <span className="text-amber-500 dark:text-amber-400 text-[10px]">· {new Date(ex.trainingDay).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}</span>}
                  </span>
                ))}
                {draftExercises.length > 4 && <span className="text-xs text-amber-600">+{draftExercises.length - 4} altri</span>}
              </div>
              <Link href="/exercises">
                <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900/30 h-7 text-xs gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5" />
                  Vai alla libreria esercizi
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Panel */}
      <Card className="shadow-md border-border/50">
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="relative">
                {unreadCount > 0
                  ? <BellRing className="w-5 h-5 text-primary animate-bounce" />
                  : <Bell className="w-5 h-5 text-muted-foreground" />
                }
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              <CardTitle className="text-base font-display">Comunicazioni Interne</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="text-xs h-7 gap-1 text-muted-foreground" onClick={markAllRead}>
                  <CheckCheck className="w-3.5 h-3.5" />
                  Segna tutte lette
                </Button>
              )}
              {canSend && (
                <Button size="sm" className="text-xs h-7 gap-1" onClick={() => setShowForm(v => !v)}>
                  <Plus className="w-3.5 h-3.5" />
                  Nuova notifica
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Send form (admin/secretary only) */}
        {showForm && canSend && (
          <div className="px-4 pt-4 pb-2 border-b bg-muted/30">
            <div className="space-y-3 max-w-2xl">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Titolo *</Label>
                  <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Es: Allenamento annullato" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Select value={formType} onValueChange={setFormType}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warning">Avviso</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Messaggio *</Label>
                <Textarea value={formMessage} onChange={e => setFormMessage(e.target.value)} placeholder="Scrivi il messaggio per tutto lo staff..." rows={2} className="text-sm resize-none" />
              </div>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowForm(false); setFormError(""); }}>Annulla</Button>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={sendNotification} disabled={formSending}>
                  <Send className="w-3 h-3" />
                  {formSending ? "Invio..." : "Invia"}
                </Button>
              </div>
            </div>
          </div>
        )}

        <CardContent className="p-0">
          {notifError && (
            <div className="p-4 text-sm text-red-600 border-b border-red-200 bg-red-50 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800">
              {notifError}
            </div>
          )}
          {notifLoading ? (
            <div className="p-6 space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center">
              <Bell className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm">Nessuna comunicazione al momento.</p>
            </div>
          ) : (
            <div className="divide-y max-h-[340px] overflow-y-auto">
              {notifications.map(n => {
                const s = typeStyle(n.type);
                return (
                  <div
                    key={n.id}
                    className={cn("flex items-start gap-3 px-4 py-3 transition-colors", n.isRead ? "opacity-60" : "")}
                  >
                    <div className={cn("w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border", s.bg)}>
                      {s.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", s.badge)}>
                          {n.type === "urgent" ? "Urgente" : n.type === "warning" ? "Avviso" : "Info"}
                        </span>
                        {n.source === "platform" && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                            Piattaforma FTB
                          </span>
                        )}
                        <span className="font-semibold text-sm leading-tight">{n.title}</span>
                        {!n.isRead && (
                          <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" title="Non letta" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {format(new Date(n.createdAt), "d MMM yyyy • HH:mm", { locale: itLocale })}
                      </p>
                    </div>
                    {!n.isRead && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-primary"
                        title="Segna come letta"
                        onClick={() => markRead(n.id, n.source)}
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title={t.totalTeams} value={dashboardTeamCount} icon={UsersRound} link="/teams" />
        <StatCard title={t.activePlayers} value={dashboardPlayerCount} icon={Users} link="/players" />
        <StatCard title={t.upcomingSessions} value={dashboardUpcomingCount} icon={CalendarDays} link="/training" />
        <StatCard title={t.staffMembers} value={stats?.totalMembers || 0} icon={ShieldCheck} link="/members" />
      </div>

      {/* ── Calendari Partite (stessa vista per segreteria, DT, presidenza, DG, admin) ── */}
      {(nr === "admin" ||
        nr === "director" ||
        nr === "secretary" ||
        nr === "presidente" ||
        nr === "technical_director") && (
        <Card className="shadow-md border-border/50">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary" />
                <CardTitle className="text-base font-display">Calendari Partite</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            {(() => {
              const teams = (allTeams ?? []) as any[];
              if (teams.length === 0) {
                return (
                  <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                    <Trophy className="w-10 h-10 mb-3 opacity-20" />
                    <p className="text-sm">Nessuna squadra nel club o calendario non ancora impostato.</p>
                  </div>
                );
              }
              const sectionMeta = [
                {
                  key: "scuola_calcio",
                  label: "Scuola Calcio",
                  color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
                },
                {
                  key: "settore_giovanile",
                  label: "Settore Giovanile",
                  color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
                },
                {
                  key: "prima_squadra",
                  label: "Prima Squadra",
                  color: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
                },
              ] as const;
              const usedIds = new Set<number>();
              return (
                <div className="space-y-5">
                  {sectionMeta.map((section) => {
                    const sectionTeams = teams.filter((t: any) => t.clubSection === section.key);
                    sectionTeams.forEach((t: any) => usedIds.add(t.id));
                    if (sectionTeams.length === 0) return null;
                    return (
                      <div key={section.key}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{section.label}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                          {sectionTeams.map((team: any) => (
                            <Link key={team.id} href={`/calendari/${team.id}`}>
                              <div className="group flex flex-col gap-1.5 p-3 rounded-xl border bg-card hover:shadow-md hover:border-primary/40 transition-all cursor-pointer">
                                <div className="flex items-center justify-between">
                                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0 group-hover:bg-primary/20 transition-colors">
                                    {(team.name as string).substring(0, 2).toUpperCase()}
                                  </div>
                                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <p className="text-xs font-semibold leading-tight line-clamp-2">{team.name}</p>
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full self-start ${section.color}`}>
                                  {section.label}
                                </span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {(() => {
                    const rest = teams.filter((t: any) => !usedIds.has(t.id));
                    if (rest.length === 0) return null;
                    return (
                      <div key="altre">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Altre squadre</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                          {rest.map((team: any) => (
                            <Link key={team.id} href={`/calendari/${team.id}`}>
                              <div className="group flex flex-col gap-1.5 p-3 rounded-xl border bg-card hover:shadow-md hover:border-primary/40 transition-all cursor-pointer">
                                <div className="flex items-center justify-between">
                                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0 group-hover:bg-primary/20 transition-colors">
                                    {(team.name as string).substring(0, 2).toUpperCase()}
                                  </div>
                                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <p className="text-xs font-semibold leading-tight line-clamp-2">{team.name}</p>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Calendari per coach / preparatori (il DT usa la card "Calendari Partite" sopra, evita duplicato) */}
      {isStaffViewer && teamsForStaffUi.length > 0 && nr !== "technical_director" && (
        <Card className="shadow-md border-border/50">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              <CardTitle className="text-base font-display">
                {nr === "technical_director" ? "Calendari partite (squadre club)" : "I miei Calendari Partite"}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {teamsForStaffUi.map((team: any) => (
                <Link key={team.id} href={`/calendari/${team.id}`}>
                  <div className="group flex items-center gap-3 p-4 rounded-xl border bg-card hover:shadow-md hover:border-primary/40 transition-all cursor-pointer">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0 group-hover:bg-primary/20 transition-colors">
                      {(team.name as string).substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{team.name}</p>
                      <p className="text-xs text-muted-foreground">Clicca per vedere le partite</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Training schedule for coaches, technical directors, fitness coaches */}
      {isStaffViewer && (
        <Card className="shadow-md border-border/50">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              <CardTitle className="text-base font-display">
                {nr === "technical_director" ? "Orari di allenamento (squadre area)" : "I miei orari di allenamento"}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {teamsForStaffUi.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                <Clock className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm">
                  {nr === "technical_director"
                    ? "Nessuna squadra nell'area o orari non ancora impostati."
                    : "Nessuna squadra assegnata o orari non ancora impostati."}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {teamsForStaffUi.map((team: any) => {
                  const slots: TrainingSlot[] = team.trainingSchedule ?? [];
                  return (
                    <div key={team.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-center gap-3 min-w-[180px]">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                          {team.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-sm leading-tight">{team.name}</p>
                          {team.category && (
                            <p className="text-xs text-muted-foreground">{team.category}{team.ageGroup ? ` · ${team.ageGroup}` : ""}</p>
                          )}
                        </div>
                      </div>
                      {slots.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 flex-1">
                          {slots.map((slot, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/8 border border-primary/15 text-xs font-medium">
                              <span className="text-foreground">{slot.day}</span>
                              <span className="text-muted-foreground">{slot.startTime}–{slot.endTime}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic flex-1">Orari non ancora impostati</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {nr !== "secretary" && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-md border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xl font-display">{t.activityOverview}</CardTitle>
            <Activity className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    dx={-10}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))' }}
                  />
                  <Bar
                    dataKey="sessions"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    barSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-md border-border/50 flex flex-col">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-display">{t.recentSessions}</CardTitle>
              <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-primary">
                <Link href="/training">{t.viewAll}</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            {stats?.recentTrainingSessions?.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center h-full">
                <CalendarDays className="w-10 h-10 mb-3 opacity-20" />
                <p>{t.noRecentSessions}</p>
              </div>
            ) : (
              <div className="divide-y">
                {stats?.recentTrainingSessions?.map((session) => (
                  <div key={session.id} className="p-4 hover:bg-muted/50 transition-colors flex items-center justify-between group">
                    <div className="space-y-1">
                      <p className="font-semibold leading-none">{session.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(session.scheduledAt), "d MMM yyyy • HH:mm", { locale: language === "it" ? itLocale : undefined })}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity" asChild>
                      <Link href={`/training/${session.id}`}><ArrowRight className="w-4 h-4" /></Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, link }: { title: string, value: number, icon: any, link: string }) {
  return (
    <Card className="shadow-md border-border/50 hover:shadow-lg transition-shadow group relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
        <Icon className="w-24 h-24" />
      </div>
      <CardContent className="p-6 relative z-10 flex flex-col h-full justify-between">
        <div className="flex items-center justify-between space-y-0 pb-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
        <div className="mt-4">
          <div className="text-4xl font-display font-bold">{value}</div>
        </div>
        <Link href={link} className="absolute inset-0 z-20">
          <span className="sr-only">{title}</span>
        </Link>
      </CardContent>
    </Card>
  );
}
