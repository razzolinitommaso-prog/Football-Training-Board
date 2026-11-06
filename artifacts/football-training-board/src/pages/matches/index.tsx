import {defaultRotationCapacity} from "@workspace/api-zod";
import {matchPreparation} from "@/lib/match-presentation";
import {upcomingFirst, isUpcomingMatch} from "@/lib/match-presentation";
import { CompactMatchHeading, CompactMatchDetails } from "@/components/calendar/CompactMatch";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trophy, Trash2, Users, Calendar, MapPin, AlertTriangle, CheckCircle } from "lucide-react";
import { withApi } from "@/lib/api-base";
import { useAuth } from "@/hooks/use-auth";

interface Match {
  id: number; opponent: string; date: string; competition?: string; location?: string;
  homeAway: string; matchPlan?: unknown; result?: string; teamName?: string; teamId?: number;
}
interface Player { id: number; firstName: string; lastName: string; position?: string; available?: boolean; unavailabilityReason?: string | null; }
interface Team { id: number; name: string; category?: string; clubSection?: string; }
interface CallUp { id: number; playerId: number; playerName?: string; status: string; }

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(withApi(url), { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

function normalizeTime24(value: string): string | null {
  const clean = value.trim();
  const m = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function combineDateAndTimeToIso(dateValue: string, timeValue: string): string | null {
  if (!dateValue) return null;
  const normalized = normalizeTime24(timeValue);
  if (!normalized) return null;
  const parsed = new Date(`${dateValue}T${normalized}:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = { pending: "secondary", confirmed: "default", declined: "destructive" };
  return <Badge variant={(colors[status] ?? "secondary") as "default" | "secondary" | "destructive" | "outline"}>{status}</Badge>;
}

export default function MatchesPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { role, section } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [callUpMatchId, setCallUpMatchId] = useState<number | null>(null);
  const [opponent, setOpponent] = useState(""); const [matchDate, setMatchDate] = useState(""); const [matchTime, setMatchTime] = useState("");
  const [competition, setCompetition] = useState(""); const [location, setLocation] = useState("");
  const [homeAway, setHomeAway] = useState("home"); const [teamId, setTeamId] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [resultDrafts, setResultDrafts] = useState<Record<number, string>>({});
  const canCreateDeleteMatches = ["admin", "presidente", "director", "secretary"].includes(role ?? "");

  const { data: matches = [], isLoading } = useQuery<Match[]>({ queryKey: ["/api/matches"], queryFn: () => apiFetch("/api/matches") });
  const { data: teams = [] } = useQuery<Team[]>({ queryKey: ["/api/teams"], queryFn: () => apiFetch("/api/teams") });
  const { data: players = [] } = useQuery<Player[]>({ queryKey: ["/api/players"], queryFn: () => apiFetch("/api/players") });
  const { data: callUps = [] } = useQuery<CallUp[]>({
    queryKey: ["/api/matches", callUpMatchId, "callups"],
    queryFn: () => apiFetch(`/api/matches/${callUpMatchId}/callups`),
    enabled: !!callUpMatchId,
  });

  const createMatch = useMutation({
    mutationFn: (d: object) => apiFetch("/api/matches", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/matches"] }); setOpen(false); resetForm(); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const deleteMatch = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/matches/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/matches"] }),
  });

  const patchResult = useMutation({
    mutationFn: ({ id, result }: { id: number; result: string | null }) => apiFetch(`/api/matches/${id}`, { method: "PATCH", body: JSON.stringify({ result }) }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/matches"] });
      setResultDrafts((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
      toast({ title: "Risultato salvato" });
    },
    onError: (err: any) => toast({ title: err?.message ?? "Errore salvataggio risultato", variant: "destructive" }),
  });

  const addCallUp = useMutation({
    mutationFn: ({ matchId, playerId }: { matchId: number; playerId: number }) =>
      apiFetch(`/api/matches/${matchId}/callups`, { method: "POST", body: JSON.stringify({ playerId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/matches", callUpMatchId, "callups"] }),
  });

  const patchCallUp = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiFetch(`/api/callups/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/matches", callUpMatchId, "callups"] }),
  });

  const deleteCallUp = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/callups/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/matches", callUpMatchId, "callups"] }),
  });

  function resetForm() { setOpponent(""); setMatchDate(""); setMatchTime(""); setCompetition(""); setLocation(""); setHomeAway("home"); setTeamId(""); }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const dateIso = combineDateAndTimeToIso(matchDate, matchTime);
    if (!dateIso) {
      toast({
        title: "Formato orario non valido",
        description: "Usa il formato 24h HH:mm (es. 10:00).",
        variant: "destructive",
      });
      return;
    }
    createMatch.mutate({ opponent, date: dateIso, competition: competition || null, location: location || null, homeAway, teamId: teamId ? Number(teamId) : null });
  }

  const activeMatch = matches.find(m => m.id === callUpMatchId);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Trophy className="w-6 h-6 text-primary" />{t.matches}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.matchesDesc}</p>
        </div>
        {canCreateDeleteMatches ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />{t.addMatch}</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{t.createMatch}</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2"><Label>{t.opponent}</Label><Input value={opponent} onChange={e => setOpponent(e.target.value)} required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>{t.matchDate}</Label><Input type="date" value={matchDate} onChange={e => setMatchDate(e.target.value)} required /></div>
                <div className="space-y-2">
                  <Label>Orario (24h)</Label>
                  <Input type="text" value={matchTime} onChange={e => setMatchTime(e.target.value)} placeholder="HH:mm" inputMode="numeric" pattern="^([01]\\d|2[0-3]):([0-5]\\d)$" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>{t.competition}</Label><Input value={competition} onChange={e => setCompetition(e.target.value)} /></div>
                <div className="space-y-2"><Label>{t.location}</Label><Input value={location} onChange={e => setLocation(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.homeAway}</Label>
                  <Select value={homeAway} onValueChange={setHomeAway}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="home">{t.home}</SelectItem><SelectItem value="away">{t.away}</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t.team}</Label>
                  <Select value={teamId} onValueChange={setTeamId}><SelectTrigger><SelectValue placeholder={t.selectTeam} /></SelectTrigger>
                    <SelectContent>{teams.map(tm => <SelectItem key={tm.id} value={String(tm.id)}>{tm.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t.cancel}</Button>
                <Button type="submit" disabled={createMatch.isPending}>{t.save}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        ) : null}
      </div>

      {isLoading ? <div className="text-center py-12 text-muted-foreground">{t.loading}</div>
        : matches.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">{t.noMatches}</CardContent></Card>
        : (
          <div className="grid gap-4">
            {upcomingFirst(matches).map((m, index) => (
              <Card key={m.id} className="compact-match-card">
                <CompactMatchHeading preparationStatus={matchPreparation(m.matchPlan,defaultRotationCapacity(teams.find(team=>team.id===m.teamId)?.name??m.teamName,teams.find(team=>team.id===m.teamId)?.category,teams.find(team=>team.id===m.teamId)?.clubSection??section))} nextMatch={index === 0 && isUpcomingMatch(m)} date={m.date} home={m.teamName ? (m.homeAway === "home" ? m.teamName : m.opponent) : undefined} away={m.teamName && m.homeAway !== "home" ? m.teamName : m.opponent} result={m.result}
                  metadata={<><span className="match-location-tag rounded border">{m.homeAway === "home" ? t.home : t.away}</span>{m.competition&&<span><Trophy/>{m.competition}</span>}{m.location&&<span><MapPin/>{m.location}</span>}</>}
                  actions={<div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setCallUpMatchId(m.id)}>
                        <Users className="w-3 h-3 mr-1" />{t.callUps}
                      </Button>
                      {canCreateDeleteMatches ? (
                        <Button size="icon" variant="ghost" className="text-destructive h-8 w-8" onClick={() => { if (confirm(t.deleteMatch)) deleteMatch.mutate(m.id); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      ) : null}
                    </div>}/>
                <CompactMatchDetails label="Risultato e dettagli">
                <CardContent className="space-y-1 p-0">
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Input
                      className="w-32 h-8 text-sm"
                      placeholder="2-1"
                      value={resultDrafts[m.id] ?? m.result ?? ""}
                      onChange={(e) => setResultDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                      disabled={patchResult.isPending}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={patchResult.isPending || (resultDrafts[m.id] ?? m.result ?? "").trim() === (m.result ?? "").trim()}
                      onClick={() => {
                        const value = (resultDrafts[m.id] ?? m.result ?? "").trim();
                        patchResult.mutate({ id: m.id, result: value || null });
                      }}
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Salva risultato
                    </Button>
                    <span className="text-xs text-muted-foreground">{t.result}</span>
                  </div>
                </CardContent>
                </CompactMatchDetails>
              </Card>
            ))}
          </div>
        )}

      <Dialog open={!!callUpMatchId} onOpenChange={(o) => !o && setCallUpMatchId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t.manageCallUps} — vs {activeMatch?.opponent}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Select value={selectedPlayer} onValueChange={setSelectedPlayer}>
                <SelectTrigger className="flex-1"><SelectValue placeholder={t.addCallUp} /></SelectTrigger>
                <SelectContent>
                  {players.filter(p => p.available !== false).map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.firstName} {p.lastName}</SelectItem>
                  ))}
                  {players.filter(p => p.available === false).length > 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground border-t mt-1 pt-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                      {t.notAvailable} — {t.cannotCallUpUnavailable}
                    </div>
                  )}
                </SelectContent>
              </Select>
              <Button onClick={() => { if (selectedPlayer && callUpMatchId) { addCallUp.mutate({ matchId: callUpMatchId, playerId: Number(selectedPlayer) }); setSelectedPlayer(""); } }}>{t.addCallUp}</Button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {callUps.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">{t.noPlayers}</p>
                : callUps.map(cu => (
                  <div key={cu.id} className="flex items-center justify-between p-2 rounded-lg border bg-muted/40">
                    <span className="text-sm font-medium">{cu.playerName}</span>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={cu.status} />
                      <Select value={cu.status} onValueChange={(v) => patchCallUp.mutate({ id: cu.id, status: v })}>
                        <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">{t.pending}</SelectItem>
                          <SelectItem value="confirmed">{t.confirmed}</SelectItem>
                          <SelectItem value="declined">{t.declined}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteCallUp.mutate(cu.id)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
