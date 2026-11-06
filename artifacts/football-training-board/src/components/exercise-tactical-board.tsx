import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {boardPlayerIds,syncExerciseBoardRoster,readMaterialSelection,excludeTrainingBoardPlayers} from "@workspace/api-zod";

export function detachExerciseBoard(value?: string | null): string | null {
  if (!value) return null;
  try { return JSON.stringify({ ...JSON.parse(value), boardId: null }); } catch { return value; }
}

export function ExerciseTacticalBoard({ title, teamId, value, rosterPlayerIds, allowedPlayerIds, rosterPlayers, equipment, programSessionId, disabled = false, onSave }: {
  disabled?: boolean; programSessionId?: number; title: string; teamId?: string | number | null; value?: string | null; rosterPlayerIds?: number[];allowedPlayerIds?:number[];rosterPlayers?:{id:number;firstName?:string;lastName?:string;jerseyNumber?:number|null}[];equipment?:string|null;
  onSave: (result: { statoLavagnaJson: string; drawingData: string; drawingElementsJson: string;selectedPlayerIdsJson?:string;playersRequiredMode?:"selected" }) => void;
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
        const incoming=JSON.stringify(event.data.board),allowed=allowedPlayerIds??rosterPlayerIds;
        const forbidden=boardPlayerIds(incoming).filter(id=>allowed&&!allowed.includes(id));
        const raw=excludeTrainingBoardPlayers(incoming,forbidden)??incoming,ids=boardPlayerIds(raw);
        onSave({ statoLavagnaJson: raw, drawingData: raw===incoming?event.data.drawingData:"", drawingElementsJson: JSON.stringify(JSON.parse(raw).data.elements ?? []),...((ids.length||boardPlayerIds(value).length)?{selectedPlayerIdsJson:JSON.stringify(ids),playersRequiredMode:"selected"}:{}) });
        setToken(null);
      }
    };
    window.addEventListener("message", receive);
    return () => { window.removeEventListener("message", receive); };
  }, [token, onSave,value,allowedPlayerIds,rosterPlayerIds]);
  return <>
    <button type="button" disabled={disabled} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50" onClick={() => {
      const key = crypto.randomUUID();
      let board = null;
      try { board = rosterPlayerIds ? JSON.parse(syncExerciseBoardRoster(value,rosterPlayerIds,rosterPlayers)) : value ? JSON.parse(value) : null; } catch { /* older drawings stay in their existing editor */ }
      sessionStorage.setItem(`ftb-exercise-board:${key}`, JSON.stringify({ title, board, rosterPlayerIds:allowedPlayerIds??rosterPlayerIds, plannedMaterials:readMaterialSelection(equipment), programSessionId }));
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
