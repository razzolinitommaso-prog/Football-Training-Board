import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarCheck, Users, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface TrainingSession { id: number; scheduledAt: string; title?: string; teamName?: string; }
interface Player { id: number; firstName: string; lastName: string; }
interface AttendanceRecord { id: number; playerId: number; playerName?: string; status: string; }

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

const statusIcons = { present: CheckCircle2, absent: XCircle, injured: AlertCircle };
const statusColors = { present: "text-green-600", absent: "text-red-500", injured: "text-amber-500" };

export default function AttendancePage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState<number | null>(null);

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
    if (!sessionId) return;
    markAttendance.mutate({ trainingSessionId: sessionId, playerId, status });
  }

  const presentCount = attendance.filter(a => a.status === "present").length;
  const absentCount = attendance.filter(a => a.status === "absent").length;
  const injuredCount = attendance.filter(a => a.status === "injured").length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarCheck className="w-6 h-6 text-primary" />{t.trainingAttendance}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.attendanceDesc}</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <Label>{t.trainingSessions}</Label>
            <Select value={sessionId ? String(sessionId) : ""} onValueChange={(v) => setSessionId(Number(v))}>
              <SelectTrigger><SelectValue placeholder={t.selectSession ?? "Select session..."} /></SelectTrigger>
              <SelectContent>
                {sessions.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {new Date(s.scheduledAt).toLocaleDateString()} {s.title ? `— ${s.title}` : ""} {s.teamName ? `(${s.teamName})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {sessionId && (
        <>
          {attendance.length > 0 && (
            <div className="flex gap-4">
              <Badge variant="default" className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{presentCount} {t.present}</Badge>
              <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="w-3 h-3" />{absentCount} {t.absent}</Badge>
              <Badge variant="secondary" className="flex items-center gap-1"><AlertCircle className="w-3 h-3" />{injuredCount} {t.injured}</Badge>
            </div>
          )}

          {attLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t.loading}</div>
          ) : (
            <div className="grid gap-2">
              {players.map((player) => {
                const status = getPlayerStatus(player.id);
                const Icon = status ? statusIcons[status as keyof typeof statusIcons] : Users;
                return (
                  <Card key={player.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Icon className={`w-5 h-5 ${status ? statusColors[status as keyof typeof statusColors] : "text-muted-foreground"}`} />
                        <span className="font-medium">{player.firstName} {player.lastName}</span>
                      </div>
                      <div className="flex gap-2">
                        {(["present", "absent", "injured"] as const).map(s => (
                          <Button key={s} size="sm" variant={status === s ? "default" : "outline"}
                            className={status === s && s === "absent" ? "bg-red-500 hover:bg-red-600 border-red-500" : status === s && s === "injured" ? "bg-amber-500 hover:bg-amber-600 border-amber-500" : ""}
                            onClick={() => handleStatusChange(player.id, s)}>
                            {t[s as keyof typeof t] as string}
                          </Button>
                        ))}
                      </div>
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
