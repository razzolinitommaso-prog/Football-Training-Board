import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Activity, Heart, Zap, Timer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";
import { customFetch } from "@workspace/api-client-react/custom-fetch";
import { useListPlayers } from "@workspace/api-client-react";
import { useForm, Controller } from "react-hook-form";
import { format } from "date-fns";

interface FitnessEntry {
  id: number;
  playerId: number;
  playerName: string | null;
  date: string;
  endurance: number | null;
  strength: number | null;
  speed: number | null;
  notes: string | null;
}

interface FormValues {
  playerId: number | "";
  date: string;
  endurance: number | "";
  strength: number | "";
  speed: number | "";
  notes: string;
}

function ScoreBar({ value, color }: { value: number | null; color: string }) {
  if (value === null) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-medium w-8 text-right">{value}</span>
    </div>
  );
}

export default function PlayerPerformance() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [entries, setEntries] = useState<FitnessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterPlayer, setFilterPlayer] = useState<string>("all");
  const { data: players } = useListPlayers();

  const form = useForm<FormValues>({
    defaultValues: {
      playerId: "",
      date: new Date().toISOString().slice(0, 10),
      endurance: "",
      strength: "",
      speed: "",
      notes: "",
    },
  });

  const loadEntries = () => {
    setLoading(true);
    const url = filterPlayer && filterPlayer !== "all"
      ? `/api/player-fitness-data?playerId=${filterPlayer}`
      : "/api/player-fitness-data";
    customFetch<FitnessEntry[]>(url, { method: "GET" })
      .then(setEntries)
      .finally(() => setLoading(false));
  };

  useEffect(loadEntries, [filterPlayer]);

  const onSubmit = async (values: FormValues) => {
    if (!values.playerId) return;
    setSaving(true);
    try {
      await customFetch("/api/player-fitness-data", {
        method: "POST",
        body: JSON.stringify({
          playerId: Number(values.playerId),
          date: values.date,
          endurance: values.endurance !== "" ? Number(values.endurance) : null,
          strength: values.strength !== "" ? Number(values.strength) : null,
          speed: values.speed !== "" ? Number(values.speed) : null,
          notes: values.notes || null,
        }),
      });
      toast({ title: t.saved });
      setIsOpen(false);
      form.reset({ date: new Date().toISOString().slice(0, 10), playerId: "", endurance: "", strength: "", speed: "", notes: "" });
      loadEntries();
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (id: number) => {
    try {
      await customFetch(`/api/player-fitness-data/${id}`, { method: "DELETE" });
      setEntries(e => e.filter(x => x.id !== id));
      toast({ title: t.saved });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.playerPerformance}</h1>
          <p className="text-muted-foreground mt-1">{t.playerPerformanceDesc}</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />{t.addTestResult}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t.recordPerformance}</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label>{t.selectPlayer} *</Label>
                <Controller
                  control={form.control}
                  name="playerId"
                  rules={{ required: true }}
                  render={({ field }) => (
                    <Select value={String(field.value)} onValueChange={(v) => field.onChange(parseInt(v))}>
                      <SelectTrigger><SelectValue placeholder={t.selectPlayer} /></SelectTrigger>
                      <SelectContent>
                        {players?.map(p => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.firstName} {p.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>{t.testDate} *</Label>
                <Input type="date" {...form.register("date", { required: true })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Heart className="w-3.5 h-3.5 text-red-500" />
                    {t.endurance}
                  </Label>
                  <Input type="number" min={0} max={100} placeholder="0–100" {...form.register("endurance")} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-yellow-500" />
                    {t.strength}
                  </Label>
                  <Input type="number" min={0} max={100} placeholder="0–100" {...form.register("strength")} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Timer className="w-3.5 h-3.5 text-purple-500" />
                    {t.speed}
                  </Label>
                  <Input type="number" min={0} max={100} placeholder="0–100" {...form.register("speed")} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t.outOf100}</p>
              <div className="space-y-2">
                <Label>{t.notes}</Label>
                <Textarea {...form.register("notes")} rows={2} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving ? t.saving : t.addTestResult}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3">
        <Label className="shrink-0">{t.filterByTeam}:</Label>
        <Select value={filterPlayer} onValueChange={setFilterPlayer}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.allTeams}</SelectItem>
            {players?.map(p => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.firstName} {p.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Activity className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">{t.noPerformanceData}</p>
            <p className="text-sm text-muted-foreground mt-1">{t.addFirstTest}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map(entry => (
            <Card key={entry.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-semibold">{entry.playerName ?? `Player #${entry.playerId}`}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(entry.date), "dd/MM/yyyy")}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <Heart className="w-3 h-3 text-red-500" />{t.endurance}
                        </div>
                        <ScoreBar value={entry.endurance} color="bg-red-400" />
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-yellow-500" />{t.strength}
                        </div>
                        <ScoreBar value={entry.strength} color="bg-yellow-400" />
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <Timer className="w-3 h-3 text-purple-500" />{t.speed}
                        </div>
                        <ScoreBar value={entry.speed} color="bg-purple-400" />
                      </div>
                    </div>
                    {entry.notes && (
                      <p className="text-xs text-muted-foreground mt-2 italic">{entry.notes}</p>
                    )}
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t.deleteEntry}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {entry.playerName} — {format(new Date(entry.date), "dd/MM/yyyy")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t.load}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteEntry(entry.id)} className="bg-destructive text-destructive-foreground">
                          {t.deleteTactic}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
