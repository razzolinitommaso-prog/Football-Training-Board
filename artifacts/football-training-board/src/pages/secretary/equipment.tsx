import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Edit3 } from "lucide-react";

interface Equipment { id: number; playerId: number; playerName?: string; kitAssigned?: string; trainingKit?: string; matchKit?: string; notes?: string; }
interface Player { id: number; firstName: string; lastName: string; }

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

export default function EquipmentPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [kitAssigned, setKitAssigned] = useState(""); const [trainingKit, setTrainingKit] = useState("");
  const [matchKit, setMatchKit] = useState(""); const [notes, setNotes] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState("all");

  const { data: equipment = [], isLoading } = useQuery<Equipment[]>({ queryKey: ["/api/equipment"], queryFn: () => apiFetch("/api/equipment") });
  const { data: players = [] } = useQuery<Player[]>({ queryKey: ["/api/players"], queryFn: () => apiFetch("/api/players") });

  const save = useMutation({
    mutationFn: (d: object) => apiFetch("/api/equipment", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/equipment"] }); setEditPlayer(null); toast({ title: t.saveEquipment }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  function openEdit(player: Player) {
    const existing = equipment.find(e => e.playerId === player.id);
    setEditPlayer(player);
    setKitAssigned(existing?.kitAssigned ?? "");
    setTrainingKit(existing?.trainingKit ?? "");
    setMatchKit(existing?.matchKit ?? "");
    setNotes(existing?.notes ?? "");
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editPlayer) return;
    save.mutate({ playerId: editPlayer.id, kitAssigned: kitAssigned || null, trainingKit: trainingKit || null, matchKit: matchKit || null, notes: notes || null });
  }

  const playersWithEquipment = players.map(p => ({ ...p, eq: equipment.find(e => e.playerId === p.id) }));
  const filteredPlayers = selectedPlayer !== "all" ? playersWithEquipment.filter(p => String(p.id) === selectedPlayer) : playersWithEquipment;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="w-6 h-6 text-primary" />{t.equipment}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.equipmentDesc}</p>
      </div>

      <div className="flex gap-4">
        <Select value={selectedPlayer} onValueChange={setSelectedPlayer}>
          <SelectTrigger className="w-64"><SelectValue placeholder={t.filterByPlayer ?? "Filter by player..."} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.all ?? "All"}</SelectItem>
            {players.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.firstName} {p.lastName}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? <div className="text-center py-12 text-muted-foreground">{t.loading}</div>
        : filteredPlayers.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">{t.noEquipment}</CardContent></Card>
        : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPlayers.map(({ id, firstName, lastName, eq }) => (
              <Card key={id} className={eq ? "border-primary/30" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">{firstName} {lastName}</CardTitle>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit({ id, firstName, lastName })}>
                      <Edit3 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  {eq ? (
                    <>
                      {eq.kitAssigned && <p>#{eq.kitAssigned} — {t.kitAssigned}</p>}
                      {eq.trainingKit && <p>{t.trainingKit}: {eq.trainingKit}</p>}
                      {eq.matchKit && <p>{t.matchKit}: {eq.matchKit}</p>}
                      {eq.notes && <p className="italic">{eq.notes}</p>}
                    </>
                  ) : <p className="italic">{t.noEquipment}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

      <Dialog open={!!editPlayer} onOpenChange={(o) => !o && setEditPlayer(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editPlayer?.firstName} {editPlayer?.lastName} — {t.equipment}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>{t.kitAssigned}</Label><Input value={kitAssigned} onChange={e => setKitAssigned(e.target.value)} placeholder="#10" /></div>
              <div className="space-y-2"><Label>{t.trainingKit}</Label><Input value={trainingKit} onChange={e => setTrainingKit(e.target.value)} /></div>
              <div className="space-y-2"><Label>{t.matchKit}</Label><Input value={matchKit} onChange={e => setMatchKit(e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>{t.notes}</Label><Input value={notes} onChange={e => setNotes(e.target.value)} /></div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditPlayer(null)}>{t.cancel}</Button>
              <Button type="submit" disabled={save.isPending}>{t.saveEquipment}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
