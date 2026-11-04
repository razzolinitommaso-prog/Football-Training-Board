import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sessionTeamIds } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { withApi } from "@/lib/api-base";
type Session = { id: number; teamId: number | null; notes?: string | null; title: string; scheduledAt: string; teamName?: string | null; sessionKind: string; canEdit?: boolean };
type Link = { id: number; exerciseId: number; exercise?: { title: string; trainingPhase?: string | null; durationMinutes?: number | null } | null };
async function links(id: number): Promise<Link[]> { const r = await fetch(withApi(`/api/training-sessions/${id}/exercises`), { credentials: "include" }); if (!r.ok) throw Error("Stazioni non disponibili"); return r.json(); }
export function AdoptTrainingProposal({ source, sessions, onAdopted }: { source: Session; sessions: Session[]; onAdopted: (id:number)=>void }) {
  const [open, setOpen] = useState(false), [target, setTarget] = useState(""), [selected, setSelected] = useState<number[]>([]), [busy, setBusy] = useState(false);
  const { toast } = useToast(), qc = useQueryClient();
  const sourceQuery = useQuery({ queryKey: ["adoption-source", source.id], enabled: open, queryFn: () => links(source.id) });
  const targetQuery = useQuery({ queryKey: ["adoption-target", target], enabled: open && !!target, queryFn: () => links(Number(target)), staleTime: 0 });
  useEffect(() => { if(open && sourceQuery.data) setSelected(sourceQuery.data.map(link=>link.exerciseId)); }, [open, sourceQuery.data]);
  const options = sessions.filter(s => s.sessionKind === "regular" && s.canEdit && s.teamId && (!source.teamId || sessionTeamIds(s.teamId,s.notes).includes(source.teamId)));
  async function adopt() {
    if (!targetQuery.data || !selected.length || busy) return;
    if (!window.confirm(`Aggiungere ${selected.length} copie delle stazioni alla seduta selezionata? Le ${targetQuery.data.length} stazioni già presenti saranno mantenute. Giocatori e rotazioni vanno organizzati nella seduta destinataria.`)) return;
    setBusy(true);
    try {
      const response = await fetch(withApi(`/api/training-sessions/${source.id}/adopt`), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetSessionId: Number(target), exerciseIds: selected, expectedExerciseIds: targetQuery.data.map(link=>link.id) }) });
      const payload = await response.json(); if (!response.ok) throw Error(payload.error ?? "Adozione non riuscita");
      await qc.invalidateQueries({ queryKey: ["/api/training-sessions"] }); await qc.invalidateQueries({ queryKey: ["/api/exercises"] });
      setOpen(false); onAdopted(Number(target)); toast({ title: "Copie aggiunte alla tua seduta", description: "Controlla minutaggio, recuperi e gruppi prima di salvare la preparazione." });
    } catch(error) { toast({title:"Proposta non adottata",description:error instanceof Error?error.message:"Riprova",variant:"destructive"}); void targetQuery.refetch(); }
    finally { setBusy(false); }
  }
  return <><Button variant="outline" onClick={()=>{setTarget("");setOpen(true);}}>Usa nella mia seduta</Button><Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Adotta la proposta</DialogTitle></DialogHeader>
    <p className="text-sm text-muted-foreground">Scegli tutte le stazioni o solo quelle utili. Verranno create copie indipendenti; la preparazione già presente resta disponibile. I recuperi e i gruppi della tua seduta restano da controllare.</p>
    <Select value={target} onValueChange={setTarget}><SelectTrigger><SelectValue placeholder="Scegli la tua seduta in calendario" /></SelectTrigger><SelectContent>{options.map(s=><SelectItem key={s.id} value={String(s.id)}>{new Date(s.scheduledAt).toLocaleString("it-IT")} · {s.teamName} · {s.title}</SelectItem>)}</SelectContent></Select>
    {!options.length && <p>Prepara prima una tua seduta dal calendario.</p>}
    {sourceQuery.isPending ? <p>Caricamento stazioni…</p> : sourceQuery.isError ? <p role="alert">Stazioni non disponibili.</p> : <div className="space-y-3">{sourceQuery.data?.map(link=><label key={link.id} className="flex gap-3 rounded-lg border p-3 text-sm"><Checkbox checked={selected.includes(link.exerciseId)} onCheckedChange={value=>setSelected(old=>value?[...new Set([...old,link.exerciseId])]:old.filter(id=>id!==link.exerciseId))}/><span>{link.exercise?.title ?? "Stazione non disponibile"}<span className="mt-1 block text-xs text-muted-foreground">{link.exercise?.trainingPhase} · {link.exercise?.durationMinutes ?? "—"} min</span></span></label>)}</div>}
    {target && targetQuery.data && <p className="text-sm">La seduta contiene già {targetQuery.data.length} stazioni. Aggiungerai {selected.length} copie.</p>}
    {targetQuery.isError && <p role="alert">Riepilogo destinatario non disponibile.</p>}
    <Button disabled={busy||!target||!selected.length||!targetQuery.data||targetQuery.isFetching||sourceQuery.isFetching||sourceQuery.isError||targetQuery.isError} onClick={()=>void adopt()}>{busy?"Aggiunta in corso…":"Conferma e apri la mia seduta"}</Button>
  </DialogContent></Dialog></>;
}
