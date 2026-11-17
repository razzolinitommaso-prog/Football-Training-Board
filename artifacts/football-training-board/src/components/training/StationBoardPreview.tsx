import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { stationBoardPreview } from "@/lib/reuse-training-station";

export function StationBoardPreview({ board, image, title }: { board?: string | null; image?: string | null; title: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = stationBoardPreview(board, image);
  if (!preview) return <p className="flex min-h-32 items-center justify-center rounded-lg border bg-muted/20 p-4 text-center text-sm text-muted-foreground">{board ? "Schema salvato. Apri la lavagna tattica per visualizzarlo e aggiornarne l’anteprima." : "Nessuna rappresentazione grafica salvata."}</p>;
  return <div className="min-w-0 space-y-2">
    <button type="button" className="flex w-full items-center justify-center rounded-lg border bg-muted/20 p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={() => setExpanded(true)} aria-label={`Ingrandisci lavagna: ${title}`}>
      <img src={preview.src} alt={`Lavagna: ${title}`} className="max-h-80 min-h-44 w-full object-contain" />
    </button>
    {preview.reference && <p className="text-xs text-muted-foreground">Schema grafico originale conservato. I nomi nell’immagine si riferiscono alla seduta di origine; la rosa attuale si assegna nella lavagna.</p>}
    <Button type="button" variant="outline" size="sm" onClick={() => setExpanded(true)}>Ingrandisci grafica</Button>
    <Dialog open={expanded} onOpenChange={setExpanded}>
      <DialogContent className="max-h-[94dvh] w-[calc(100%-1rem)] max-w-6xl overflow-y-auto p-4">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <img src={preview.src} alt={`Lavagna ingrandita: ${title}`} className="max-h-[78dvh] w-full object-contain" />
        {preview.reference && <p className="text-sm text-muted-foreground">Schema della seduta di origine.</p>}
      </DialogContent>
    </Dialog>
  </div>;
}
