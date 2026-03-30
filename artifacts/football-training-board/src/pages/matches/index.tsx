import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trophy, Trash2, Users, Calendar, MapPin, AlertTriangle } from "lucide-react";

interface Match {
  id: number; opponent: string; date: string; competition?: string; location?: string;
  homeAway: string; result?: string; teamName?: string; teamId?: number;
}
interface Player { id: number; firstName: string; lastName: string; position?: string; available?: boolean; unavailabilityReason?: string | null; }
interface Team { id: number; name: string; }
interface CallUp { id: number; playerId: number; playerName?: string; status: string; }

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = { pending: "secondary", confirmed: "default", declined: "destructive" };
  return <Badge variant={(colors[status] ?? "secondary") as "default" | "secondary" | "destructive" | "outline"}>{status}</Badge>;
}

export default function MatchesPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [callUpMatchId, setCallUpMatchId] = useState<number | null>(null);
  const [opponent, setOpponent] = useState(""); const [matchDate, setMatchDate] = useState("");
  const [competition, setCompetition] = useState(""); const [location, setLocation] = useState("");
  const [homeAway, setHomeAway] = useState("home"); const [teamId, setTeamId] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState("");

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
    mutationFn: ({ id, result }: { id: number; result: string }) => apiFetch(`/api/matches/${id}`, { method: "PATCH", body: JSON.stringify({ result }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/matches"] }),
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

  function resetForm() { setOpponent(""); setMatchDate(""); setCompetition(""); setLocation(""); setHomeAway("home"); setTeamId(""); }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMatch.mutate({ opponent, date: matchDate, competition: competition || null, location: location || null, homeAway, teamId: teamId ? Number(teamId) : null });
  }

  const activeMatch = matches.find(m => m.id === callUpMatchId);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Trophy className="w-6 h-6 text-primary" />{t.matches}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.matchesDesc}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />{t.addMatch}</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{t.createMatch}</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2"><Label>{t.opponent}</Label><Input value={opponent} onChange={e => setOpponent(e.target.value)} required /></div>
              <div className="space-y-2"><Label>{t.matchDate}</Label><Input type="datetime-local" value={matchDate} onChange={e => setMatchDate(e.target.value)} required /></div>
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
      </div>

      {isLoading ? <div className="text-center py-12 text-muted-foreground">{t.loading}</div>
        : matches.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">{t.noMatches}</CardContent></Card>
        : (
          <div className="grid gap-4">
            {matches.map((m) => (
              <Card key={m.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-primary" />
                      <span>vs {m.opponent}</span>
                      <Badge variant={m.homeAway === "home" ? "default" : "secondary"}>{m.homeAway === "home" ? t.home : t.away}</Badge>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setCallUpMatchId(m.id)}>
                        <Users className="w-3 h-3 mr-1" />{t.callUps}
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive h-8 w-8" onClick={() => { if (confirm(t.deleteMatch)) deleteMatch.mutate(m.id); }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(m.date).toLocaleString()}</span>
                    {m.teamName && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{m.teamName}</span>}
                    {m.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{m.location}</span>}
                    {m.competition && <Badge variant="outline">{m.competition}</Badge>}
                  </div>
                  {m.result && <p className="text-sm font-semibold mt-2">{t.result}: {m.result}</p>}
                  {!m.result && (
                    <div className="flex items-center gap-2 mt-2">
                      <Input className="w-32 h-7 text-sm" placeholder="2-1" onBlur={(e) => { if (e.target.value) patchResult.mutate({ id: m.id, result: e.target.value }); }} />
                      <span className="text-xs text-muted-foreground">{t.result}</span>
                    </div>
                  )}
                </CardContent>
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
