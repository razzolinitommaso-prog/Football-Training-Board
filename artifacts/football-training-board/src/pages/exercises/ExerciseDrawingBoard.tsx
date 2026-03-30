import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Pen, Trash2, Minus, ArrowRight, Circle, Undo2 } from "lucide-react";

export interface EDrawingElement {
  id: string;
  type: "path" | "line" | "arrow" | "circle";
  points: { x: number; y: number }[];
  color: string;
  lineWidth: number;
  canvasW: number;
  canvasH: number;
}

interface Props {
  value?: string | null;
  onChange: (data: string | null) => void;
  onChangeElements?: (elements: EDrawingElement[] | null) => void;
  readOnly?: boolean;
}

const COLORS = [
  { value: "#1d4ed8", label: "Blu" },
  { value: "#dc2626", label: "Rosso" },
  { value: "#ffffff", label: "Bianco" },
  { value: "#f59e0b", label: "Giallo" },
  { value: "#000000", label: "Nero" },
];

const TOOLS = [
  { value: "pen",    icon: Pen,       label: "Penna" },
  { value: "eraser", icon: Eraser,    label: "Gomma (rimuove l'ultimo tratto)" },
  { value: "line",   icon: Minus,     label: "Linea" },
  { value: "arrow",  icon: ArrowRight, label: "Freccia" },
  { value: "circle", icon: Circle,    label: "Cerchio" },
];

const W = 420;
const H = 280;

function uid() { return Math.random().toString(36).slice(2, 9); }

function drawPitch(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#2d7a3a";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#348542";
  const stripeW = w / 8;
  for (let i = 0; i < 8; i += 2) ctx.fillRect(i * stripeW, 0, stripeW, h);

  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1.5;
  const pad = 10;
  ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
  ctx.beginPath(); ctx.moveTo(w / 2, pad); ctx.lineTo(w / 2, h - pad); ctx.stroke();
  ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.15, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 2.5, 0, Math.PI * 2); ctx.fill();
  const paW = w * 0.14, paH = h * 0.42, paY = (h - paH) / 2;
  ctx.strokeRect(pad, paY, paW, paH);
  ctx.strokeRect(w - pad - paW, paY, paW, paH);
  const gaW = w * 0.06, gaH = h * 0.22, gaY = (h - gaH) / 2;
  ctx.strokeRect(pad, gaY, gaW, gaH);
  ctx.strokeRect(w - pad - gaW, gaY, gaW, gaH);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath(); ctx.arc(pad + paW * 0.7, h / 2, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(w - pad - paW * 0.7, h / 2, 2.5, 0, Math.PI * 2); ctx.fill();
}

function drawEElement(ctx: CanvasRenderingContext2D, el: EDrawingElement) {
  ctx.strokeStyle = el.color;
  ctx.lineWidth = el.lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "source-over";

  if (el.type === "path" && el.points.length > 1) {
    ctx.beginPath();
    el.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
  } else if (el.type === "line" && el.points.length >= 2) {
    const [s, e] = [el.points[0], el.points[el.points.length - 1]];
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
  } else if (el.type === "arrow" && el.points.length >= 2) {
    const [s, e] = [el.points[0], el.points[el.points.length - 1]];
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    const angle = Math.atan2(e.y - s.y, e.x - s.x);
    const hl = el.lineWidth * 5 + 8;
    ctx.fillStyle = el.color;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x - hl * Math.cos(angle - Math.PI / 6), e.y - hl * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(e.x - hl * Math.cos(angle + Math.PI / 6), e.y - hl * Math.sin(angle + Math.PI / 6));
    ctx.closePath(); ctx.fill();
  } else if (el.type === "circle" && el.points.length >= 2) {
    const [c, edge] = el.points;
    const r = Math.sqrt((edge.x - c.x) ** 2 + (edge.y - c.y) ** 2);
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
  }
}

function rebuildCanvasFromElements(
  canvas: HTMLCanvasElement,
  elems: EDrawingElement[],
  onExport: (png: string | null) => void,
  onExportElements: ((els: EDrawingElement[] | null) => void) | undefined,
) {
  const ctx = canvas.getContext("2d")!;
  drawPitch(ctx, W, H);
  elems.forEach(el => drawEElement(ctx, el));
  const png = elems.length > 0 ? canvas.toDataURL("image/png") : null;
  onExport(png);
  onExportElements?.(elems.length > 0 ? elems : null);
}

