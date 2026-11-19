import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react/custom-fetch";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";

export function PlayerEntryMeasurements({ playerId, height, weight }: { playerId: number; height?: number | null; weight?: number | null }) {
  const [open, setOpen] = useState(false), [h, setH] = useState(""), [w, setW] = useState(""), [note, setNote] = useState("");
  const cache = useQueryClient(), { toast } = useToast();
  const { role, user, club } = useAuth();
  const preparer = role === "fitness_coach" || role === "athletic_director";
  const capabilities = useQuery({ queryKey: ["/api/player-fitness-data/capabilities", club?.id, user?.id, role], enabled: preparer,
    queryFn: () => customFetch<{ canEdit: boolean }>("/api/player-fitness-data/capabilities") });
  const save = useMutation({ mutationFn: () => customFetch(`/api/players/${playerId}/entry-measurements`, { method: "PATCH", body: JSON.stringify({ height: h ? Number(h) : null, weight: w ? Number(w) : null, note }) }),
    onSuccess: async () => { await cache.invalidateQueries({ queryKey: ["/api/players"] }); setOpen(false); toast({ title: "Dati d’ingresso corretti", description: "La correzione è salvata nello storico. I dati attuali restano quelli dell’ultima misurazione disponibile." }); } });
  if (preparer && !capabilities.data?.canEdit) return null;
  return <><Button type="button" variant="outline" size="sm" onClick={() => { setH(height == null ? "" : String(height)); setW(weight == null ? "" : String(weight)); setNote(""); save.reset(); setOpen(true); }}>Correggi altezza e peso d’ingresso</Button>
    <Dialog open={open} onOpenChange={value => { if (!save.isPending) setOpen(value); }}><DialogContent>
      <DialogHeader><DialogTitle>Misure storiche d’ingresso</DialogTitle><DialogDescription>Correggi un dato iniziale dichiarato o inserito per errore. Le misure dei test restano nello storico e l’ultima rilevazione continua a determinare il dato attuale.</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); event.stopPropagation(); if (!save.isPending) save.mutate(); }}>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm">Altezza iniziale · cm<Input type="number" min={1} max={300} step="any" value={h} onChange={event => setH(event.target.value)} disabled={save.isPending} /></label>
          <label className="text-sm">Peso iniziale · kg<Input type="number" min={1} max={400} step="any" value={w} onChange={event => setW(event.target.value)} disabled={save.isPending} /></label></div>
        <label className="block text-sm">Motivo della correzione<Textarea rows={2} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} disabled={save.isPending} /></label>
        {save.isError && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
        <Button type="submit" disabled={save.isPending}>{save.isPending ? "Salvataggio…" : "Salva correzione"}</Button>
      </form>
    </DialogContent></Dialog>
  </>;
}
