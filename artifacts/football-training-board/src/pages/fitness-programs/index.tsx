import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Dumbbell, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";
import { customFetch } from "@workspace/api-client-react/custom-fetch";
import { useListTeams } from "@workspace/api-client-react";
import { useForm, Controller } from "react-hook-form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface FitnessProgram {
  id: number;
  title: string;
  description: string | null;
  durationWeeks: number | null;
  intensityLevel: string;
  teamId: number | null;
  teamName: string | null;
  createdAt: string;
}

interface FormValues {
  title: string;
  description: string;
  durationWeeks: number | "";
  intensityLevel: string;
  teamId: number | "";
}

export default function FitnessPrograms() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [programs, setPrograms] = useState<FitnessProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data: teams } = useListTeams();

  const form = useForm<FormValues>({
    defaultValues: { title: "", description: "", durationWeeks: "", intensityLevel: "medium", teamId: "" },
  });

  const intensityColors: Record<string, string> = {
    low: "bg-green-100 text-green-800",
    medium: "bg-yellow-100 text-yellow-800",
    high: "bg-orange-100 text-orange-800",
    very_high: "bg-red-100 text-red-800",
  };

  const intensityLabel: Record<string, string> = {
    low: t.low,
    medium: t.medium,
    high: t.high,
    very_high: t.veryHigh,
  };

  const loadPrograms = () => {
    setLoading(true);
    customFetch<FitnessProgram[]>("/api/fitness-programs", { method: "GET" })
      .then(setPrograms)
      .finally(() => setLoading(false));
  };

  useEffect(loadPrograms, []);

  const onSubmit = async (values: FormValues) => {
    setSaving(true);
    try {
      await customFetch("/api/fitness-programs", {
        method: "POST",
        body: JSON.stringify({
          title: values.title,
          description: values.description || null,
          durationWeeks: values.durationWeeks || null,
          intensityLevel: values.intensityLevel,
          teamId: values.teamId || null,
        }),
      });
      toast({ title: t.saved });
      setIsOpen(false);
      form.reset();
      loadPrograms();
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteProgram = async (id: number) => {
    try {
      await customFetch(`/api/fitness-programs/${id}`, { method: "DELETE" });
      setPrograms(p => p.filter(x => x.id !== id));
      toast({ title: t.saved });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.fitnessPrograms}</h1>
          <p className="text-muted-foreground mt-1">{t.fitnessProgramsDesc}</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />{t.addProgram}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t.createNewProgram}</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label>{t.programTitle} *</Label>
                <Input {...form.register("title", { required: true })} />
              </div>
              <div className="space-y-2">
                <Label>{t.description}</Label>
                <Textarea {...form.register("description")} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.durationWeeks}</Label>
                  <Input type="number" min={1} max={52} {...form.register("durationWeeks")} />
                </div>
                <div className="space-y-2">
                  <Label>{t.intensityLevel}</Label>
                  <Controller
                    control={form.control}
                    name="intensityLevel"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">{t.low}</SelectItem>
                          <SelectItem value="medium">{t.medium}</SelectItem>
                          <SelectItem value="high">{t.high}</SelectItem>
                          <SelectItem value="very_high">{t.veryHigh}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t.assignedTo}</Label>
                <Controller
                  control={form.control}
                  name="teamId"
                  render={({ field }) => (
                    <Select value={String(field.value)} onValueChange={(v) => field.onChange(v === "all" ? "" : parseInt(v))}>
                      <SelectTrigger><SelectValue placeholder={t.allTeamsProgram} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t.allTeamsProgram}</SelectItem>
                        {teams?.map(team => (
                          <SelectItem key={team.id} value={String(team.id)}>{team.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving ? t.saving : t.addProgram}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : programs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Dumbbell className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">{t.noPrograms}</p>
            <p className="text-sm text-muted-foreground mt-1">{t.createFirstProgram}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {programs.map(prog => (
            <Card key={prog.id}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="font-semibold leading-tight">{prog.title}</h3>
                  <Badge className={`shrink-0 text-xs ${intensityColors[prog.intensityLevel] ?? intensityColors.medium}`}>
                    {intensityLabel[prog.intensityLevel] ?? prog.intensityLevel}
                  </Badge>
                </div>
                {prog.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{prog.description}</p>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {prog.teamName ?? t.allTeamsProgram}
                  </span>
                  {prog.durationWeeks && (
                    <span>{prog.durationWeeks} {t.weeks}</span>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t flex justify-end">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t.deleteProgram}</AlertDialogTitle>
                        <AlertDialogDescription>{prog.title}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t.load}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteProgram(prog.id)} className="bg-destructive text-destructive-foreground">
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