export function ExerciseDrawingBoard({ value, onChange, onChangeElements, readOnly = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<string>("pen");
  const [color, setColor] = useState(COLORS[0].value);
  const [brushSize, setBrushSize] = useState(3);
  const [elements, setElements] = useState<EDrawingElement[]>([]);

  const isDrawing = useRef(false);
  const currentPoints = useRef<{ x: number; y: number }[]>([]);
  const snapshotRef = useRef<ImageData | null>(null);

  // Draw pitch + all elements on mount (loading saved value as background)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    drawPitch(ctx, W, H);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = value;
    }
  }, []); // eslint-disable-line

  const rebuild = useCallback((elems: EDrawingElement[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    rebuildCanvasFromElements(canvas, elems, onChange, onChangeElements);
  }, [onChange, onChangeElements]);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = overlayRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function onPointerDown(e: React.MouseEvent | React.TouchEvent) {
    if (readOnly) return;
    e.preventDefault();
    isDrawing.current = true;
    const pos = getPos(e);
    currentPoints.current = [pos];

    if (tool === "pen") {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    } else if (tool === "line" || tool === "arrow" || tool === "circle") {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      snapshotRef.current = ctx.getImageData(0, 0, W, H);
    }
  }

  function onPointerMove(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing.current || readOnly) return;
    e.preventDefault();
    const pos = getPos(e);
    currentPoints.current.push(pos);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    if (tool === "pen") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if ((tool === "line" || tool === "arrow" || tool === "circle") && snapshotRef.current) {
      ctx.putImageData(snapshotRef.current, 0, 0);
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.globalCompositeOperation = "source-over";
      const start = currentPoints.current[0];
      if (tool === "line") {
        ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(pos.x, pos.y); ctx.stroke();
      } else if (tool === "arrow") {
        ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(pos.x, pos.y); ctx.stroke();
        const angle = Math.atan2(pos.y - start.y, pos.x - start.x);
        const hl = brushSize * 5 + 8;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(pos.x - hl * Math.cos(angle - Math.PI / 6), pos.y - hl * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(pos.x - hl * Math.cos(angle + Math.PI / 6), pos.y - hl * Math.sin(angle + Math.PI / 6));
        ctx.closePath(); ctx.fill();
      } else if (tool === "circle") {
        const r = Math.sqrt((pos.x - start.x) ** 2 + (pos.y - start.y) ** 2);
        ctx.beginPath(); ctx.arc(start.x, start.y, r, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  function onPointerUp(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const pts = currentPoints.current;
    currentPoints.current = [];
    snapshotRef.current = null;

    if (tool === "eraser") {
      // Eraser: remove last stroke
      const updated = elements.slice(0, -1);
      setElements(updated);
      rebuild(updated);
      return;
    }

    if (pts.length < 2) return;

    const start = pts[0];
    const end = pts[pts.length - 1];
    let newEl: EDrawingElement | null = null;

    if (tool === "pen") {
      newEl = { id: uid(), type: "path", points: pts, color, lineWidth: brushSize, canvasW: W, canvasH: H };
    } else if (tool === "line") {
      newEl = { id: uid(), type: "line", points: [start, end], color, lineWidth: brushSize, canvasW: W, canvasH: H };
    } else if (tool === "arrow") {
      newEl = { id: uid(), type: "arrow", points: [start, end], color, lineWidth: brushSize, canvasW: W, canvasH: H };
    } else if (tool === "circle") {
      newEl = { id: uid(), type: "circle", points: [start, end], color, lineWidth: brushSize, canvasW: W, canvasH: H };
    }

    if (newEl) {
      const updated = [...elements, newEl];
      setElements(updated);
      // Export PNG from current canvas (already drawn on screen) + elements JSON
      const canvas = canvasRef.current!;
      const png = canvas.toDataURL("image/png");
      onChange(png);
      onChangeElements?.(updated);
    }
  }

  function handleUndo() {
    const updated = elements.slice(0, -1);
    setElements(updated);
    rebuild(updated);
  }

  function handleClear() {
    setElements([]);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    drawPitch(ctx, W, H);
    onChange(null);
    onChangeElements?.(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative rounded-lg overflow-hidden border border-border shadow-inner" style={{ aspectRatio: `${W}/${H}`, width: "100%" }}>
        <canvas ref={canvasRef} width={W} height={H} className="absolute inset-0 w-full h-full" />
        {!readOnly && (
          <canvas
            ref={overlayRef} width={W} height={H}
            className="absolute inset-0 w-full h-full cursor-crosshair"
            style={{ opacity: 0 }}
            onMouseDown={onPointerDown} onMouseMove={onPointerMove} onMouseUp={onPointerUp} onMouseLeave={onPointerUp}
            onTouchStart={onPointerDown} onTouchMove={onPointerMove} onTouchEnd={onPointerUp}
          />
        )}
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 border rounded-md p-0.5 bg-muted/30">
            {TOOLS.map(t => (
              <button
                key={t.value} type="button"
                className={`p-2 rounded transition-colors ${tool === t.value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                onClick={() => setTool(t.value)}
                title={t.label}
              >
                <t.icon className="w-4 h-4" />
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {COLORS.map(c => (
              <button
                key={c.value} type="button"
                className={`w-6 h-6 rounded-full border-2 transition-transform ${color === c.value ? "scale-125 border-foreground" : "border-transparent"}`}
                style={{ backgroundColor: c.value }}
                onClick={() => setColor(c.value)}
                title={c.label}
              />
            ))}
          </div>
          <select
            className="text-xs border rounded px-1.5 py-1 bg-background"
            value={brushSize}
            onChange={e => setBrushSize(Number(e.target.value))}
          >
            <option value={2}>Sottile</option>
            <option value={4}>Medio</option>
            <option value={7}>Spesso</option>
          </select>
          <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={handleUndo} disabled={elements.length === 0}>
            <Undo2 className="w-4 h-4 mr-1" /> Annulla
          </Button>
          <Button type="button" size="sm" variant="ghost" className="text-destructive h-8 px-2" onClick={handleClear}>
            <Trash2 className="w-4 h-4 mr-1" /> Pulisci
          </Button>
        </div>
      )}
    </div>
  );
}
