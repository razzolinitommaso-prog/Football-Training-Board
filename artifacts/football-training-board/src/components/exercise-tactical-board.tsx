import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export function detachExerciseBoard(value?: string | null): string | null {
  if (!value) return null;
  try { return JSON.stringify({ ...JSON.parse(value), boardId: null }); } catch { return value; }
}

export function ExerciseTacticalBoard({ title, teamId, value, rosterPlayerIds, onSave }: {
  title: string; teamId?: string | number | null; value?: string | null; rosterPlayerIds?: number[];
  onSave: (result: { statoLavagnaJson: string; drawingData: string; drawingElementsJson: string }) => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => () => { if (token) sessionStorage.removeItem(`ftb-exercise-board:${token}`); }, [token]);
  useEffect(() => {
    if (!token) return;
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.token !== token) return;
      if (event.data.type === "ftb-exercise-board-close") setToken(null);
      if (event.data.type === "ftb-exercise-board-saved" && typeof event.data.drawingData === "string" && event.data.board?.data) {
        onSave({ statoLavagnaJson: JSON.stringify(event.data.board), drawingData: event.data.drawingData, drawingElementsJson: JSON.stringify(event.data.board.data.elements ?? []) });
        setToken(null);
      }
    };
    window.addEventListener("message", receive);
    return () => { window.removeEventListener("message", receive); };
  }, [token, onSave]);
  return <>
    <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => {
      const key = crypto.randomUUID();
      let board = null;
      try { board = value ? JSON.parse(value) : null; } catch { /* older drawings stay in their existing editor */ }
      sessionStorage.setItem(`ftb-exercise-board:${key}`, JSON.stringify({ title, board, rosterPlayerIds }));
      setToken(key);
    }}>Apri lavagna tattica</button>
    <p className="text-xs text-muted-foreground">Salva la lavagna per riportarla qui, poi salva la scheda stazione.</p>
    <Dialog open={!!token} onOpenChange={open => { if (!open && window.confirm("Chiudere la lavagna? Le modifiche non salvate andranno perse.")) setToken(null); }}>
      <DialogContent className="h-[95dvh] max-w-[98vw] gap-0 overflow-hidden p-0 [&>button]:hidden" onInteractOutside={event => event.preventDefault()}>
        <DialogTitle className="sr-only">Lavagna stazione</DialogTitle>
        {token && <iframe ref={frame} title="Lavagna stazione" className="h-full w-full border-0" src={`/tactical-board?source=exercise&draftToken=${encodeURIComponent(token)}${teamId ? `&teamId=${teamId}` : ""}`} />}
      </DialogContent>
    </Dialog>
  </>;
}
