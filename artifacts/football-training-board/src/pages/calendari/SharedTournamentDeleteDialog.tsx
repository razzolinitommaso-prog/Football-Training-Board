import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type TournamentDeleteTarget = {
  id: number; revision: number; name: string; teams: { id: number; name: string }[];
};

export function SharedTournamentDeleteDialog({ target, pending, error, onCancel, onConfirm }: {
  target: TournamentDeleteTarget | null; pending: boolean; error?: string;
  onCancel: () => void; onConfirm: () => void;
}) {
  return <AlertDialog open={!!target} onOpenChange={open => { if (!open && !pending) onCancel(); }}>
    <AlertDialogContent className="max-h-[92dvh] overflow-y-auto">
      <AlertDialogHeader>
        <AlertDialogTitle>Eliminare il torneo per tutte le annate?</AlertDialogTitle>
        <AlertDialogDescription>
          {target?.name}. Verranno eliminati il torneo, i programmi e tutte le partite collegate,
          comprese convocazioni, schieramenti, risultati, resoconti e allegati del torneo.
          L’eliminazione è definitiva.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="space-y-2">
        <p className="text-sm font-semibold">Annate coinvolte: {target?.teams.length ?? 0}</p>
        <ul aria-label="Annate coinvolte nell’eliminazione" className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm">
          {target?.teams.map(team => <li key={team.id}>{team.name}</li>)}
        </ul>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel asChild><Button variant="outline" disabled={pending}>Annulla</Button></AlertDialogCancel>
        <AlertDialogAction asChild className="border-destructive-border bg-destructive text-destructive-foreground hover:bg-destructive/90">
          <Button variant="destructive" className="whitespace-normal text-center" disabled={pending} onClick={event => { event.preventDefault(); onConfirm(); }}>
            {pending ? "Eliminazione…" : "Conferma: elimina per tutte le annate"}
          </Button>
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
