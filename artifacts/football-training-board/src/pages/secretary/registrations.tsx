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
import { ClipboardList, Plus, Trash2 } from "lucide-react";

interface Registration { id: number; playerId: number; playerName?: string; status: string; registrationDate?: string; seasonId?: number; notes?: string; }
interface Player { id: number; firstName: string; lastName: string; }
interface Season { id: number; name: string; }

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  approved: "default", pending: "secondary", rejected: "destructive",
};

export default function RegistrationsPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [playerId, setPlayerId] = useState(""); const [seasonId, setSeasonId] = useState("");
  const [status, setStatus] = useState("pending"); const [regDate, setRegDate] = useState("");

  const { data: registrations = [], isLoading } = useQuery<Registration[]>({ queryKey: ["/api/registrations"], queryFn: () => apiFetch("/api/registrations") });
  const { data: players = [] } = useQuery<Player[]>({ queryKey: ["/api/players"], queryFn: () => apiFetch("/api/players") });
  const { data: seasons = [] } = useQuery<Season[]>({ queryKey: ["/api/seasons"], queryFn: () => apiFetch("/api/seasons") });

  const create = useMutation({
    mutationFn: (d: object) => apiFetch("/api/registrations", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/registrations"] }); setOpen(false); setPlayerId(""); setSeasonId(""); setStatus("pending"); setRegDate(""); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const patch = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiFetch(`/api/registrations/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/registrations"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/registrations/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/registrations"] }),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardList className="w-6 h-6 text-primary" />{t.registrations}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.registrationsDesc}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />{t.addRegistration}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t.addRegistration}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); create.mutate({ playerId: Number(playerId), seasonId: seasonId ? Number(seasonId) : null, status, registrationDate: regDate || null }); }} className="space-y-4">
              <div className="space-y-2">
                <Label>{t.player}</Label>
                <Select value={playerId} onValueChange={setPlayerId} required>
                  <SelectTrigger><SelectValue placeholder={t.selectPlayer ?? "Select player"} /></SelectTrigger>
                  <SelectContent>{players.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.firstName} {p.lastName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t.seasons}</Label>
                <Select value={seasonId} onValueChange={setSeasonId}>
                  <SelectTrigger><SelectValue placeholder={t.seasons} /></SelectTrigger>
                  <SelectContent>{seasons.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.registrationStatus}</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">{t.regPending}</SelectItem>
                      <SelectItem value="approved">{t.regApproved}</SelectItem>
                      <SelectItem value="rejected">{t.regRejected}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>{t.registrationDate}</Label><Input type="date" value={regDate} onChange={e => setRegDate(e.target.value)} /></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t.cancel}</Button>
                <Button type="submit" disabled={!playerId || create.isPending}>{t.save}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <div className="text-center py-12 text-muted-foreground">{t.loading}</div>
        : registrations.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">{t.noRegistrations}</CardContent></Card>
        : (
          <div className="grid gap-3">
            {registrations.map((r) => (
              <Card key={r.id}>
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-semibold">{r.playerName}</p>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <Badge variant={statusVariant[r.status] ?? "secondary"}>{r.status}</Badge>
                      {r.registrationDate && <span>{r.registrationDate}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={r.status} onValueChange={(v) => patch.mutate({ id: r.id, status: v })}>
                      <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">{t.regPending}</SelectItem>
                        <SelectItem value="approved">{t.regApproved}</SelectItem>
                        <SelectItem value="rejected">{t.regRejected}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" className="text-destructive h-8 w-8" onClick={() => remove.mutate(r.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
    </div>
  );
}
