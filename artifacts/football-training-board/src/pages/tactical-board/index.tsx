import { useRef, useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExerciseVoiceRecorder } from "@/pages/exercises/ExerciseVoiceRecorder";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  User,
  Users,
  Circle,
  Triangle,
  Pencil,
  ArrowRight,
  Eraser,
  Save,
  FolderOpen,
  Trash2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  BookOpen,
  PenLine,
  Layers,
  FileEdit,
  CalendarDays,
  X,
  CheckCheck,
  Mic,
  Clock,
  UserCheck,
  Package,
  Ruler,
  Undo2,
  Spline,
  GitBranch,
  Plus,
  Dumbbell,
  Shield,
  ChevronRight,
  Play,
  Pause,
  Square,
  Film,
  Camera,
  Clapperboard,
  Copy,
  Download,
  PanelRight,
  PanelRightClose,
  Type,
  Minus,
  Goal,
  Settings,
  Redo2,
  LayoutGrid,
  Video,
} from "lucide-react";

interface Exercise {
  id: number;
  title: string;
  category?: string | null;
  description?: string | null;
  durationMinutes?: number | null;
  playersRequired?: number | null;
  equipment?: string | null;
  drawingData?: string | null;
  drawingElementsJson?: string | null;
  voiceNoteData?: string | null;
  isDraft?: boolean;
  trainingPhase?: string | null;
  trainingDay?: string | null;
}

interface DraftForm {
  title: string;
  description: string;
  durationMinutes: string;
  playersRequired: string;
  equipment: string;
  trainingDay: string;
  trainingPhase: string;
  isDraft: boolean;
  voiceNoteData: string | null;
}

interface NewExForm {
  title: string;
  category: string;
  teamId: string;
  principio: string;
  trainingDay: string;
  trainingPhase: string;
  durationMinutes: string;
  playersRequired: string;
  equipment: string;
  description: string;
  voiceNoteData: string | null;
  isDraft: boolean;
}

interface MyTeam { id: number; name: string; }

type ToolType = "player" | "opponent" | "goalkeeper" | "ball" | "cone" | "goal" | "text" | "draw" | "line" | "arrow" | "curve" | "curveArrow" | "eraser"
  | "goalLarge" | "disc" | "cinesino" | "sagoma" | "flag" | "ladder" | "hurdle" | "pole" | "vest";

interface Point { x: number; y: number }

interface BoardElement {
  id: string;
  type: "player" | "opponent" | "goalkeeper" | "ball" | "cone" | "goal" | "text" | "path" | "line" | "arrow" | "bezier" | "bezierarrow"
    | "goalLarge" | "disc" | "cinesino" | "sagoma" | "flag" | "ladder" | "hurdle" | "pole" | "vest";
  x?: number;
  y?: number;
  points?: Point[];
  label?: string;
  color?: string;
  lineWidth?: number;
  drawShape?: string;
  arrowEnd?: string;
  // Player metadata
  playerNumber?: number;
  playerName?: string;
  playerRole?: string;
  playerPhoto?: string;
  rotation?: number;
  // Equipment metadata
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  equipColor?: string;
}

interface DragHandle { elId: string; idx: number; kind: 'point' | 'move' }

interface SavedTactic {
  name: string;
  elements: BoardElement[];
}

// ── Freehand path simplification (Douglas-Peucker) ─────────────────────────
function perpDist(p: {x:number;y:number}, a: {x:number;y:number}, b: {x:number;y:number}): number {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((b.y - a.y)*p.x - (b.x - a.x)*p.y + b.x*a.y - b.y*a.x) / len;
}
function simplifyPath(pts: {x:number;y:number}[], eps: number): {x:number;y:number}[] {
  if (pts.length <= 2) return pts;
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps) {
    const L = simplifyPath(pts.slice(0, idx + 1), eps);
    const R = simplifyPath(pts.slice(idx), eps);
    return [...L.slice(0, -1), ...R];
  }
  return [pts[0], pts[pts.length - 1]];
}

/** Resample path to N equidistant points then apply Catmull-Rom smoothing */
function smoothPath(pts: {x:number;y:number}[], targetN = 60, alpha = 0.5): {x:number;y:number}[] {
  if (pts.length < 2) return pts;
  // 1. Compute arc-length
  const lens: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
    lens.push(lens[i-1] + Math.sqrt(dx*dx+dy*dy));
  }
  const total = lens[lens.length-1];
  if (total < 1) return pts;
  // 2. Resample to targetN points
  const N = Math.min(targetN, pts.length);
  const resampled: {x:number;y:number}[] = [];
  let seg = 0;
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * total;
    while (seg < lens.length - 2 && lens[seg+1] < t) seg++;
    const s = lens[seg+1] - lens[seg];
    const f = s > 0 ? (t - lens[seg]) / s : 0;
    resampled.push({ x: pts[seg].x + f*(pts[seg+1].x-pts[seg].x), y: pts[seg].y + f*(pts[seg+1].y-pts[seg].y) });
  }
  // 3. Catmull-Rom → Bezier control points
  const out: {x:number;y:number}[] = [];
  for (let i = 0; i < resampled.length; i++) {
    const p0 = resampled[Math.max(0, i-1)];
    const p1 = resampled[i];
    const p2 = resampled[Math.min(resampled.length-1, i+1)];
    const p3 = resampled[Math.min(resampled.length-1, i+2)];
    const cp1x = p1.x + (p2.x - p0.x) * alpha / 3;
    const cp1y = p1.y + (p2.y - p0.y) * alpha / 3;
    const cp2x = p2.x - (p3.x - p1.x) * alpha / 3;
    const cp2y = p2.y - (p3.y - p1.y) * alpha / 3;
    // Subdivide each segment into 4 intermediate points (flatten spline to polyline)
    if (i < resampled.length - 1) {
      for (let j = 0; j <= 4; j++) {
        const u = j / 4;
        const u2 = u*u, u3 = u2*u;
        const b = 1-u, b2 = b*b, b3 = b2*b;
        out.push({
          x: b3*p1.x + 3*b2*u*cp1x + 3*b*u2*cp2x + u3*p2.x,
          y: b3*p1.y + 3*b2*u*cp1y + 3*b*u2*cp2y + u3*p2.y,
        });
      }
    }
  }
  return out.length > 0 ? out : resampled;
}

const FIELD_COLOR = "#2d6a4f";
const LINE_COLOR = "rgba(255,255,255,0.85)";
const PLAYER_COLOR = "#1565c0";
const PLAYER_BORDER = "#ffffff";
const OPPONENT_COLOR = "#c62828";
const OPPONENT_BORDER = "#ffffff";
const BALL_COLOR = "#f5f5f5";
const CONE_COLOR = "#ff6d00";
const DRAW_COLOR = "#facc15";
const LINE_STRAIGHT_COLOR = "#ffffff";
const ARROW_COLOR = "#38bdf8";
const BEZIER_LINE_COLOR = "#ffffff";
const BEZIER_ARROW_COLOR = "#38bdf8";
const HANDLE_ENDPOINT = "#22d3ee";
const HANDLE_CTRL = "#f97316";

function uid() {
  return Math.random().toString(36).slice(2);
}

function drawFieldLandscape(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const r = (v: number) => Math.round(v);
  ctx.fillStyle = FIELD_COLOR;
  ctx.fillRect(0, 0, W, H);
  const stripes = 8;
  const stripeW = W / stripes;
  for (let i = 0; i < stripes; i++) {
    if (i % 2 === 0) { ctx.fillStyle = "rgba(0,0,0,0.06)"; ctx.fillRect(r(i * stripeW), 0, r(stripeW), H); }
  }
  ctx.setLineDash([]); ctx.lineCap = "butt"; ctx.lineJoin = "miter";
  ctx.strokeStyle = LINE_COLOR; ctx.lineWidth = 2;
  // Real pitch: 105m × 68m
  const pad = 24, fw = r(W - pad * 2), fh = r(H - pad * 2), fx = r(pad), fy = r(pad);
  ctx.strokeRect(fx, fy, fw, fh);
  // Centre line + circle (r=9.15m → 13.5% of 68m height)
  ctx.beginPath(); ctx.moveTo(r(fx + fw / 2), fy); ctx.lineTo(r(fx + fw / 2), fy + fh); ctx.stroke();
  ctx.beginPath(); ctx.arc(r(fx + fw / 2), r(fy + fh / 2), r(fh * 0.135), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = LINE_COLOR;
  ctx.beginPath(); ctx.arc(r(fx + fw / 2), r(fy + fh / 2), 3, 0, Math.PI * 2); ctx.fill();
  // Penalty areas: depth 16.5m (15.7% of 105), width 40.32m (59.3% of 68)
  const paW = r(fw * 0.157), paH = r(fh * 0.593);
  ctx.strokeRect(fx, r(fy + (fh - paH) / 2), paW, paH);
  // Goal areas: 5.5m × 18.32m → 5.2% × 26.9%
  const gaW = r(fw * 0.052), gaH = r(fh * 0.269);
  ctx.strokeRect(fx, r(fy + (fh - gaH) / 2), gaW, gaH);
  // Left penalty spot (11m = 10.5% of 105) + arc
  ctx.fillStyle = LINE_COLOR;
  ctx.beginPath(); ctx.arc(r(fx + fw * 0.105), r(fy + fh / 2), 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(r(fx + fw * 0.105), r(fy + fh / 2), r(fh * 0.135), -Math.PI * 0.37, Math.PI * 0.37); ctx.stroke();
  // Right penalty area + goal area
  ctx.strokeRect(r(fx + fw - paW), r(fy + (fh - paH) / 2), paW, paH);
  ctx.strokeRect(r(fx + fw - gaW), r(fy + (fh - gaH) / 2), gaW, gaH);
  ctx.fillStyle = LINE_COLOR;
  ctx.beginPath(); ctx.arc(r(fx + fw * 0.895), r(fy + fh / 2), 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(r(fx + fw * 0.895), r(fy + fh / 2), r(fh * 0.135), Math.PI * 0.63, Math.PI * 1.37); ctx.stroke();
  // Goals: 7.32m wide (10.8% of 68)
  const goalH = r(fh * 0.108), goalD = 10;
  ctx.strokeRect(fx - goalD, r(fy + (fh - goalH) / 2), goalD, goalH);
  ctx.strokeRect(fx + fw, r(fy + (fh - goalH) / 2), goalD, goalH);
  const cr = 12;
  [[fx, fy, 0, Math.PI/2], [fx+fw, fy, Math.PI/2, Math.PI], [fx+fw, fy+fh, Math.PI, 1.5*Math.PI], [fx, fy+fh, 1.5*Math.PI, 2*Math.PI]].forEach(([cx, cy, sa, ea]) => {
    ctx.beginPath(); ctx.arc(cx as number, cy as number, cr, sa as number, ea as number); ctx.stroke();
  });
}

function drawFieldPortrait(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const r = (v: number) => Math.round(v);
  ctx.fillStyle = FIELD_COLOR;
  ctx.fillRect(0, 0, W, H);
  const stripes = 10;
  const stripeH = H / stripes;
  for (let i = 0; i < stripes; i++) {
    if (i % 2 === 0) { ctx.fillStyle = "rgba(0,0,0,0.06)"; ctx.fillRect(0, r(i * stripeH), W, r(stripeH)); }
  }
  ctx.strokeStyle = LINE_COLOR; ctx.lineWidth = 2; ctx.setLineDash([]);
  // Real pitch rotated: 105m tall, 68m wide
  const pad = 14;
  const fx = r(pad), fy = r(pad), fw = r(W - pad * 2), fh = r(H - pad * 2);

  ctx.strokeRect(fx, fy, fw, fh);
  // Centre line + circle (r=9.15m → 13.5% of 68m width)
  ctx.beginPath(); ctx.moveTo(fx, r(fy + fh / 2)); ctx.lineTo(fx + fw, r(fy + fh / 2)); ctx.stroke();
  ctx.beginPath(); ctx.arc(r(fx + fw / 2), r(fy + fh / 2), r(fw * 0.135), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = LINE_COLOR;
  ctx.beginPath(); ctx.arc(r(fx + fw / 2), r(fy + fh / 2), 3, 0, Math.PI * 2); ctx.fill();

  // Top penalty area: 16.5m deep (15.7% of 105), 40.32m wide (59.3% of 68)
  const paDepth = r(fh * 0.157);
  const paWidth = r(fw * 0.593);
  const paLeft = r(fx + (fw - paWidth) / 2);
  ctx.strokeRect(paLeft, fy, paWidth, paDepth);

  // Top goal area: 5.5m × 18.32m → 5.2% × 26.9%
  const gaDepth = r(fh * 0.052);
  const gaWidth = r(fw * 0.269);
  const gaLeft = r(fx + (fw - gaWidth) / 2);
  ctx.strokeRect(gaLeft, fy, gaWidth, gaDepth);

  // Top penalty spot (11m = 10.5% of 105) + arc
  ctx.fillStyle = LINE_COLOR;
  ctx.beginPath(); ctx.arc(r(fx + fw / 2), r(fy + fh * 0.105), 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(r(fx + fw / 2), r(fy + fh * 0.105), r(fw * 0.135), Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();

  // Bottom penalty area + goal area
  ctx.strokeRect(paLeft, fy + fh - paDepth, paWidth, paDepth);
  ctx.strokeRect(gaLeft, fy + fh - gaDepth, gaWidth, gaDepth);

  // Bottom penalty spot + arc
  ctx.fillStyle = LINE_COLOR;
  ctx.beginPath(); ctx.arc(r(fx + fw / 2), r(fy + fh * 0.895), 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(r(fx + fw / 2), r(fy + fh * 0.895), r(fw * 0.135), -Math.PI * 0.85, -Math.PI * 0.15); ctx.stroke();

  // Goals: 7.32m wide (10.8% of 68)
  const goalW = r(fw * 0.108);
  const goalD = 12;
  const goalLeft = r(fx + (fw - goalW) / 2);
  ctx.strokeRect(goalLeft, fy - goalD, goalW, goalD);
  ctx.strokeRect(goalLeft, fy + fh, goalW, goalD);

  const cr = 10;
  [[fx, fy, 0, Math.PI/2], [fx+fw, fy, Math.PI/2, Math.PI], [fx+fw, fy+fh, Math.PI, 1.5*Math.PI], [fx, fy+fh, 1.5*Math.PI, 2*Math.PI]].forEach(([cx, cy, sa, ea]) => {
    ctx.beginPath(); ctx.arc(cx as number, cy as number, cr, sa as number, ea as number); ctx.stroke();
  });
}

function drawFieldOnCanvas(ctx: CanvasRenderingContext2D, W: number, H: number) {
  if (H > W * 1.1) {
    drawFieldPortrait(ctx, W, H);
  } else {
    drawFieldLandscape(ctx, W, H);
  }
}

function renderDrawPath(ctx: CanvasRenderingContext2D, points: Point[], shape: string, color: string, lw: number, arrowEnd: string) {
  if (points.length < 2) return;
  const p0 = points[0];
  const pN = points[points.length - 1];
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([]);

  const isDashed = shape.includes('dashed');
  if (isDashed) ctx.setLineDash([8, 5]);

  if (shape === 'bezier-solid' || shape === 'bezier-dashed') {
    // Live drag preview: simple line from start to current (bezier element handles the real curve)
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(pN.x, pN.y); ctx.stroke();
  } else if (shape === 'straight-solid' || shape === 'straight-dashed') {
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(pN.x, pN.y); ctx.stroke();
  } else if (shape === 'arc-wavy') {
    ctx.setLineDash([]);
    ctx.beginPath();
    const steps = 40;
    const dx = pN.x - p0.x; const dy = pN.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * 15; const ny = dx / len * 15;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const bx = p0.x + dx * t + nx * Math.sin(t * Math.PI * 4);
      const by = p0.y + dy * t + ny * Math.sin(t * Math.PI * 4);
      i === 0 ? ctx.moveTo(bx, by) : ctx.lineTo(bx, by);
    }
    ctx.stroke();
  } else if (shape === 'arc-wavy-dashed') {
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    const steps2 = 40;
    const dx2 = pN.x - p0.x; const dy2 = pN.y - p0.y;
    const len2 = Math.hypot(dx2, dy2) || 1;
    const nx2 = -dy2 / len2 * 15; const ny2 = dx2 / len2 * 15;
    for (let i = 0; i <= steps2; i++) {
      const t = i / steps2;
      const bx = p0.x + dx2 * t + nx2 * Math.sin(t * Math.PI * 4);
      const by = p0.y + dy2 * t + ny2 * Math.sin(t * Math.PI * 4);
      i === 0 ? ctx.moveTo(bx, by) : ctx.lineTo(bx, by);
    }
    ctx.stroke();
  } else if (shape === 'rect-outline' || shape === 'rect-dashed') {
    ctx.strokeRect(Math.min(p0.x, pN.x), Math.min(p0.y, pN.y), Math.abs(pN.x - p0.x), Math.abs(pN.y - p0.y));
  } else if (shape === 'rect-filled') {
    ctx.setLineDash([]);
    ctx.fillRect(Math.min(p0.x, pN.x), Math.min(p0.y, pN.y), Math.abs(pN.x - p0.x), Math.abs(pN.y - p0.y));
  } else if (shape === 'circle-outline' || shape === 'circle-dashed') {
    const rx = Math.abs(pN.x - p0.x) / 2; const ry = Math.abs(pN.y - p0.y) / 2;
    const cx = Math.min(p0.x, pN.x) + rx; const cy = Math.min(p0.y, pN.y) + ry;
    ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2); ctx.stroke();
  } else if (shape === 'circle-filled') {
    ctx.setLineDash([]);
    const rx = Math.abs(pN.x - p0.x) / 2; const ry = Math.abs(pN.y - p0.y) / 2;
    const cx = Math.min(p0.x, pN.x) + rx; const cy = Math.min(p0.y, pN.y) + ry;
    ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Arrow ends — open V (two lines, no fill)
  if (arrowEnd !== 'none') {
    const headLen = 16;
    ctx.strokeStyle = color;
    ctx.setLineDash([]);
    ctx.lineCap = "round";
    if (arrowEnd === 'end' || arrowEnd === 'both') {
      const prev = points[points.length - 2] ?? p0;
      const angle = Math.atan2(pN.y - prev.y, pN.x - prev.x);
      ctx.beginPath();
      ctx.moveTo(pN.x - headLen * Math.cos(angle - Math.PI / 6), pN.y - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(pN.x, pN.y);
      ctx.lineTo(pN.x - headLen * Math.cos(angle + Math.PI / 6), pN.y - headLen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    }
    if (arrowEnd === 'start' || arrowEnd === 'both') {
      const next = points[1] ?? pN;
      const angle = Math.atan2(p0.y - next.y, p0.x - next.x);
      ctx.beginPath();
      ctx.moveTo(p0.x - headLen * Math.cos(angle - Math.PI / 6), p0.y - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(p0.x, p0.y);
      ctx.lineTo(p0.x - headLen * Math.cos(angle + Math.PI / 6), p0.y - headLen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    }
  }
}

function drawElements(ctx: CanvasRenderingContext2D, elements: BoardElement[], playerRadius = 14) {
  elements.forEach((el) => {
    // Apply scale/scaleX/scaleY for equipment elements that have it
    const EQUIP_TYPES = ["ball","cone","goal","goalLarge","disc","cinesino","sagoma","flag","ladder","hurdle","pole","vest"];
    const isEquipEl = EQUIP_TYPES.includes(el.type);
    const sx = (el.scaleX ?? 1) * (el.scale ?? 1);
    const sy = (el.scaleY ?? 1) * (el.scale ?? 1);
    const hasTransform = isEquipEl && (sx !== 1 || sy !== 1) && el.x !== undefined && el.y !== undefined;
    if (hasTransform) {
      ctx.save();
      ctx.translate(el.x!, el.y!);
      ctx.scale(sx, sy);
      ctx.translate(-el.x!, -el.y!);
    }

    if ((el.type === "player" || el.type === "opponent") && el.x !== undefined && el.y !== undefined) {
      const isPlayer = el.type === "player";
      const r = playerRadius;

      // Shadow
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;

      ctx.fillStyle = isPlayer ? PLAYER_COLOR : OPPONENT_COLOR;
      ctx.beginPath();
      ctx.arc(el.x, el.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      ctx.strokeStyle = isPlayer ? PLAYER_BORDER : OPPONENT_BORDER;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(el.x, el.y, r, 0, Math.PI * 2);
      ctx.stroke();

      if (el.label) {
        ctx.fillStyle = "white";
        ctx.font = "bold 10px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(el.label, el.x, el.y);
      }
    }

    if (el.type === "ball" && el.x !== undefined && el.y !== undefined) {
      const ec = el.equipColor;
      ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      ctx.fillStyle = ec ?? BALL_COLOR;
      ctx.beginPath(); ctx.arc(el.x, el.y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = ec ? "rgba(0,0,0,0.5)" : "#333";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(el.x, el.y, 8, 0, Math.PI * 2); ctx.stroke();
    }

    if (el.type === "cone" && el.x !== undefined && el.y !== undefined) {
      const ec = el.equipColor;
      ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      ctx.fillStyle = ec ?? CONE_COLOR;
      ctx.beginPath();
      ctx.moveTo(el.x, el.y - 10); ctx.lineTo(el.x + 8, el.y + 8); ctx.lineTo(el.x - 8, el.y + 8);
      ctx.closePath(); ctx.fill();
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    }

    if (el.type === "goalkeeper" && el.x !== undefined && el.y !== undefined) {
      const r = playerRadius;
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(el.x, el.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = "#92400e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(el.x, el.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "white";
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("P", el.x, el.y);
    }

    if (el.type === "goal" && el.x !== undefined && el.y !== undefined) {
      const gw = 48, gh = 22;
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 2;
      ctx.strokeStyle = "white";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeRect(el.x - gw / 2, el.y - gh / 2, gw, gh);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      // Net lines inside
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      const steps = 3;
      for (let i = 1; i <= steps; i++) {
        const nx = el.x - gw / 2 + (gw / (steps + 1)) * i;
        ctx.beginPath();
        ctx.moveTo(nx, el.y - gh / 2);
        ctx.lineTo(nx, el.y + gh / 2);
        ctx.stroke();
      }
    }

    // ── goalLarge: big goal with net ──────────────────────────────────
    if (el.type === "goalLarge" && el.x !== undefined && el.y !== undefined) {
      const gw = 64, gh = 30;
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
      ctx.strokeStyle = "#aaaaaa"; ctx.lineWidth = 3;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeRect(el.x - gw / 2, el.y - gh / 2, gw, gh);
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = "rgba(180,180,180,0.45)"; ctx.lineWidth = 1;
      const cols = 5;
      for (let i = 1; i < cols; i++) {
        const nx = el.x - gw / 2 + (gw / cols) * i;
        ctx.beginPath(); ctx.moveTo(nx, el.y - gh / 2); ctx.lineTo(nx, el.y + gh / 2); ctx.stroke();
      }
      const rows = 3;
      for (let i = 1; i < rows; i++) {
        const ny = el.y - gh / 2 + (gh / rows) * i;
        ctx.beginPath(); ctx.moveTo(el.x - gw / 2, ny); ctx.lineTo(el.x + gw / 2, ny); ctx.stroke();
      }
    }

    // ── disc ─────────────────────────────────────────────────────────
    if (el.type === "disc" && el.x !== undefined && el.y !== undefined) {
      const ec = el.equipColor ?? "#ef4444";
      ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      ctx.fillStyle = ec;
      ctx.beginPath(); ctx.ellipse(el.x, el.y, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(el.x, el.y, 14, 7, 0, 0, Math.PI * 2); ctx.stroke();
    }

    // ── cinesino ──────────────────────────────────────────────────────
    if (el.type === "cinesino" && el.x !== undefined && el.y !== undefined) {
      const ec = el.equipColor ?? "#eab308";
      ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      ctx.fillStyle = ec;
      ctx.beginPath();
      ctx.moveTo(el.x - 10, el.y + 4); ctx.lineTo(el.x + 10, el.y + 4);
      ctx.lineTo(el.x + 6, el.y - 3); ctx.lineTo(el.x - 6, el.y - 3);
      ctx.closePath(); ctx.fill();
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(el.x - 10, el.y + 4); ctx.lineTo(el.x + 10, el.y + 4);
      ctx.lineTo(el.x + 6, el.y - 3); ctx.lineTo(el.x - 6, el.y - 3); ctx.closePath(); ctx.stroke();
    }

    // ── sagoma ────────────────────────────────────────────────────────
    if (el.type === "sagoma" && el.x !== undefined && el.y !== undefined) {
      const ec = el.equipColor ?? "#2563eb";
      ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
      ctx.fillStyle = ec;
      ctx.beginPath(); ctx.arc(el.x, el.y - 13, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(el.x - 5, el.y - 8, 10, 12);
      ctx.fillRect(el.x - 5, el.y + 4, 3.5, 9);
      ctx.fillRect(el.x + 1.5, el.y + 4, 3.5, 9);
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    }

    // ── flag ──────────────────────────────────────────────────────────
    if (el.type === "flag" && el.x !== undefined && el.y !== undefined) {
      const ec = el.equipColor ?? "#f97316";
      ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      ctx.strokeStyle = "#92400e"; ctx.lineWidth = 2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(el.x, el.y + 12); ctx.lineTo(el.x, el.y - 12); ctx.stroke();
      ctx.fillStyle = ec;
      ctx.beginPath();
      ctx.moveTo(el.x, el.y - 12); ctx.lineTo(el.x + 12, el.y - 6); ctx.lineTo(el.x, el.y); ctx.closePath(); ctx.fill();
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    }

    // ── ladder ────────────────────────────────────────────────────────
    if (el.type === "ladder" && el.x !== undefined && el.y !== undefined) {
      const ec = el.equipColor ?? "#1f2937";
      ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      ctx.strokeStyle = ec; ctx.lineWidth = 2; ctx.lineCap = "round";
      const lw = 30, lh = 14, rungs = 4;
      ctx.beginPath(); ctx.moveTo(el.x - lw/2, el.y - lh/2); ctx.lineTo(el.x - lw/2, el.y + lh/2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(el.x + lw/2, el.y - lh/2); ctx.lineTo(el.x + lw/2, el.y + lh/2); ctx.stroke();
      for (let r = 0; r <= rungs; r++) {
        const ry = el.y - lh/2 + (lh / rungs) * r;
        ctx.beginPath(); ctx.moveTo(el.x - lw/2, ry); ctx.lineTo(el.x + lw/2, ry); ctx.stroke();
      }
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    }

    // ── hurdle ────────────────────────────────────────────────────────
    if (el.type === "hurdle" && el.x !== undefined && el.y !== undefined) {
      const ec = el.equipColor ?? "#dc2626";
      ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      ctx.strokeStyle = ec; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(el.x - 12, el.y + 8); ctx.lineTo(el.x - 12, el.y - 2);
      ctx.arc(el.x, el.y - 2, 12, Math.PI, 0, false);
      ctx.lineTo(el.x + 12, el.y + 8); ctx.stroke();
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    }

    // ── pole ──────────────────────────────────────────────────────────
    if (el.type === "pole" && el.x !== undefined && el.y !== undefined) {
      const ec = el.equipColor ?? "#eab308";
      ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      ctx.strokeStyle = ec; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(el.x, el.y + 14); ctx.lineTo(el.x, el.y - 14); ctx.stroke();
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    }

    // ── vest ──────────────────────────────────────────────────────────
    if (el.type === "vest" && el.x !== undefined && el.y !== undefined) {
      const ec = el.equipColor ?? "#eab308";
      ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
      ctx.fillStyle = ec;
      ctx.beginPath();
      ctx.moveTo(el.x - 10, el.y - 4); ctx.lineTo(el.x - 10, el.y + 10);
      ctx.lineTo(el.x + 10, el.y + 10); ctx.lineTo(el.x + 10, el.y - 4);
      ctx.lineTo(el.x + 5, el.y - 10); ctx.lineTo(el.x + 4, el.y - 4);
      ctx.lineTo(el.x - 4, el.y - 4); ctx.lineTo(el.x - 5, el.y - 10);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(el.x - 10, el.y - 4); ctx.lineTo(el.x - 15, el.y + 2); ctx.lineTo(el.x - 10, el.y + 4); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(el.x + 10, el.y - 4); ctx.lineTo(el.x + 15, el.y + 2); ctx.lineTo(el.x + 10, el.y + 4); ctx.closePath(); ctx.fill();
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    }

    if (el.type === "text" && el.x !== undefined && el.y !== undefined && el.label) {
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 4;
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "white";
      ctx.fillText(el.label, el.x, el.y);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }

    if (el.type === "path" && el.points && el.points.length > 1) {
      renderDrawPath(ctx, el.points, el.drawShape ?? 'freehand-solid', el.color ?? DRAW_COLOR, el.lineWidth ?? 2.5, el.arrowEnd ?? 'none');
    }

    if (el.type === "line" && el.points && el.points.length >= 2) {
      const start = el.points[0];
      const end = el.points[el.points.length - 1];
      ctx.strokeStyle = el.color ?? LINE_STRAIGHT_COLOR;
      ctx.lineWidth = el.lineWidth ?? 2.5;
      ctx.lineCap = "round";
      if (!el.color) ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if ((el.type === "bezier" || el.type === "bezierarrow") && el.points && el.points.length === 4) {
      const [p0, cp1, cp2, p3] = el.points;
      ctx.lineWidth = el.lineWidth ?? 2.5;
      ctx.lineCap = "round";

      if (el.drawShape) {
        // Draw-tool bezier: use element's color and dash style
        ctx.strokeStyle = el.color ?? '#ffffff';
        if (el.drawShape === 'bezier-dashed') ctx.setLineDash([8, 5]);
        else ctx.setLineDash([]);
      } else {
        // Legacy bezier/bezierarrow
        const color = el.type === "bezier" ? BEZIER_LINE_COLOR : BEZIER_ARROW_COLOR;
        ctx.strokeStyle = color;
        if (el.type === "bezier") ctx.setLineDash([6, 4]);
        else ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p3.x, p3.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrow for legacy bezierarrow — open V
      if (!el.drawShape && el.type === "bezierarrow") {
        const angle = Math.atan2(p3.y - cp2.y, p3.x - cp2.x);
        const headLen = 16;
        ctx.strokeStyle = BEZIER_ARROW_COLOR;
        ctx.lineCap = "round";
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(p3.x - headLen * Math.cos(angle - Math.PI / 6), p3.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p3.x - headLen * Math.cos(angle + Math.PI / 6), p3.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }

      // Arrow ends for draw-tool bezier — open V
      if (el.drawShape && el.arrowEnd && el.arrowEnd !== 'none') {
        const headLen = 16;
        ctx.strokeStyle = el.color ?? '#ffffff';
        ctx.lineCap = "round";
        ctx.setLineDash([]);
        if (el.arrowEnd === 'end' || el.arrowEnd === 'both') {
          const angle = Math.atan2(p3.y - cp2.y, p3.x - cp2.x);
          ctx.beginPath();
          ctx.moveTo(p3.x - headLen * Math.cos(angle - Math.PI / 6), p3.y - headLen * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(p3.x, p3.y);
          ctx.lineTo(p3.x - headLen * Math.cos(angle + Math.PI / 6), p3.y - headLen * Math.sin(angle + Math.PI / 6));
          ctx.stroke();
        }
        if (el.arrowEnd === 'start' || el.arrowEnd === 'both') {
          const angle = Math.atan2(p0.y - cp1.y, p0.x - cp1.x);
          ctx.beginPath();
          ctx.moveTo(p0.x - headLen * Math.cos(angle - Math.PI / 6), p0.y - headLen * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(p0.x, p0.y);
          ctx.lineTo(p0.x - headLen * Math.cos(angle + Math.PI / 6), p0.y - headLen * Math.sin(angle + Math.PI / 6));
          ctx.stroke();
        }
      }
    }

    if (el.type === "arrow" && el.points && el.points.length >= 2) {
      const pts = el.points;
      const start = pts[0];
      const end = pts[pts.length - 1];

      ctx.strokeStyle = el.color ?? ARROW_COLOR;
      ctx.lineWidth = el.lineWidth ?? 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (pts.length > 2) {
        ctx.beginPath();
        pts.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }

      // Arrowhead — open V
      const dx = end.x - (pts[pts.length - 2]?.x ?? start.x);
      const dy = end.y - (pts[pts.length - 2]?.y ?? start.y);
      const angle = Math.atan2(dy, dx);
      const headLen = 16;
      ctx.strokeStyle = el.color ?? ARROW_COLOR;
      ctx.lineCap = "round";
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(end.x, end.y);
      ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    }

    if (hasTransform) ctx.restore();
  });
}

// Formation presets – landscape pitch (players go left half = our team)
function makeFormation(positions: [number, number][], W: number, H: number): BoardElement[] {
  const pad = 24;
  const fw = W - pad * 2;
  const fh = H - pad * 2;
  const fx = pad;
  const fy = pad;
  const isPortrait = H > W * 1.1;
  return positions.map(([px, py], i) => {
    // px = depth into field (0=goalkeeper ~0.06, forwards ~0.47)
    // py = lateral position (0=top, 1=bottom)
    let x: number, y: number;
    if (isPortrait) {
      // Portrait: our team in bottom half, attacking upward
      // lateral spread → x axis, depth → y axis (inverted so GK at bottom)
      x = fx + py * fw;
      y = fy + (1 - px) * fh;   // GK px≈0.06 → y near bottom; FWD px≈0.47 → y near center
    } else {
      // Landscape: our team on left half
      x = fx + px * fw;
      y = fy + py * fh;
    }
    return { id: uid(), type: "player" as const, x, y, label: String(i + 1) };
  });
}

const FORMATIONS: Record<string, [number, number][]> = {
  "4-3-3": [
    [0.06, 0.5],
    [0.2, 0.15], [0.2, 0.38], [0.2, 0.62], [0.2, 0.85],
    [0.36, 0.25], [0.36, 0.5], [0.36, 0.75],
    [0.45, 0.1], [0.45, 0.5], [0.45, 0.9],
  ],
  "4-4-2": [
    [0.06, 0.5],
    [0.2, 0.15], [0.2, 0.38], [0.2, 0.62], [0.2, 0.85],
    [0.34, 0.15], [0.34, 0.38], [0.34, 0.62], [0.34, 0.85],
    [0.45, 0.3], [0.45, 0.7],
  ],
  "4-2-3-1": [
    [0.06, 0.5],
    [0.2, 0.15], [0.2, 0.38], [0.2, 0.62], [0.2, 0.85],
    [0.32, 0.35], [0.32, 0.65],
    [0.4, 0.15], [0.4, 0.5], [0.4, 0.85],
    [0.47, 0.5],
  ],
  "3-5-2": [
    [0.06, 0.5],
    [0.2, 0.25], [0.2, 0.5], [0.2, 0.75],
    [0.32, 0.1], [0.34, 0.32], [0.34, 0.5], [0.34, 0.68], [0.32, 0.9],
    [0.45, 0.3], [0.45, 0.7],
  ],
};

const PHASES = [
  { value: "riscaldamento", label: "Riscaldamento" },
  { value: "tecnica", label: "Tecnica" },
  { value: "tattica", label: "Tattica" },
  { value: "fisico", label: "Fisico" },
  { value: "partita", label: "Partita" },
  { value: "defaticamento", label: "Defaticamento" },
];

const CATEGORIES = [
  { value: "warming_up", label: "Riscaldamento" },
  { value: "technical",  label: "Tecnico" },
  { value: "tactical",   label: "Tattico" },
  { value: "physical",   label: "Fisico" },
  { value: "game",       label: "Partita" },
  { value: "passing",    label: "Passaggi" },
  { value: "defending",  label: "Difesa" },
  { value: "recovery",   label: "Recupero" },
];

const PRINCIPI = [
  { value: "forza",           label: "FORZA" },
  { value: "resistenza",      label: "RESISTENZA" },
  { value: "tecnico_tattico", label: "TECNICO TATTICO" },
];

function emptyNewExForm(): NewExForm {
  return {
    title: "", category: "", teamId: "", principio: "", trainingDay: "",
    trainingPhase: "", durationMinutes: "", playersRequired: "",
    equipment: "", description: "", voiceNoteData: null, isDraft: false,
  };
}

function emptyDraftForm(ex?: Exercise): DraftForm {
  return {
    title: ex?.title ?? "",
    description: ex?.description ?? "",
    durationMinutes: ex?.durationMinutes != null ? String(ex.durationMinutes) : "",
    playersRequired: ex?.playersRequired != null ? String(ex.playersRequired) : "",
    equipment: ex?.equipment ?? "",
    trainingDay: ex?.trainingDay ?? "",
    trainingPhase: ex?.trainingPhase ?? "",
    isDraft: ex?.isDraft ?? true,
    voiceNoteData: ex?.voiceNoteData ?? null,
  };
}

export default function TacticalBoard() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);

  const [tool, setTool] = useState<ToolType | null>(null);
  const [openToolGroup, setOpenToolGroup] = useState<string | null>(null);
  const [elements, setElements] = useState<BoardElement[]>([]);
  const elementsRef = useRef<BoardElement[]>([]);
  useEffect(() => { elementsRef.current = elements; }, [elements]);
  const prevCanvasSizeRef = useRef({ w: 0, h: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [tacticName, setTacticName] = useState("");
  const [savedTactics, setSavedTactics] = useState<SavedTactic[]>(() => {
    try { return JSON.parse(localStorage.getItem("ftb-tactics") || "[]"); } catch { return []; }
  });
  const [showLoad, setShowLoad] = useState(false);
  const [showExercises, setShowExercises] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ w: 900, h: 500 });
  const [playerCounter, setPlayerCounter] = useState(1);
  const [opponentCounter, setOpponentCounter] = useState(1);

  // Draw tool settings
  const [drawShape, setDrawShape] = useState('bezier-solid');
  const [drawArrowEnd, setDrawArrowEnd] = useState<'none' | 'end' | 'start' | 'both'>('none');
  const [drawColor, setDrawColor] = useState('#ffffff');
  const [showLineTypePanel, setShowLineTypePanel] = useState(false);
  const [showColorPanel, setShowColorPanel] = useState(false);

  // Refs so render callback always has fresh draw settings (avoids stale closure)
  const drawShapeRef = useRef('freehand-solid');
  useEffect(() => { drawShapeRef.current = drawShape; }, [drawShape]);
  const drawColorRef = useRef('#ffffff');
  useEffect(() => { drawColorRef.current = drawColor; }, [drawColor]);
  const drawArrowEndRef = useRef<string>('none');
  useEffect(() => { drawArrowEndRef.current = drawArrowEnd; }, [drawArrowEnd]);

  const DRAW_COLORS = [
    { hex: '#ffffff', name: 'Bianco' },
    { hex: '#facc15', name: 'Giallo' },
    { hex: '#f87171', name: 'Rosso' },
    { hex: '#4ade80', name: 'Verde' },
    { hex: '#60a5fa', name: 'Blu' },
    { hex: '#f97316', name: 'Arancio' },
    { hex: '#c084fc', name: 'Viola' },
    { hex: '#000000', name: 'Nero' },
  ];

  const DRAW_TYPES: Array<{ id: string; svg: React.ReactNode; label: string }> = [
    // Row 1: freehand + bezier solid
    { id: 'freehand-solid', label: 'Libero', svg: <path d="M 5,30 C 12,18 18,34 25,20 C 32,8 38,28 45,20 C 50,14 54,22 56,18" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/> },
    { id: 'bezier-solid', label: 'Curva', svg: <path d="M 5,25 C 15,5 25,40 35,20 C 45,5 55,25 55,25" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"/> },
    { id: 'bezier-dashed', label: 'Curva —', svg: <path d="M 5,25 C 15,5 25,40 35,20 C 45,5 55,25 55,25" fill="none" stroke="white" strokeWidth="2.5" strokeDasharray="5 3" strokeLinecap="round"/> },
    { id: 'straight-solid', label: 'Retta', svg: <line x1="5" y1="32" x2="55" y2="12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/> },
    { id: 'straight-dashed', label: 'Retta —', svg: <line x1="5" y1="32" x2="55" y2="12" stroke="white" strokeWidth="2.5" strokeDasharray="5 3" strokeLinecap="round"/> },
    { id: 'arc-wavy', label: 'Onda', svg: <path d="M 5,22 C 15,5 20,38 30,22 C 40,5 45,38 55,22" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"/> },
    { id: 'arc-wavy-dashed', label: 'Onda —', svg: <path d="M 5,22 C 15,5 20,38 30,22 C 40,5 45,38 55,22" fill="none" stroke="white" strokeWidth="2.5" strokeDasharray="5 3" strokeLinecap="round"/> },
    { id: 'rect-outline', label: 'Rettangolo', svg: <rect x="8" y="10" width="44" height="24" fill="none" stroke="white" strokeWidth="2.5" rx="1"/> },
    { id: 'rect-dashed', label: 'Rett. —', svg: <rect x="8" y="10" width="44" height="24" fill="none" stroke="white" strokeWidth="2.5" strokeDasharray="5 3" rx="1"/> },
    { id: 'rect-filled', label: 'Rett. pieno', svg: <rect x="8" y="10" width="44" height="24" fill="white" rx="1"/> },
    { id: 'circle-outline', label: 'Cerchio', svg: <circle cx="30" cy="22" r="14" fill="none" stroke="white" strokeWidth="2.5"/> },
    { id: 'circle-dashed', label: 'Cerchio —', svg: <circle cx="30" cy="22" r="14" fill="none" stroke="white" strokeWidth="2.5" strokeDasharray="5 3"/> },
    { id: 'circle-filled', label: 'Cerchio pieno', svg: <circle cx="30" cy="22" r="14" fill="white"/> },
  ];

  const [history, setHistory] = useState<BoardElement[][]>([]);
  const [redoStack, setRedoStack] = useState<BoardElement[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragHandle, setDragHandle] = useState<DragHandle | null>(null);
  const pathMoveStartRef = useRef<{ origPoints: Point[]; startPos: Point } | null>(null);

  // Element drag-to-move on canvas
  const [dragElement, setDragElement] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);

  // Drag from palette (desktop HTML5 drag API)
  const draggedToolRef = useRef<ToolType | null>(null);

  // Mobile layout detection
  const [isMobile, setIsMobile] = useState(false);

  // Mobile touch drag from palette ─────────────────────────────────────────
  // { tool, touchId, startMoved } – stored in a ref to avoid stale closures in listeners
  const touchPaletteDragRef = useRef<{ tool: ToolType; touchId: number; startMoved: boolean } | null>(null);
  const [touchGhostTool, setTouchGhostTool] = useState<{ tool: ToolType; x: number; y: number } | null>(null);
  // Tracks a pending "tap-to-place" for placement tools (doesn't block scroll until finger lifts)
  const touchPlacePendingRef = useRef<{ canvasPos: { x: number; y: number }; screenX: number; screenY: number; cancelled: boolean } | null>(null);
  // Refs that stay current inside the global touch listener (no stale closure)
  const playerCounterRef = useRef(playerCounter);
  useEffect(() => { playerCounterRef.current = playerCounter; }, [playerCounter]);
  const opponentCounterRef = useRef(opponentCounter);
  useEffect(() => { opponentCounterRef.current = opponentCounter; }, [opponentCounter]);

  // Canvas touch — non-passive native listeners (React synthetic events are passive for touchmove)
  const canvasTouchActiveRef = useRef(false); // true when canvas captured this gesture
  // Callbacks stored in a ref so native listeners always call the latest version without stale closures
  const canvasTouchHandlers = useRef({
    onStart: (_e: TouchEvent) => {},
    onMove: (_e: TouchEvent) => {},
    onEnd: (_e: TouchEvent) => {},
  });

  // Azioni in movimento (animation frames)
  const [frames, setFrames] = useState<BoardElement[][]>([]);
  const [currentFrame, setCurrentFrame] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showFramePanel, setShowFramePanel] = useState(false);

  // Draft panel
  const [activeDraft, setActiveDraft] = useState<Exercise | null>(null);
  const [draftForm, setDraftForm] = useState<DraftForm>(emptyDraftForm());
  const [isSaving, setIsSaving] = useState(false);

  // New exercise panel (below board)
  const [showNewExForm, setShowNewExForm] = useState(false);
  const [newExForm, setNewExForm] = useState<NewExForm>(emptyNewExForm());
  const [isCreating, setIsCreating] = useState(false);

  // Right panel (collapsible detail panel)
  const [showRightPanel, setShowRightPanel] = useState(true);

  // Mobile-specific UI state
  const [showMobileFormations, setShowMobileFormations] = useState(false);
  const [showMobileSettings, setShowMobileSettings] = useState(false);

  // T002 – Panel overlay / delete confirm
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // T003 – Folder / save menus
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [showSaveMenu, setShowSaveMenu] = useState(false);

  // T004 – Draw thickness
  const [drawLineWidth, setDrawLineWidth] = useState(2.5);
  const drawLineWidthRef = useRef(2.5);
  useEffect(() => { drawLineWidthRef.current = drawLineWidth; }, [drawLineWidth]);
  const [showThicknessPanel, setShowThicknessPanel] = useState(false);

  // T005 – Settings panel
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Settings sub-states
  const [settingsTab, setSettingsTab] = useState<'campo'|'giocatori'|'squadre'>('campo');
  const [settingsTema, setSettingsTema] = useState<'auto'|'light'|'dark'>('auto');
  const [settingsOrientation, setSettingsOrientation] = useState<'auto'|'portrait'|'landscape'>('auto');
  const [fieldBgColor, setFieldBgColor] = useState("#2d6a4f");
  const [fieldType, setFieldType] = useState<'full'|'half-top'|'half-bottom'|'half-left'|'half-right'>('full');
  const [showPlayerName, setShowPlayerName] = useState(false);
  const [showPlayerRole, setShowPlayerRole] = useState(false);
  const [showPlayerDirection, setShowPlayerDirection] = useState(false);
  const [playerElementSize, setPlayerElementSize] = useState(14); // radius in px

  // T006/T007 – Element context menu + player edit modal + confirm delete
  const [elementCtxMenu, setElementCtxMenu] = useState<{ id: string; x: number; y: number; type: string } | null>(null);
  const [playerEditId, setPlayerEditId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmDeleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctxDismissRef = useRef(false);

  // T008 – Teams sub-toolbar
  const [showTeamsSubbar, setShowTeamsSubbar] = useState(false);

  // Equipment sub-toolbar (materiale)
  const [showEquipSubbar, setShowEquipSubbar] = useState(false);

  // Squadre C/D active state (settings)
  const [activeTeamC, setActiveTeamC] = useState(false);
  const [activeTeamD, setActiveTeamD] = useState(false);

  // Equipment selection + resize
  const [selectedEquipId, setSelectedEquipId] = useState<string | null>(null);
  const [globalEquipColor, setGlobalEquipColor] = useState<string | null>(null);
  const [showEquipColorBar, setShowEquipColorBar] = useState(false);

  // Refs to read settings inside render (avoids stale closure)
  const showPlayerNameRef    = useRef(false);
  const showPlayerRoleRef    = useRef(false);
  const showPlayerDirectionRef = useRef(false);
  const playerElementSizeRef = useRef(14);
  const selectedEquipIdRef   = useRef<string | null>(null);
  const globalEquipColorRef  = useRef<string | null>(null);

  // Equipment resize drag state
  const equipResizeDragRef = useRef<{
    handle: "right" | "bottom" | "corner";
    elId: string;
    startPos: Point;
    startBBoxW: number;
    startBBoxH: number;
    startScaleX: number;
    startScaleY: number;
  } | null>(null);

  const { data: exercises = [] } = useQuery<Exercise[]>({
    queryKey: ["/api/exercises"],
    queryFn: async () => {
      const res = await fetch("/api/exercises", { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const { data: myTeams = [] } = useQuery<MyTeam[]>({
    queryKey: ["/api/exercises/my-teams"],
    queryFn: async () => {
      const res = await fetch("/api/exercises/my-teams", { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  // Resize canvas to fill the container exactly (no distortion)
  // When the canvas size changes, rescale all existing element coordinates proportionally
  useEffect(() => {
    const obs = new ResizeObserver(() => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setIsMobile(rect.width < 640);
        const topBarH = 56;
        const bottomBarH = 56;
        const marginH = 8;
        const marginW = 16;
        const w = Math.max(300, rect.width - marginW);
        const h = Math.max(300, rect.height - topBarH - bottomBarH - marginH);
        const prev = prevCanvasSizeRef.current;
        if (prev.w > 0 && prev.h > 0 && (Math.abs(prev.w - w) > 1 || Math.abs(prev.h - h) > 1)) {
          const sx = w / prev.w;
          const sy = h / prev.h;
          setElements(els => els.map(el => ({
            ...el,
            x: el.x !== undefined ? el.x * sx : undefined,
            y: el.y !== undefined ? el.y * sy : undefined,
            points: el.points ? el.points.map(p => ({ x: p.x * sx, y: p.y * sy })) : undefined,
          })));
        }
        prevCanvasSizeRef.current = { w, h };
        setCanvasSize({ w, h });
      }
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Keep display refs in sync with state (used inside render)
  useEffect(() => { showPlayerNameRef.current    = showPlayerName; },    [showPlayerName]);
  useEffect(() => { showPlayerRoleRef.current    = showPlayerRole; },    [showPlayerRole]);
  useEffect(() => { showPlayerDirectionRef.current = showPlayerDirection; }, [showPlayerDirection]);
  useEffect(() => { playerElementSizeRef.current = playerElementSize; }, [playerElementSize]);
  useEffect(() => { selectedEquipIdRef.current   = selectedEquipId; },  [selectedEquipId]);
  useEffect(() => { globalEquipColorRef.current  = globalEquipColor; }, [globalEquipColor]);

  // Helper: bounding box for any equipment element (in logical canvas px)
  const getEquipBBox = useCallback((el: BoardElement): { x: number; y: number; w: number; h: number } | null => {
    if (el.x === undefined || el.y === undefined) return null;
    const BASE: Record<string, { w: number; h: number }> = {
      ball:      { w: 16, h: 16 }, cone:     { w: 16, h: 22 }, goal:  { w: 48, h: 22 },
      goalLarge: { w: 64, h: 30 }, disc:     { w: 28, h: 14 }, cinesino: { w: 28, h: 16 },
      sagoma:    { w: 20, h: 30 }, flag:     { w: 14, h: 26 }, ladder: { w: 40, h: 20 },
      hurdle:    { w: 28, h: 20 }, pole:     { w:  8, h: 28 }, vest:  { w: 22, h: 22 },
    };
    const b = BASE[el.type] ?? { w: 20, h: 20 };
    const sx = (el.scaleX ?? 1) * (el.scale ?? 1);
    const sy = (el.scaleY ?? 1) * (el.scale ?? 1);
    return { x: el.x - (b.w * sx) / 2, y: el.y - (b.h * sy) / 2, w: b.w * sx, h: b.h * sy };
  }, []);

  // Render canvas
  const render = useCallback((elems: BoardElement[], livePoints?: Point[], liveTool?: ToolType, selId?: string | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    drawFieldOnCanvas(ctx, W, H);

    // Draw quick-board background if loaded (use logical W/H, not DPR-scaled canvas.width)
    if (bgImgRef.current) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(bgImgRef.current, 0, 0, W, H);
      ctx.globalAlpha = 1.0;
    }

    drawElements(ctx, elems, playerElementSizeRef.current);

    // ── Player name / role / direction overlay (uses refs so always fresh) ──
    const showName = showPlayerNameRef.current;
    const showRole = showPlayerRoleRef.current;
    const showDir  = showPlayerDirectionRef.current;
    const pSize   = playerElementSizeRef.current;

    elems.forEach(el => {
      if ((el.type === "player" || el.type === "opponent") && el.x !== undefined && el.y !== undefined) {
        // Direction arrow (drawn below player circle)
        if (showDir) {
          const rot = ((el.rotation ?? 0) - 90) * (Math.PI / 180);
          const arrLen = pSize + 8;
          const tx = el.x + Math.cos(rot) * (pSize + 2);
          const ty = el.y + Math.sin(rot) * (pSize + 2);
          const headLen = 6;
          ctx.strokeStyle = el.type === "player" ? "#93c5fd" : "#fca5a5";
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(el.x, el.y);
          ctx.lineTo(tx + Math.cos(rot) * arrLen, ty + Math.sin(rot) * arrLen);
          ctx.stroke();
          const endX = tx + Math.cos(rot) * arrLen;
          const endY = ty + Math.sin(rot) * arrLen;
          ctx.beginPath();
          ctx.moveTo(endX - headLen * Math.cos(rot - Math.PI / 6), endY - headLen * Math.sin(rot - Math.PI / 6));
          ctx.lineTo(endX, endY);
          ctx.lineTo(endX - headLen * Math.cos(rot + Math.PI / 6), endY - headLen * Math.sin(rot + Math.PI / 6));
          ctx.stroke();
        }

        // Name / Role text
        if (showName || showRole) {
          let lines: string[] = [];
          if (showName && el.playerName) lines.push(el.playerName);
          if (showRole && el.playerRole) lines.push(el.playerRole);
          if (lines.length > 0) {
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.font = `bold ${Math.max(8, pSize * 0.75)}px Arial`;
            const textColor = el.type === "player" ? "#bfdbfe" : "#fecaca";
            // Subtle shadow for readability
            ctx.shadowColor = "rgba(0,0,0,0.7)";
            ctx.shadowBlur = 3;
            ctx.fillStyle = textColor;
            lines.forEach((line, i) => {
              ctx.fillText(line, el.x!, el.y! + pSize + 3 + i * (pSize * 0.8));
            });
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
          }
        }
      }
    });

    // ── Equipment selection ring + resize handles ─────────────────────
    const selEquipId = selectedEquipIdRef.current;
    if (selEquipId) {
      const equipEl = elems.find(e => e.id === selEquipId);
      if (equipEl) {
        const bbox = ((): { x: number; y: number; w: number; h: number } | null => {
          if (equipEl.x === undefined || equipEl.y === undefined) return null;
          const BASE: Record<string, { w: number; h: number }> = {
            ball: {w:16,h:16}, cone: {w:16,h:22}, goal: {w:48,h:22},
            goalLarge: {w:64,h:30}, disc: {w:28,h:14}, cinesino: {w:28,h:16},
            sagoma: {w:20,h:30}, flag: {w:14,h:26}, ladder: {w:40,h:20},
            hurdle: {w:28,h:20}, pole: {w:8,h:28}, vest: {w:22,h:22},
          };
          const b = BASE[equipEl.type] ?? {w:20,h:20};
          const sx = (equipEl.scaleX ?? 1) * (equipEl.scale ?? 1);
          const sy = (equipEl.scaleY ?? 1) * (equipEl.scale ?? 1);
          return { x: equipEl.x - (b.w*sx)/2, y: equipEl.y - (b.h*sy)/2, w: b.w*sx, h: b.h*sy };
        })();
        if (bbox) {
          const pad = 6;
          // Selection box
          ctx.strokeStyle = "rgba(59,130,246,0.8)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(bbox.x - pad, bbox.y - pad, bbox.w + pad*2, bbox.h + pad*2);
          ctx.setLineDash([]);
          // Resize handles: right-center (→ width), bottom-center (↓ height), bottom-right (corner ↗ uniform)
          const handles = [
            { x: bbox.x + bbox.w + pad, y: bbox.y + bbox.h / 2, fill: "#ffffff", stroke: "#3b82f6" },
            { x: bbox.x + bbox.w / 2,   y: bbox.y + bbox.h + pad, fill: "#ffffff", stroke: "#3b82f6" },
            { x: bbox.x + bbox.w + pad, y: bbox.y + bbox.h + pad, fill: "#3b82f6", stroke: "#ffffff" },
          ];
          handles.forEach(h => {
            ctx.fillStyle = h.fill;
            ctx.strokeStyle = h.stroke;
            ctx.lineWidth = 2;
            ctx.shadowColor = "rgba(0,0,0,0.4)";
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.arc(h.x, h.y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
          });
        }
      }
    }

    // Draw handles if an element is selected
    if (selId) {
      const el = elems.find(e => e.id === selId);

      const drawHandleDot = (pt: Point, fill: string, r = 7) => {
        ctx.fillStyle = fill;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
      };

      if (el && (el.type === "bezier" || el.type === "bezierarrow") && el.points?.length === 4) {
        const [p0, cp1, cp2, p3] = el.points;
        // Control lever lines
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y); ctx.lineTo(cp1.x, cp1.y);
        ctx.moveTo(p3.x, p3.y); ctx.lineTo(cp2.x, cp2.y);
        ctx.stroke();
        ctx.setLineDash([]);
        [
          { pt: p0, fill: HANDLE_ENDPOINT },
          { pt: cp1, fill: HANDLE_CTRL },
          { pt: cp2, fill: HANDLE_CTRL },
          { pt: p3, fill: HANDLE_ENDPOINT },
        ].forEach(({ pt, fill }) => drawHandleDot(pt, fill));
      }

      // Path element handles (straight lines: 2 endpoints + center; others: just center)
      if (el && el.type === "path" && el.drawShape && el.points && el.points.length >= 2) {
        const p0 = el.points[0];
        const pN = el.points[el.points.length - 1];
        const cx = (p0.x + pN.x) / 2; const cy = (p0.y + pN.y) / 2;

        if (el.drawShape.startsWith('straight')) {
          // Dashed selection outline along the line
          ctx.strokeStyle = 'rgba(59,130,246,0.6)';
          ctx.lineWidth = 6;
          ctx.lineCap = "round";
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y); ctx.lineTo(pN.x, pN.y);
          ctx.stroke();
          ctx.setLineDash([]);
          drawHandleDot(p0, HANDLE_ENDPOINT);
          drawHandleDot(pN, HANDLE_ENDPOINT);
          drawHandleDot({ x: cx, y: cy }, '#3b82f6', 8);
        } else {
          // For shapes (rect, circle, arc): just a subtle glow + center handle
          ctx.globalAlpha = 0.3;
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 6;
          ctx.setLineDash([]);
          renderDrawPath(ctx, el.points, el.drawShape, '#3b82f6', 6, 'none');
          ctx.globalAlpha = 1;
          drawHandleDot({ x: cx, y: cy }, '#3b82f6', 8);
        }
      }
    }

    if (livePoints && livePoints.length > 1) {
      if (liveTool === "draw") {
        renderDrawPath(ctx, livePoints, drawShapeRef.current, drawColorRef.current, 2.5, drawArrowEndRef.current);
      } else if (liveTool === "line") {
        const start = livePoints[0];
        const end = livePoints[livePoints.length - 1];
        ctx.strokeStyle = LINE_STRAIGHT_COLOR;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (liveTool === "arrow") {
        const start = livePoints[0];
        const end = livePoints[livePoints.length - 1];
        ctx.strokeStyle = ARROW_COLOR;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();

        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const headLen = 16;
        ctx.strokeStyle = ARROW_COLOR;
        ctx.lineCap = "round";
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(end.x, end.y);
        ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
    }

    ctx.restore();
  }, []);

  useEffect(() => {
    render(elements, undefined, undefined, selectedId);
  }, [elements, render, canvasSize, selectedId, showPlayerName, showPlayerRole, showPlayerDirection, playerElementSize, selectedEquipId]);

  // ── Global touch listener for palette-drag-to-canvas placement ──────────
  useEffect(() => {
    function handleGlobalTouchMove(ev: TouchEvent) {
      const drag = touchPaletteDragRef.current;
      if (!drag) return;
      const touch = Array.from(ev.changedTouches).find(t => t.identifier === drag.touchId)
        ?? Array.from(ev.touches).find(t => t.identifier === drag.touchId);
      if (!touch) return;
      drag.startMoved = true;
      // Update ghost position (direct DOM mutation — no re-render per frame)
      setTouchGhostTool(g => g ? { ...g, x: touch.clientX, y: touch.clientY } : g);
      // Prevent page scroll ONLY while dragging from palette
      ev.preventDefault();
    }

    function handleGlobalTouchEnd(ev: TouchEvent) {
      const drag = touchPaletteDragRef.current;
      if (!drag) return;
      const touch = Array.from(ev.changedTouches).find(t => t.identifier === drag.touchId);
      touchPaletteDragRef.current = null;
      setTouchGhostTool(null);
      if (!touch || !drag.startMoved) return;

      // Check if finger ended over the canvas
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (
        touch.clientX < rect.left || touch.clientX > rect.right ||
        touch.clientY < rect.top  || touch.clientY > rect.bottom
      ) return;

      // Calculate canvas coordinates
      const dprG = window.devicePixelRatio || 1;
      const cx = (touch.clientX - rect.left) * (canvas.width / rect.width / dprG);
      const cy = (touch.clientY - rect.top) * (canvas.height / rect.height / dprG);
      const toolKey = drag.tool;

      // Place element using functional updates (no stale closure)
      if (toolKey === "player") {
        const label = String(playerCounterRef.current);
        setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "player", x: cx, y: cy, label }]; });
        setPlayerCounter(c => c + 1);
      } else if (toolKey === "opponent") {
        const label = String(opponentCounterRef.current);
        setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "opponent", x: cx, y: cy, label }]; });
        setOpponentCounter(c => c + 1);
      } else if (toolKey === "ball") {
        setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "ball", x: cx, y: cy, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
      } else if (toolKey === "cone") {
        setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "cone", x: cx, y: cy, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
      } else if (toolKey === "goalkeeper") {
        setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "goalkeeper", x: cx, y: cy, label: "P" }]; });
      } else if (toolKey === "goal") {
        setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "goal", x: cx, y: cy }]; });
      } else if (toolKey === "text") {
        setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "text", x: cx, y: cy, label: "Testo" }]; });
      } else {
        // Drawing tools: just select the tool
        setTool(toolKey);
      }
    }

    document.addEventListener("touchmove", handleGlobalTouchMove, { passive: false });
    document.addEventListener("touchend", handleGlobalTouchEnd);
    return () => {
      document.removeEventListener("touchmove", handleGlobalTouchMove);
      document.removeEventListener("touchend", handleGlobalTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Canvas native touch handlers (non-passive so preventDefault works) ───
  // Helper: get canvas coordinates from a Touch
  function getTouchCanvasPos(touch: Touch): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const sx = rect.width > 0 ? canvas.width / rect.width / dpr : 1;
    const sy = rect.height > 0 ? canvas.height / rect.height / dpr : 1;
    return { x: (touch.clientX - rect.left) * sx, y: (touch.clientY - rect.top) * sy };
  }

  // Effect: keeps callback refs fresh on every relevant state change
  useEffect(() => {
    canvasTouchHandlers.current.onStart = (ev: TouchEvent) => {
      // Ignore if this is a palette-drag gesture already captured
      if (touchPaletteDragRef.current) return;
      const touch = ev.touches[0];
      const pos = getTouchCanvasPos(touch);

      // 1. Check hit on existing element → drag to reposition (any tool or no tool)
      const isDrawingTool = tool === "draw" || tool === "line" || tool === "arrow" || tool === "curve" || tool === "curveArrow" || tool === "eraser";

      // Check equip resize handles first
      if (!isDrawingTool && selectedEquipIdRef.current) {
        const equipEl = elements.find(el => el.id === selectedEquipIdRef.current);
        if (equipEl) {
          const bbox = (() => {
            if (equipEl.x === undefined || equipEl.y === undefined) return null;
            const BASE: Record<string, {w:number;h:number}> = {
              ball:{w:16,h:16},cone:{w:16,h:22},goal:{w:48,h:22},goalLarge:{w:64,h:30},
              disc:{w:28,h:14},cinesino:{w:28,h:16},sagoma:{w:20,h:30},flag:{w:14,h:26},
              ladder:{w:40,h:20},hurdle:{w:28,h:20},pole:{w:8,h:28},vest:{w:22,h:22},
            };
            const b = BASE[equipEl.type] ?? {w:20,h:20};
            const sx = (equipEl.scaleX??1)*(equipEl.scale??1);
            const sy = (equipEl.scaleY??1)*(equipEl.scale??1);
            return { x: equipEl.x-(b.w*sx)/2, y: equipEl.y-(b.h*sy)/2, w: b.w*sx, h: b.h*sy };
          })();
          if (bbox) {
            const pad = 6;
            const handles = [
              { x: bbox.x+bbox.w+pad, y: bbox.y+bbox.h/2, handle: "right" as const },
              { x: bbox.x+bbox.w/2,   y: bbox.y+bbox.h+pad, handle: "bottom" as const },
              { x: bbox.x+bbox.w+pad, y: bbox.y+bbox.h+pad, handle: "corner" as const },
            ];
            for (const h of handles) {
              if (Math.hypot(pos.x-h.x, pos.y-h.y) < 14) {
                ev.preventDefault();
                canvasTouchActiveRef.current = true;
                const sx = (equipEl.scaleX??1)*(equipEl.scale??1);
                const sy = (equipEl.scaleY??1)*(equipEl.scale??1);
                equipResizeDragRef.current = {
                  handle: h.handle, elId: selectedEquipIdRef.current!,
                  startPos: pos, startBBoxW: bbox.w, startBBoxH: bbox.h,
                  startScaleX: sx, startScaleY: sy,
                };
                pushHistory(elements);
                return;
              }
            }
          }
        }
      }

      if (!isDrawingTool) {
        const hitId = findElementAt(pos.x, pos.y);
        if (hitId) {
          const el = elements.find(em => em.id === hitId);
          if (el && el.x !== undefined && el.y !== undefined) {
            ev.preventDefault();
            canvasTouchActiveRef.current = true;
            tapMovedRef.current = false;
            tapDownRef.current = { pos, hitId, canvasX: touch.clientX, canvasY: touch.clientY };
            pushHistory(elements);
            setDragElement({ id: hitId, offsetX: pos.x - el.x, offsetY: pos.y - el.y });
            return;
          }
        }
      }

      // 2. Drawing tool active → start drawing (captures immediately)
      if (tool === "draw" || tool === "line" || tool === "arrow" || tool === "curve" || tool === "curveArrow") {
        ev.preventDefault();
        canvasTouchActiveRef.current = true;
        setIsDrawing(true);
        setCurrentPath([pos]);
        return;
      }

      // 3. Eraser → erase on tap (captures immediately)
      if (tool === "eraser") {
        ev.preventDefault();
        canvasTouchActiveRef.current = true;
        const id = findElementAt(pos.x, pos.y);
        if (id) setElements(prev => { pushHistory(prev); return prev.filter(el => el.id !== id); });
        return;
      }

      // 4. Placement tools → record pending tap WITHOUT preventing scroll.
      //    If the finger moves >15px it's a scroll, otherwise onEnd will place the element.
      const PLACE_TOOLS = ["player","opponent","ball","cone","goalkeeper","goal","goalLarge","text",
        "disc","cinesino","sagoma","flag","ladder","hurdle","pole","vest"];
      if (PLACE_TOOLS.includes(tool)) {
        touchPlacePendingRef.current = { canvasPos: pos, screenX: touch.clientX, screenY: touch.clientY, cancelled: false };
        // Do NOT ev.preventDefault() here — let the browser decide scroll vs tap
        canvasTouchActiveRef.current = false;
        return;
      }

      // Otherwise → don't capture, let page scroll
      canvasTouchActiveRef.current = false;
    };

    canvasTouchHandlers.current.onMove = (ev: TouchEvent) => {
      // Cancel pending placement tap if finger moved significantly (user is scrolling)
      if (touchPlacePendingRef.current && !touchPlacePendingRef.current.cancelled) {
        const touch = ev.touches[0] ?? ev.changedTouches[0];
        const dx = touch.clientX - touchPlacePendingRef.current.screenX;
        const dy = touch.clientY - touchPlacePendingRef.current.screenY;
        if (Math.sqrt(dx * dx + dy * dy) > 15) {
          touchPlacePendingRef.current.cancelled = true;
        }
      }
      if (!canvasTouchActiveRef.current) return;
      ev.preventDefault();
      const touch = ev.touches[0] ?? ev.changedTouches[0];
      const pos = getTouchCanvasPos(touch);

      // Track drag for tap detection
      if (tapDownRef.current) tapMovedRef.current = true;

      // Equipment resize drag (touch)
      if (equipResizeDragRef.current) {
        const drag = equipResizeDragRef.current;
        const dx = pos.x - drag.startPos.x;
        const dy = pos.y - drag.startPos.y;
        setElements(prev => {
          const updated = prev.map(el => {
            if (el.id !== drag.elId) return el;
            if (drag.handle === "right") {
              const nsx = Math.max(0.25, drag.startScaleX * (1 + dx / (drag.startBBoxW / 2)));
              return { ...el, scaleX: nsx, scaleY: drag.startScaleY, scale: 1 };
            } else if (drag.handle === "bottom") {
              const nsy = Math.max(0.25, drag.startScaleY * (1 + dy / (drag.startBBoxH / 2)));
              return { ...el, scaleY: nsy, scaleX: drag.startScaleX, scale: 1 };
            } else {
              const diag = (dx + dy) / 2;
              const ns = Math.max(0.25, drag.startScaleX * (1 + diag / ((drag.startBBoxW + drag.startBBoxH) / 4)));
              return { ...el, scale: ns, scaleX: 1, scaleY: 1 };
            }
          });
          render(updated, undefined, undefined, selectedId);
          return updated;
        });
        return;
      }

      if (dragElement) {
        setElements(prev => {
          const updated = prev.map(el =>
            el.id !== dragElement.id ? el : { ...el, x: pos.x - dragElement.offsetX, y: pos.y - dragElement.offsetY }
          );
          render(updated, undefined, undefined, selectedId);
          return updated;
        });
        return;
      }
      if (dragHandle) {
        if (dragHandle.kind === 'move') {
          const moveData = pathMoveStartRef.current;
          if (moveData) {
            const dx = pos.x - moveData.startPos.x;
            const dy = pos.y - moveData.startPos.y;
            setElements(prev => {
              const updated = prev.map(el => {
                if (el.id !== dragHandle.elId || !el.points) return el;
                return { ...el, points: moveData.origPoints.map(p => ({ x: p.x + dx, y: p.y + dy })) };
              });
              render(updated, undefined, undefined, selectedId);
              return updated;
            });
          }
        } else {
          setElements(prev => {
            const updated = prev.map(el => {
              if (el.id !== dragHandle.elId || !el.points) return el;
              const newPoints = [...el.points];
              newPoints[dragHandle.idx] = pos;
              return { ...el, points: newPoints };
            });
            render(updated, undefined, undefined, selectedId);
            return updated;
          });
        }
        return;
      }
      if (!isDrawing) return;
      if (tool === "line" || tool === "arrow" || tool === "curve" || tool === "curveArrow") {
        const newPath = [currentPath[0], pos];
        setCurrentPath(newPath);
        render(elements, newPath, tool === "curve" ? "line" : tool === "curveArrow" ? "arrow" : tool, selectedId);
      } else if (tool === "draw") {
        if (drawShapeRef.current === 'freehand-solid') {
          const newPath = [...currentPath, pos];
          setCurrentPath(newPath);
          render(elements, newPath, "draw", selectedId);
        } else {
          const newPath = [currentPath[0], pos];
          setCurrentPath(newPath);
          render(elements, newPath, "draw", selectedId);
        }
      } else {
        const newPath = [...currentPath, pos];
        setCurrentPath(newPath);
        render(elements, newPath, tool ?? undefined, selectedId);
      }
    };

    canvasTouchHandlers.current.onEnd = (ev: TouchEvent) => {
      // Resolve pending placement tap (was it a tap or a scroll?)
      const pending = touchPlacePendingRef.current;
      if (pending) {
        touchPlacePendingRef.current = null;
        if (!pending.cancelled) {
          const pos = pending.canvasPos;
          if (tool === "player") {
            const label = String(playerCounterRef.current);
            setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "player", x: pos.x, y: pos.y, label }]; });
            setPlayerCounter(c => c + 1);
          } else if (tool === "opponent") {
            const label = String(opponentCounterRef.current);
            setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "opponent", x: pos.x, y: pos.y, label }]; });
            setOpponentCounter(c => c + 1);
          } else if (tool === "ball") {
            setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "ball", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
          } else if (tool === "cone") {
            setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "cone", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
          } else if (tool === "goalkeeper") {
            setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "goalkeeper", x: pos.x, y: pos.y, label: "P" }]; });
          } else if (tool === "goal") {
            setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "goal", x: pos.x, y: pos.y }]; });
          } else if (tool === "goalLarge") {
            setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "goalLarge", x: pos.x, y: pos.y }]; });
          } else if (tool === "text") {
            setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "text", x: pos.x, y: pos.y, label: "Testo" }]; });
          } else if (tool === "disc") {
            setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "disc", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
          } else if (tool === "cinesino") {
            setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "cinesino", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
          } else if (tool === "sagoma") {
            setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "sagoma", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
          } else if (tool === "flag") {
            setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "flag", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
          } else if (tool === "ladder") {
            setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "ladder", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
          } else if (tool === "hurdle") {
            setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "hurdle", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
          } else if (tool === "pole") {
            setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "pole", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
          } else if (tool === "vest") {
            setElements(prev => { setHistory(h => [...h.slice(-49), prev]); return [...prev, { id: uid(), type: "vest", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
          }
        }
      }
      if (!canvasTouchActiveRef.current) return;
      ev.preventDefault();
      canvasTouchActiveRef.current = false;
      handleCanvasUp();
    };
  });

  // Effect: register native non-passive listeners on canvas element (ONCE)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onStart = (e: TouchEvent) => canvasTouchHandlers.current.onStart(e);
    const onMove  = (e: TouchEvent) => canvasTouchHandlers.current.onMove(e);
    const onEnd   = (e: TouchEvent) => canvasTouchHandlers.current.onEnd(e);
    canvas.addEventListener("touchstart", onStart, { passive: false });
    canvas.addEventListener("touchmove",  onMove,  { passive: false });
    canvas.addEventListener("touchend",   onEnd);
    return () => {
      canvas.removeEventListener("touchstart", onStart);
      canvas.removeEventListener("touchmove",  onMove);
      canvas.removeEventListener("touchend",   onEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getPos(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width > 0 ? canvas.width / rect.width / (window.devicePixelRatio || 1) : 1;
    const sy = rect.height > 0 ? canvas.height / rect.height / (window.devicePixelRatio || 1) : 1;
    if ("touches" in e) {
      const touch = e.touches[0] ?? e.changedTouches[0];
      return { x: (touch.clientX - rect.left) * sx, y: (touch.clientY - rect.top) * sy };
    }
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  function getPosFromDrag(e: React.DragEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width > 0 ? canvas.width / rect.width / (window.devicePixelRatio || 1) : 1;
    const sy = rect.height > 0 ? canvas.height / rect.height / (window.devicePixelRatio || 1) : 1;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  function findElementAt(x: number, y: number): string | null {
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (el.x !== undefined && el.y !== undefined) {
        if (el.type === "goal") {
          if (Math.abs(x - el.x) < 28 && Math.abs(y - el.y) < 16) return el.id;
        } else if (el.type === "goalLarge") {
          if (Math.abs(x - el.x) < 36 && Math.abs(y - el.y) < 20) return el.id;
        } else if (el.type === "disc" || el.type === "cinesino") {
          if (Math.abs(x - el.x) < 16 && Math.abs(y - el.y) < 10) return el.id;
        } else if (el.type === "ladder") {
          if (Math.abs(x - el.x) < 20 && Math.abs(y - el.y) < 12) return el.id;
        } else if (el.type === "hurdle") {
          if (Math.abs(x - el.x) < 16 && Math.abs(y - el.y) < 14) return el.id;
        } else if (el.type === "vest") {
          if (Math.abs(x - el.x) < 18 && Math.abs(y - el.y) < 14) return el.id;
        } else {
          const r = el.type === "ball" ? 8 : el.type === "cone" ? 10 : 18;
          if (Math.hypot(x - el.x, y - el.y) < r) return el.id;
        }
      }
    }
    return null;
  }

  function findDrawPathAt(x: number, y: number): string | null {
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (!el.drawShape || !el.points || el.points.length < 2) continue;
      const p0 = el.points[0];
      const pN = el.points[el.points.length - 1];
      const HIT = 14;

      if (el.type === 'bezier') {
        if (el.points.length === 4) {
          const [bp0, cp1, cp2, bp3] = el.points;
          for (let t = 0; t <= 1; t += 0.05) {
            const mt = 1 - t;
            const bx = mt*mt*mt*bp0.x + 3*mt*mt*t*cp1.x + 3*mt*t*t*cp2.x + t*t*t*bp3.x;
            const by = mt*mt*mt*bp0.y + 3*mt*mt*t*cp1.y + 3*mt*t*t*cp2.y + t*t*t*bp3.y;
            if (Math.hypot(x - bx, y - by) < HIT) return el.id;
          }
        }
        continue;
      }

      if (el.type === 'path') {
        const ds = el.drawShape;
        if (ds.startsWith('straight')) {
          const dx = pN.x - p0.x; const dy = pN.y - p0.y;
          const lenSq = dx*dx + dy*dy;
          if (lenSq < 1) continue;
          const t = Math.max(0, Math.min(1, ((x - p0.x)*dx + (y - p0.y)*dy) / lenSq));
          if (Math.hypot(x - (p0.x + t*dx), y - (p0.y + t*dy)) < HIT) return el.id;
        } else if (ds.startsWith('arc-wavy')) {
          const dx = pN.x - p0.x; const dy = pN.y - p0.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len * 15; const ny = dx / len * 15;
          for (let s = 0; s <= 40; s++) {
            const t = s / 40;
            const bx = p0.x + dx*t + nx*Math.sin(t*Math.PI*4);
            const by = p0.y + dy*t + ny*Math.sin(t*Math.PI*4);
            if (Math.hypot(x - bx, y - by) < HIT) return el.id;
          }
        } else if (ds.startsWith('rect')) {
          const rx = Math.min(p0.x, pN.x); const ry = Math.min(p0.y, pN.y);
          const rw = Math.abs(pN.x - p0.x); const rh = Math.abs(pN.y - p0.y);
          if (ds === 'rect-filled') {
            if (x >= rx && x <= rx+rw && y >= ry && y <= ry+rh) return el.id;
          } else {
            const inBounds = x >= rx-HIT && x <= rx+rw+HIT && y >= ry-HIT && y <= ry+rh+HIT;
            if (inBounds && (x <= rx+HIT || x >= rx+rw-HIT || y <= ry+HIT || y >= ry+rh-HIT)) return el.id;
          }
        } else if (ds.startsWith('circle')) {
          const rx = Math.abs(pN.x - p0.x) / 2; const ry = Math.abs(pN.y - p0.y) / 2;
          if (rx < 1 || ry < 1) continue;
          const cxc = Math.min(p0.x, pN.x) + rx; const cyc = Math.min(p0.y, pN.y) + ry;
          const normDist = Math.sqrt(((x-cxc)/rx)**2 + ((y-cyc)/ry)**2);
          if (ds === 'circle-filled') {
            if (normDist <= 1.15) return el.id;
          } else {
            if (Math.abs(normDist - 1) < 0.2) return el.id;
          }
        }
      }
    }
    return null;
  }

  function pushHistory(snap: BoardElement[]) {
    setHistory(h => [...h.slice(-49), snap]);
    setRedoStack([]); // clear redo on new action
  }

  function undo() {
    setHistory(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setElements(cur => { setRedoStack(r => [...r.slice(-49), cur]); return prev; });
      return h.slice(0, -1);
    });
  }

  function redo() {
    setRedoStack(r => {
      if (r.length === 0) return r;
      const next = r[r.length - 1];
      setElements(cur => { setHistory(h => [...h.slice(-49), cur]); return next; });
      return r.slice(0, -1);
    });
  }

  // Track if the pointer moved during mousedown so we can distinguish tap vs drag
  const tapDownRef = useRef<{ pos: { x: number; y: number }; hitId: string; canvasX: number; canvasY: number } | null>(null);
  const tapMovedRef = useRef(false);

  function handleCanvasDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const pos = getPos(e);
    tapMovedRef.current = false;
    tapDownRef.current = null;

    // Close any open context menu on canvas click
    if (elementCtxMenu) { setElementCtxMenu(null); return; }

    // ── Equip resize handle check (takes priority) ─────────────────────
    if (selectedEquipId) {
      const equipEl = elements.find(el => el.id === selectedEquipId);
      if (equipEl) {
        const bbox = getEquipBBox(equipEl);
        if (bbox) {
          const pad = 6;
          const handles = [
            { x: bbox.x + bbox.w + pad, y: bbox.y + bbox.h / 2, handle: "right" as const },
            { x: bbox.x + bbox.w / 2,   y: bbox.y + bbox.h + pad, handle: "bottom" as const },
            { x: bbox.x + bbox.w + pad, y: bbox.y + bbox.h + pad, handle: "corner" as const },
          ];
          for (const h of handles) {
            if (Math.hypot(pos.x - h.x, pos.y - h.y) < 12) {
              const sx = (equipEl.scaleX ?? 1) * (equipEl.scale ?? 1);
              const sy = (equipEl.scaleY ?? 1) * (equipEl.scale ?? 1);
              equipResizeDragRef.current = {
                handle: h.handle, elId: selectedEquipId,
                startPos: pos, startBBoxW: bbox.w, startBBoxH: bbox.h,
                startScaleX: sx, startScaleY: sy,
              };
              pushHistory(elements);
              return;
            }
          }
        }
      }
    }

    // ── Drag existing point element (player/ball/cone) to move it ─────
    if (tool !== "eraser" && tool !== "draw" && tool !== "line" && tool !== "arrow" && tool !== "curve" && tool !== "curveArrow") {
      const hitId = findElementAt(pos.x, pos.y);
      if (hitId) {
        const el = elements.find(em => em.id === hitId);
        if (el && el.x !== undefined && el.y !== undefined) {
          // Record tap start; actual drag starts on move
          tapDownRef.current = { pos, hitId, canvasX: e.clientX, canvasY: e.clientY };
          pushHistory(elements);
          setDragElement({ id: hitId, offsetX: pos.x - el.x, offsetY: pos.y - el.y });
          return;
        }
      }
    }

    // ── Handle bezier drag handles first ──────────────────────────────
    if (selectedId) {
      const sel = elements.find(el => el.id === selectedId);
      if (sel && (sel.type === "bezier" || sel.type === "bezierarrow") && sel.points?.length === 4) {
        for (let i = 0; i < 4; i++) {
          if (Math.hypot(pos.x - sel.points[i].x, pos.y - sel.points[i].y) < 12) {
            pushHistory(elements);
            setDragHandle({ elId: selectedId, idx: i, kind: 'point' });
            return;
          }
        }
        // Click on bezier body → move the whole curve
        const [bp0, cp1, cp2, bp3] = sel.points;
        for (let t = 0; t <= 1; t += 0.05) {
          const mt = 1 - t;
          const bx = mt*mt*mt*bp0.x + 3*mt*mt*t*cp1.x + 3*mt*t*t*cp2.x + t*t*t*bp3.x;
          const by = mt*mt*mt*bp0.y + 3*mt*mt*t*cp1.y + 3*mt*t*t*cp2.y + t*t*t*bp3.y;
          if (Math.hypot(pos.x - bx, pos.y - by) < 14) {
            pushHistory(elements);
            pathMoveStartRef.current = { origPoints: [...sel.points], startPos: pos };
            setDragHandle({ elId: selectedId, idx: -1, kind: 'move' });
            return;
          }
        }
      }
      // Check path element handles
      if (sel && sel.type === "path" && sel.drawShape && sel.points && sel.points.length >= 2) {
        const p0 = sel.points[0];
        const pN = sel.points[sel.points.length - 1];
        const cx = (p0.x + pN.x) / 2; const cy = (p0.y + pN.y) / 2;
        if (sel.drawShape.startsWith('straight')) {
          // Endpoint handles
          if (Math.hypot(pos.x - p0.x, pos.y - p0.y) < 14) {
            pushHistory(elements);
            setDragHandle({ elId: selectedId, idx: 0, kind: 'point' });
            return;
          }
          if (Math.hypot(pos.x - pN.x, pos.y - pN.y) < 14) {
            pushHistory(elements);
            setDragHandle({ elId: selectedId, idx: sel.points.length - 1, kind: 'point' });
            return;
          }
        }
        // Center move handle (all shapes)
        if (Math.hypot(pos.x - cx, pos.y - cy) < 14) {
          pushHistory(elements);
          pathMoveStartRef.current = { origPoints: [...sel.points], startPos: pos };
          setDragHandle({ elId: selectedId, idx: -1, kind: 'move' });
          return;
        }
      }
      // Clicked away from selected element → deselect
      setSelectedId(null);
    }

    // ── Bezier tools: click on existing bezier to select ─────────────
    if (tool === "curve" || tool === "curveArrow") {
      // Check if clicking an existing bezier to re-select it
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if ((el.type === "bezier" || el.type === "bezierarrow") && el.points?.length === 4) {
          const [p0, cp1, cp2, p3] = el.points;
          // Hit-test: sample curve at 20 points
          for (let t = 0; t <= 1; t += 0.05) {
            const mt = 1 - t;
            const bx = mt*mt*mt*p0.x + 3*mt*mt*t*cp1.x + 3*mt*t*t*cp2.x + t*t*t*p3.x;
            const by = mt*mt*mt*p0.y + 3*mt*mt*t*cp1.y + 3*mt*t*t*cp2.y + t*t*t*p3.y;
            if (Math.hypot(pos.x - bx, pos.y - by) < 10) {
              setSelectedId(el.id);
              return;
            }
          }
        }
      }
    }

    // ── Drawing tools ──────────────────────────────────────────────────
    if (tool === "draw") {
      // In draw mode: first try to select an existing drawn element
      const hitId = findDrawPathAt(pos.x, pos.y);
      if (hitId) {
        setSelectedId(hitId);
        return;
      }
      // Nothing hit → start drawing a new shape
      setIsDrawing(true);
      setCurrentPath([pos]);
      return;
    }
    if (tool === "line" || tool === "arrow" || tool === "curve" || tool === "curveArrow") {
      setIsDrawing(true);
      setCurrentPath([pos]);
      return;
    }

    if (tool === "eraser") {
      const id = findElementAt(pos.x, pos.y) || findDrawPathAt(pos.x, pos.y);
      if (id) {
        if (selectedId === id) setSelectedId(null);
        setElements(prev => { pushHistory(prev); return prev.filter(el => el.id !== id); });
      }
      return;
    }

    if (tool === "player") {
      setElements(prev => { pushHistory(prev); return [...prev, { id: uid(), type: "player", x: pos.x, y: pos.y, label: String(playerCounter) }]; });
      setPlayerCounter(c => c + 1);
      return;
    }
    if (tool === "opponent") {
      setElements(prev => { pushHistory(prev); return [...prev, { id: uid(), type: "opponent", x: pos.x, y: pos.y, label: String(opponentCounter) }]; });
      setOpponentCounter(c => c + 1);
      return;
    }
    if (tool === "ball") {
      setElements(prev => { pushHistory(prev); return [...prev, { id: uid(), type: "ball", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
      return;
    }
    if (tool === "cone") {
      setElements(prev => { pushHistory(prev); return [...prev, { id: uid(), type: "cone", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
      return;
    }
    if (tool === "goalkeeper") {
      setElements(prev => { pushHistory(prev); return [...prev, { id: uid(), type: "goalkeeper", x: pos.x, y: pos.y, label: "P" }]; });
      return;
    }
    if (tool === "goal") {
      setElements(prev => { pushHistory(prev); return [...prev, { id: uid(), type: "goal", x: pos.x, y: pos.y }]; });
      return;
    }
    if (tool === "text") {
      setElements(prev => { pushHistory(prev); return [...prev, { id: uid(), type: "text", x: pos.x, y: pos.y, label: "Testo" }]; });
      return;
    }
    if (tool === "goalLarge") {
      setElements(prev => { pushHistory(prev); return [...prev, { id: uid(), type: "goalLarge", x: pos.x, y: pos.y }]; });
      return;
    }
    if (tool === "disc") {
      setElements(prev => { pushHistory(prev); return [...prev, { id: uid(), type: "disc", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
      return;
    }
    if (tool === "cinesino") {
      setElements(prev => { pushHistory(prev); return [...prev, { id: uid(), type: "cinesino", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
      return;
    }
    if (tool === "sagoma") {
      setElements(prev => { pushHistory(prev); return [...prev, { id: uid(), type: "sagoma", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
      return;
    }
    if (tool === "flag") {
      setElements(prev => { pushHistory(prev); return [...prev, { id: uid(), type: "flag", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
      return;
    }
    if (tool === "ladder") {
      setElements(prev => { pushHistory(prev); return [...prev, { id: uid(), type: "ladder", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
      return;
    }
    if (tool === "hurdle") {
      setElements(prev => { pushHistory(prev); return [...prev, { id: uid(), type: "hurdle", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
      return;
    }
    if (tool === "pole") {
      setElements(prev => { pushHistory(prev); return [...prev, { id: uid(), type: "pole", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
      return;
    }
    if (tool === "vest") {
      setElements(prev => { pushHistory(prev); return [...prev, { id: uid(), type: "vest", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
      return;
    }
  }

  function handleCanvasMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const pos = getPos(e);

    // Track if pointer has moved (used to distinguish tap vs drag)
    if (tapDownRef.current) tapMovedRef.current = true;

    // ── Equipment resize drag ──────────────────────────────────────────
    if (equipResizeDragRef.current) {
      const drag = equipResizeDragRef.current;
      const dx = pos.x - drag.startPos.x;
      const dy = pos.y - drag.startPos.y;
      setElements(prev => {
        const updated = prev.map(el => {
          if (el.id !== drag.elId) return el;
          if (drag.handle === "right") {
            const newScaleX = Math.max(0.25, drag.startScaleX * (1 + dx / (drag.startBBoxW / 2)));
            return { ...el, scaleX: newScaleX, scaleY: drag.startScaleY, scale: 1 };
          } else if (drag.handle === "bottom") {
            const newScaleY = Math.max(0.25, drag.startScaleY * (1 + dy / (drag.startBBoxH / 2)));
            return { ...el, scaleY: newScaleY, scaleX: drag.startScaleX, scale: 1 };
          } else {
            const diag = (dx + dy) / 2;
            const newScale = Math.max(0.25, drag.startScaleX * (1 + diag / ((drag.startBBoxW + drag.startBBoxH) / 4)));
            return { ...el, scale: newScale, scaleX: 1, scaleY: 1 };
          }
        });
        render(updated, undefined, undefined, selectedId);
        return updated;
      });
      return;
    }

    // ── Drag existing element on canvas ───────────────────────────────
    if (dragElement) {
      setElements(prev => {
        const updated = prev.map(el => {
          if (el.id !== dragElement.id) return el;
          return { ...el, x: pos.x - dragElement.offsetX, y: pos.y - dragElement.offsetY };
        });
        render(updated, undefined, undefined, selectedId);
        return updated;
      });
      return;
    }

    // Dragging a handle (point or move)
    if (dragHandle) {
      if (dragHandle.kind === 'move') {
        const moveData = pathMoveStartRef.current;
        if (moveData) {
          const dx = pos.x - moveData.startPos.x;
          const dy = pos.y - moveData.startPos.y;
          setElements(prev => {
            const updated = prev.map(el => {
              if (el.id !== dragHandle.elId || !el.points) return el;
              return { ...el, points: moveData.origPoints.map(p => ({ x: p.x + dx, y: p.y + dy })) };
            });
            render(updated, undefined, undefined, selectedId);
            return updated;
          });
        }
      } else {
        setElements(prev => {
          const updated = prev.map(el => {
            if (el.id !== dragHandle.elId || !el.points) return el;
            const newPoints = [...el.points];
            newPoints[dragHandle.idx] = pos;
            return { ...el, points: newPoints };
          });
          render(updated, undefined, undefined, selectedId);
          return updated;
        });
      }
      return;
    }

    if (!isDrawing) return;
    if (tool === "line" || tool === "arrow" || tool === "curve" || tool === "curveArrow") {
      const newPath = [currentPath[0], pos];
      setCurrentPath(newPath);
      render(elements, newPath, tool === "curve" ? "line" : tool === "curveArrow" ? "arrow" : tool, selectedId);
    } else if (tool === "draw") {
      if (drawShapeRef.current === 'freehand-solid') {
        // Freehand: accumulate all touch points to build the path
        const newPath = [...currentPath, pos];
        setCurrentPath(newPath);
        render(elements, newPath, "draw", selectedId);
      } else {
        // All other shapes: 2-point (start + current)
        const newPath = [currentPath[0], pos];
        setCurrentPath(newPath);
        render(elements, newPath, "draw", selectedId);
      }
    } else {
      const newPath = [...currentPath, pos];
      setCurrentPath(newPath);
      render(elements, newPath, tool ?? undefined, selectedId);
    }
  }

  function handleCanvasUp(e?: React.MouseEvent<HTMLCanvasElement>) {
    // Equip resize done
    if (equipResizeDragRef.current) {
      equipResizeDragRef.current = null;
      return;
    }

    // Pure tap: use REFS only (not dragElement state — which may be stale for quick touch taps)
    if (tapDownRef.current && !tapMovedRef.current) {
      const tap = tapDownRef.current;
      const hitEl = elements.find(el => el.id === tap.hitId);
      if (hitEl) {
        setDragElement(null);
        tapDownRef.current = null;
        // Undo the history push we did on mousedown (pure tap doesn't count as move)
        setHistory(prev => prev.slice(0, -1));
        const EQUIP_TYPES = ["ball","cone","goal","goalLarge","disc","cinesino","sagoma","flag","ladder","hurdle","pole","vest"];
        if (EQUIP_TYPES.includes(hitEl.type)) {
          setSelectedEquipId(tap.hitId);
        } else {
          setSelectedEquipId(null);
        }
        setElementCtxMenu({
          id: tap.hitId,
          x: e ? e.clientX : tap.canvasX,
          y: e ? e.clientY : tap.canvasY,
          type: hitEl.type,
        });
        return;
      }
    }
    // Tapped on empty canvas → deselect equipment
    if (!tapMovedRef.current) {
      setSelectedEquipId(null);
    }
    tapDownRef.current = null;
    if (dragElement) {
      setDragElement(null);
      return;
    }
    if (dragHandle) {
      pathMoveStartRef.current = null;
      setDragHandle(null);
      return;
    }
    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentPath.length > 1) {
      if (tool === "curve" || tool === "curveArrow") {
        const p0 = currentPath[0];
        const p3 = currentPath[currentPath.length - 1];
        const cp1 = { x: p0.x + (p3.x - p0.x) / 3, y: p0.y + (p3.y - p0.y) / 3 };
        const cp2 = { x: p0.x + 2 * (p3.x - p0.x) / 3, y: p0.y + 2 * (p3.y - p0.y) / 3 };
        const newId = uid();
        const newEl: BoardElement = {
          id: newId,
          type: tool === "curveArrow" ? "bezierarrow" : "bezier",
          points: [p0, cp1, cp2, p3],
        };
        setElements(prev => { pushHistory(prev); return [...prev, newEl]; });
        setSelectedId(newId); // Auto-select so handles are immediately visible
      } else {
        if (tool === "draw") {
          const ds = drawShapeRef.current;
          if (ds === 'bezier-solid' || ds === 'bezier-dashed') {
            // Create a bezier element with auto control points — user can drag handles to reshape
            const p0 = currentPath[0];
            const p3 = currentPath[currentPath.length - 1];
            const cp1 = { x: p0.x + (p3.x - p0.x) / 3, y: p0.y + (p3.y - p0.y) / 3 };
            const cp2 = { x: p0.x + 2 * (p3.x - p0.x) / 3, y: p0.y + 2 * (p3.y - p0.y) / 3 };
            const newId = uid();
            const newEl: BoardElement = {
              id: newId,
              type: "bezier",
              points: [p0, cp1, cp2, p3],
              color: drawColorRef.current,
              lineWidth: drawLineWidthRef.current,
              drawShape: ds,
              arrowEnd: drawArrowEndRef.current,
            };
            setElements(prev => { pushHistory(prev); return [...prev, newEl]; });
            setSelectedId(newId); // Auto-select so handles are immediately visible
          } else {
            // More aggressive smoothing for freehand: D-P simplify then Catmull-Rom
            const finalPath = ds === 'freehand-solid'
              ? smoothPath(simplifyPath(currentPath, 4), 50, 0.5)
              : currentPath;
            const newEl: BoardElement = {
              id: uid(),
              type: "path",
              points: finalPath,
              color: drawColorRef.current,
              lineWidth: drawLineWidthRef.current,
              drawShape: ds,
              arrowEnd: drawArrowEndRef.current,
            };
            setElements(prev => { pushHistory(prev); return [...prev, newEl]; });
          }
        } else {
          const type: BoardElement["type"] = tool === "arrow" ? "arrow" : tool === "line" ? "line" : "path";
          const newEl: BoardElement = { id: uid(), type, points: currentPath };
          setElements(prev => { pushHistory(prev); return [...prev, newEl]; });
        }
      }
    }
    setCurrentPath([]);
  }

  // ── Drag from palette onto canvas ─────────────────────────────────────
  function handleCanvasDragOver(e: React.DragEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleCanvasDrop(e: React.DragEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const droppedTool = draggedToolRef.current;
    if (!droppedTool) return;
    const pos = getPosFromDrag(e);
    if (droppedTool === "player") {
      setElements(prev => { pushHistory(prev); return [...prev, { id: uid(), type: "player", x: pos.x, y: pos.y, label: String(playerCounter) }]; });
      setPlayerCounter(c => c + 1);
    } else if (droppedTool === "opponent") {
      setElements(prev => { pushHistory(prev); return [...prev, { id: uid(), type: "opponent", x: pos.x, y: pos.y, label: String(opponentCounter) }]; });
      setOpponentCounter(c => c + 1);
    } else if (droppedTool === "ball") {
      setElements(prev => { pushHistory(prev); return [...prev, { id: uid(), type: "ball", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
    } else if (droppedTool === "cone") {
      setElements(prev => { pushHistory(prev); return [...prev, { id: uid(), type: "cone", x: pos.x, y: pos.y, ...(globalEquipColorRef.current ? { equipColor: globalEquipColorRef.current } : {}) }]; });
    } else {
      setTool(droppedTool);
    }
    draggedToolRef.current = null;
  }

  // ── Azioni in movimento ────────────────────────────────────────────────
  function addFrame() {
    if (elements.length === 0) {
      toast({ title: "Lavagna vuota", description: "Aggiungi elementi prima di salvare un fotogramma.", variant: "destructive" });
      return;
    }
    setFrames(prev => {
      const updated = [...prev, [...elements]];
      toast({ title: `Fotogramma ${updated.length} aggiunto`, description: "Puoi continuare a modificare la posizione e aggiungere altri fotogrammi." });
      return updated;
    });
  }

  function removeFrame(idx: number) {
    setFrames(prev => prev.filter((_, i) => i !== idx));
    if (currentFrame >= idx) setCurrentFrame(-1);
  }

  function jumpToFrame(idx: number) {
    setElements(frames[idx]);
    setCurrentFrame(idx);
  }

  function playAnimation() {
    if (frames.length === 0) return;
    setIsPlaying(true);
    let i = 0;
    const interval = setInterval(() => {
      setElements([...frames[i]]);
      setCurrentFrame(i);
      i++;
      if (i >= frames.length) {
        clearInterval(interval);
        setIsPlaying(false);
        setCurrentFrame(-1);
      }
    }, 900);
    playIntervalRef.current = interval;
  }

  function stopAnimation() {
    if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    setIsPlaying(false);
    setCurrentFrame(-1);
  }

  function clearFrames() {
    stopAnimation();
    setFrames([]);
    setCurrentFrame(-1);
    toast({ title: "Fotogrammi eliminati" });
  }

  function applyFormation(name: string) {
    const positions = FORMATIONS[name];
    if (!positions) return;
    const W = canvasSize.w;
    const H = canvasSize.h;
    const newPositions = makeFormation(positions, W, H);
    setElements(prev => {
      // Separate existing players from everything else
      const existingPlayers = prev.filter(e => e.type === "player");
      const nonPlayers     = prev.filter(e => e.type !== "player");
      // Merge: for each position slot, keep existing player data if available
      const merged = newPositions.map((pos, i) => {
        if (i < existingPlayers.length) {
          // Move existing player to new formation position, keep all their attributes
          return { ...existingPlayers[i], x: pos.x, y: pos.y, rotation: pos.rotation };
        }
        return pos; // Brand-new blank player for extra slots
      });
      // If existing roster is larger than formation → drop extras (user can always undo)
      return [...nonPlayers, ...merged];
    });
    setPlayerCounter(newPositions.length + 1);
  }

  function clearBoard() {
    if (!confirmClear) {
      setConfirmClear(true);
      toast({ title: "Cancella lavagna?", description: "Premi di nuovo il tasto 🗑 per confermare." });
      if (confirmClearTimeoutRef.current) clearTimeout(confirmClearTimeoutRef.current);
      confirmClearTimeoutRef.current = setTimeout(() => setConfirmClear(false), 3500);
      return;
    }
    setConfirmClear(false);
    if (confirmClearTimeoutRef.current) clearTimeout(confirmClearTimeoutRef.current);
    bgImgRef.current = null;
    setElements([]);
    setPlayerCounter(1);
    setOpponentCounter(1);
    setSelectedId(null);
    setHistory([]);
    toast({ title: "Lavagna cancellata" });
  }

  function duplicateSelected() {
    if (!selectedId) {
      toast({ title: "Seleziona un elemento da duplicare", variant: "destructive" });
      return;
    }
    const el = elements.find(e => e.id === selectedId);
    if (!el) return;
    const duped: BoardElement = { ...el, id: uid(), x: (el.x ?? 0) + 20, y: (el.y ?? 0) + 20 };
    setElements(prev => { pushHistory(prev); return [...prev, duped]; });
    setSelectedId(duped.id);
    toast({ title: "Elemento duplicato" });
  }

  function saveTactic() {
    const name = tacticName.trim() || `Tattica ${new Date().toLocaleDateString("it-IT")}`;
    const updated = [...savedTactics.filter(s => s.name !== name), { name, elements }];
    setSavedTactics(updated);
    localStorage.setItem("ftb-tactics", JSON.stringify(updated));
    toast({ title: `Salvata "${name}"` });
    if (!tacticName.trim()) setTacticName(name);
  }

  function loadTactic(tactic: SavedTactic) {
    bgImgRef.current = null;
    setElements(tactic.elements);
    setShowLoad(false);
    const maxPlayer = tactic.elements.filter(e => e.type === "player" && e.label).reduce((m, e) => Math.max(m, parseInt(e.label || "0") || 0), 0);
    setPlayerCounter(maxPlayer + 1);
  }

  function deleteTactic(name: string) {
    const updated = savedTactics.filter(s => s.name !== name);
    setSavedTactics(updated);
    localStorage.setItem("ftb-tactics", JSON.stringify(updated));
  }

  function loadExerciseDrawing(ex: Exercise) {
    if (!ex.drawingData) {
      toast({ title: "Nessun disegno", description: `"${ex.title}" non ha ancora un disegno tattico.`, variant: "destructive" });
      return;
    }
    const img = new Image();
    img.onload = () => {
      bgImgRef.current = img;
      setElements([]);
      toast({ title: `Esercizio caricato: ${ex.title}`, description: "Disegno importato sulla lavagna. Puoi continuare a modificarlo." });
    };
    img.onerror = () => {
      toast({ title: "Errore", description: "Impossibile caricare il disegno.", variant: "destructive" });
    };
    img.src = ex.drawingData;
  }

  function openDraft(ex: Exercise) {
    setActiveDraft(ex);
    setDraftForm(emptyDraftForm(ex));
    setShowDrafts(false);

    // Prefer structured elements (fully editable) over PNG background
    if (ex.drawingElementsJson) {
      try {
        type EEl = { id: string; type: string; points: {x:number;y:number}[]; color: string; lineWidth: number; canvasW: number; canvasH: number };
        const raw: EEl[] = JSON.parse(ex.drawingElementsJson);
        const cw = canvasSize.w;
        const ch = canvasSize.h;

        const converted: BoardElement[] = raw.map(el => {
          const sx = cw / (el.canvasW ?? 420);
          const sy = ch / (el.canvasH ?? 280);

          if (el.type === "circle" && el.points.length >= 2) {
            // Approximate circle as a closed path (32 points)
            const [center, edge] = el.points;
            const r = Math.sqrt((edge.x - center.x) ** 2 + (edge.y - center.y) ** 2);
            const circlePts: Point[] = [];
            for (let i = 0; i <= 32; i++) {
              const a = (i / 32) * Math.PI * 2;
              circlePts.push({ x: (center.x + Math.cos(a) * r) * sx, y: (center.y + Math.sin(a) * r) * sy });
            }
            return { id: uid(), type: "path" as const, points: circlePts, color: el.color, lineWidth: el.lineWidth };
          }

          const scaledPts = el.points.map((p: {x:number;y:number}) => ({ x: p.x * sx, y: p.y * sy }));
          const type = (el.type === "path" ? "path" : el.type === "line" ? "line" : "arrow") as BoardElement["type"];
          return { id: uid(), type, points: scaledPts, color: el.color, lineWidth: el.lineWidth };
        });

        bgImgRef.current = null;
        setElements(converted);
        toast({ title: `Bozza aperta: ${ex.title}`, description: "Disegno caricato come elementi modificabili sulla lavagna." });
        return;
      } catch {
        // Fall through to PNG fallback
      }
    }

    // Fallback: use PNG as background reference (old-format drafts without structured elements)
    if (ex.drawingData) {
      const img = new Image();
      img.onload = () => {
        bgImgRef.current = img;
        setElements([]);
        toast({ title: `Bozza aperta: ${ex.title}`, description: "Disegno di riferimento caricato come sfondo (rinnova il disegno con gli strumenti per renderlo modificabile)." });
      };
      img.onerror = () => {
        setElements([]);
        toast({ title: `Bozza aperta: ${ex.title}`, description: "Nessun disegno." });
      };
      img.src = ex.drawingData;
    } else {
      bgImgRef.current = null;
      setElements([]);
      toast({ title: `Bozza aperta: ${ex.title}`, description: "Nessun disegno — puoi compilare i dettagli qui sotto." });
    }
  }

  async function saveDraft() {
    if (!activeDraft) return;
    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: draftForm.title,
        description: draftForm.description || null,
        durationMinutes: draftForm.durationMinutes ? Number(draftForm.durationMinutes) : null,
        playersRequired: draftForm.playersRequired ? Number(draftForm.playersRequired) : null,
        equipment: draftForm.equipment || null,
        trainingDay: draftForm.trainingDay || null,
        trainingPhase: draftForm.trainingPhase || null,
        isDraft: draftForm.isDraft,
        voiceNoteData: draftForm.voiceNoteData,
      };
      const res = await fetch(`/api/exercises/${activeDraft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Errore salvataggio");
      const updated = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/exercises"] });
      setActiveDraft(updated);
      toast({ title: draftForm.isDraft ? "Bozza salvata" : "Esercizio finalizzato!", description: draftForm.isDraft ? "Le modifiche sono state salvate." : "L'esercizio è ora in libreria come definitivo." });
    } catch {
      toast({ title: "Errore", description: "Impossibile salvare le modifiche.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }

  async function createNewExercise(e: React.FormEvent) {
    e.preventDefault();
    if (!newExForm.title.trim()) return;
    setIsCreating(true);
    try {
      // Capture current canvas drawing as PNG
      let drawingData: string | null = null;
      let drawingElementsJson: string | null = null;
      if (canvasRef.current) {
        drawingData = canvasRef.current.toDataURL("image/png");
      }
      if (elements.length > 0) {
        drawingElementsJson = JSON.stringify(
          elements.map(el => ({
            id: el.id, type: el.type, points: el.points ?? [],
            color: el.color ?? "#facc15", lineWidth: el.lineWidth ?? 2,
            canvasW: canvasSize.w, canvasH: canvasSize.h,
          }))
        );
      }
      const body: Record<string, unknown> = {
        title: newExForm.title.trim(),
        category: newExForm.category || null,
        teamId: newExForm.teamId ? Number(newExForm.teamId) : null,
        principio: newExForm.principio || null,
        trainingDay: newExForm.trainingDay || null,
        trainingPhase: newExForm.trainingPhase || null,
        durationMinutes: newExForm.durationMinutes ? Number(newExForm.durationMinutes) : null,
        playersRequired: newExForm.playersRequired ? Number(newExForm.playersRequired) : null,
        equipment: newExForm.equipment || null,
        description: newExForm.description || null,
        voiceNoteData: newExForm.voiceNoteData,
        isDraft: newExForm.isDraft,
        drawingData,
        drawingElementsJson,
      };
      const res = await fetch("/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Errore creazione");
      queryClient.invalidateQueries({ queryKey: ["/api/exercises"] });
      setNewExForm(emptyNewExForm());
      setShowNewExForm(false);
      toast({ title: newExForm.isDraft ? "Bozza creata!" : "Esercizio creato!", description: `"${newExForm.title}" salvato in libreria${elements.length > 0 ? " con disegno dalla lavagna" : ""}.` });
    } catch {
      toast({ title: "Errore", description: "Impossibile creare l'esercizio.", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  }

  const toolButtons: { key: ToolType; label: string; icon: React.ReactNode; color: string }[] = [
    { key: "player",     label: t.toolPlayer,     icon: <User className="w-4 h-4" />,       color: "bg-blue-600 hover:bg-blue-700" },
    { key: "opponent",   label: t.toolOpponent,   icon: <Users className="w-4 h-4" />,      color: "bg-red-600 hover:bg-red-700" },
    { key: "goalkeeper", label: "Portiere",        icon: <User className="w-4 h-4" />,       color: "bg-amber-500 hover:bg-amber-600 text-white" },
    { key: "ball",       label: t.toolBall,       icon: <Circle className="w-4 h-4" />,     color: "bg-gray-200 hover:bg-gray-300 text-gray-900" },
    { key: "cone",       label: t.toolCone,       icon: <Triangle className="w-4 h-4" />,   color: "bg-orange-500 hover:bg-orange-600" },
    { key: "goal",       label: "Porta",           icon: <Goal className="w-4 h-4" />,      color: "bg-zinc-700 hover:bg-zinc-600" },
    { key: "draw",       label: t.toolDraw,       icon: <Pencil className="w-4 h-4" />,     color: "bg-yellow-500 hover:bg-yellow-600 text-gray-900" },
    { key: "line",       label: "Linea",           icon: <Minus className="w-4 h-4" />,     color: "bg-white hover:bg-gray-100 text-gray-900 border border-gray-300" },
    { key: "arrow",      label: t.toolArrow,      icon: <ArrowRight className="w-4 h-4" />, color: "bg-sky-500 hover:bg-sky-600" },
    { key: "text",       label: "Testo",           icon: <Type className="w-4 h-4" />,      color: "bg-purple-600 hover:bg-purple-700" },
    { key: "curve",      label: "Curva",           icon: <Spline className="w-4 h-4" />,    color: "bg-white/20 hover:bg-white/30 text-white border border-white/40" },
    { key: "curveArrow", label: "Freccia curva",   icon: <GitBranch className="w-4 h-4" />, color: "bg-sky-400 hover:bg-sky-500" },
    { key: "eraser",     label: t.toolEraser,     icon: <Eraser className="w-4 h-4" />,    color: "bg-zinc-600 hover:bg-zinc-700" },
  ];

  // Left toolbar: the 9 primary tools shown in the vertical sidebar
  const leftToolItems: ToolType[] = ["player", "opponent", "goalkeeper", "ball", "cone", "goal", "arrow", "line", "text"];



  return (
    <div
      className="flex flex-col overflow-hidden bg-[#111827] -m-4 sm:-m-6 lg:-m-8 h-[calc(100vh-4rem)]"
    >

      {/* ── Touch drag ghost ── */}
      {touchGhostTool && (() => {
        const tb = toolButtons.find(t => t.key === touchGhostTool.tool);
        return (
          <div className="fixed z-[9999] pointer-events-none" style={{ left: touchGhostTool.x - 28, top: touchGhostTool.y - 28, transition: "none" }}>
            <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center shadow-2xl opacity-80 border-2 border-white/40 ${tb?.color ?? "bg-primary"}`}>
              <span className="w-6 h-6 flex items-center justify-center text-white">{tb?.icon}</span>
              <span className="text-[8px] font-bold text-white mt-0.5 truncate px-1">{tb?.label}</span>
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════
          MOBILE LAYOUT (below xl)
          Matches reference image: dark chrome, icon-only bars
          ══════════════════════════════════════════════ */}

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-5 h-14 shrink-0 relative" style={{ background: "#111827" }}>
        {/* Left actions */}
        <div className="flex items-center gap-5">
          {/* Folder icon → dropdown */}
          <button
            onPointerDown={() => { setShowFolderMenu(v => !v); setShowSaveMenu(false); setShowMobileFormations(false); setShowLoad(false); setShowTeamsSubbar(false); setShowFramePanel(false); }}
            className={`transition-all active:scale-90 ${showFolderMenu ? "text-primary" : "text-white/80 active:text-white"}`}
            title="Carica"
          >
            <FolderOpen className="w-6 h-6" />
          </button>
          {/* Save icon → dropdown */}
          <button
            onPointerDown={() => { setShowSaveMenu(v => !v); setShowFolderMenu(false); setShowMobileFormations(false); setShowTeamsSubbar(false); setShowFramePanel(false); }}
            className={`transition-all active:scale-90 ${showSaveMenu ? "text-primary" : "text-white/80 active:text-white"}`}
            title="Salva / Esporta"
          >
            <Save className="w-6 h-6" />
          </button>
          {/* Animations / frame panel */}
          <button
            onPointerDown={() => { setShowFramePanel(v => !v); setShowFolderMenu(false); setShowSaveMenu(false); setShowMobileFormations(false); setShowTeamsSubbar(false); }}
            className={`transition-all active:scale-90 ${showFramePanel ? "text-violet-400" : "text-white/80 active:text-white"}`}
            title="Azioni in movimento"
          >
            <Video className="w-6 h-6" />
          </button>
        </div>
        {/* Right actions */}
        <div className="flex items-center gap-5">
          {/* Settings */}
          <button
            onPointerDown={() => setSettingsOpen(v => !v)}
            className={`transition-all active:scale-90 ${settingsOpen ? "text-primary" : "text-white/80 active:text-white"}`}
            title="Impostazioni"
          >
            <Settings className="w-6 h-6" />
          </button>
          {/* Clear board */}
          <button
            onPointerDown={clearBoard}
            className={`transition-all active:scale-90 ${confirmClear ? "text-red-400 scale-110" : "text-white/80 active:text-red-400"}`}
            title="Cancella tutto"
          >
            <Trash2 className="w-6 h-6" />
          </button>
          {/* Panel right toggle */}
          <button
            onPointerDown={() => { setShowRightPanel(v => !v); setShowFolderMenu(false); setShowSaveMenu(false); setShowLoad(false); setShowFramePanel(false); setShowTeamsSubbar(false); }}
            className={`transition-all active:scale-90 ${showRightPanel ? "text-primary" : "text-white/80 active:text-white"}`}
            title="Dettagli & Strumenti"
          >
            <PanelRight className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* ── Folder dropdown menu ── */}
      {showFolderMenu && (
        <div className="shrink-0 px-3 pb-2" style={{ background: "#1f2937" }}>
          <div className="rounded-xl border border-white/10 bg-zinc-900 overflow-hidden">
            {[
              { label: "Carica Lavagna", icon: <FolderOpen className="w-4 h-4" />, action: () => { setShowLoad(v => !v); setShowTeamsSubbar(false); setShowMobileFormations(false); setShowFolderMenu(false); } },
              { label: "Carica Rosa", icon: <Users className="w-4 h-4" />, action: () => { setShowTeamsSubbar(v => !v); setShowLoad(false); setShowMobileFormations(false); setShowFolderMenu(false); } },
              { label: "Carica Modulo", icon: <LayoutGrid className="w-4 h-4" />, action: () => { setShowMobileFormations(v => !v); setShowLoad(false); setShowTeamsSubbar(false); setShowFolderMenu(false); } },
            ].map(item => (
              <button key={item.label} onPointerDown={item.action} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-white/80 hover:bg-white/5 hover:text-white transition-colors border-b border-white/5 last:border-0">
                <span className="text-white/50">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Save / export dropdown menu ── */}
      {showSaveMenu && (
        <div className="shrink-0 px-3 pb-2" style={{ background: "#1f2937" }}>
          <div className="rounded-xl border border-white/10 bg-zinc-900 overflow-hidden">
            {[
              { label: "Salva", icon: <Save className="w-4 h-4" />, action: () => { saveTactic(); setShowSaveMenu(false); } },
              { label: "Esporta sulla galleria", icon: <Download className="w-4 h-4" />, action: () => {
                if (canvasRef.current) {
                  const link = document.createElement("a");
                  link.download = `${tacticName || "tattica"}.png`;
                  link.href = canvasRef.current.toDataURL("image/png");
                  link.click();
                }
                setShowSaveMenu(false);
              }},
              { label: "Esporta e condividi", icon: <Copy className="w-4 h-4" />, action: async () => {
                if (canvasRef.current) {
                  try {
                    const blob = await new Promise<Blob | null>(res => canvasRef.current!.toBlob(res));
                    if (blob && navigator.canShare?.({ files: [new File([blob], "tattica.png", { type: "image/png" })] })) {
                      await navigator.share({ files: [new File([blob], "tattica.png", { type: "image/png" })], title: tacticName || "Tattica" });
                    } else {
                      const link = document.createElement("a");
                      link.download = `${tacticName || "tattica"}.png`;
                      link.href = canvasRef.current.toDataURL();
                      link.click();
                    }
                  } catch {}
                }
                setShowSaveMenu(false);
              }},
            ].map(item => (
              <button key={item.label} onPointerDown={item.action} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-white/80 hover:bg-white/5 hover:text-white transition-colors border-b border-white/5 last:border-0">
                <span className="text-white/50">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Load tactics panel ── */}
      {showLoad && (
        <div className="shrink-0 px-3 pb-2" style={{ background: "#1f2937" }}>
          <div className="flex items-center justify-between py-1.5 px-1 mb-1">
            <span className="text-xs font-bold text-white/50 uppercase tracking-widest">Tattiche salvate</span>
            <button onPointerDown={() => setShowLoad(false)} className="text-white/30 hover:text-white/70"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="rounded-xl border border-white/10 bg-zinc-900 p-2 max-h-48 overflow-y-auto">
            {savedTactics.length === 0 ? (
              <p className="text-xs text-white/40 text-center py-3">Nessuna tattica salvata</p>
            ) : savedTactics.map(s => (
              <div key={s.name} className="flex items-center gap-1">
                <button onClick={() => { loadTactic(s); setShowLoad(false); }} className="flex-1 text-left px-3 py-2 rounded text-xs font-medium text-white/80 hover:text-white hover:bg-white/5 truncate">
                  {s.name}
                </button>
                <button onClick={() => deleteTactic(s.name)} className="p-1.5 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Teams sub-toolbar (Carica Rosa) ── */}
      {showTeamsSubbar && (
        <div className="shrink-0 px-3 pb-2" style={{ background: "#1f2937" }}>
          <div className="flex items-center justify-between py-1.5 px-1 mb-1">
            <span className="text-xs font-bold text-white/50 uppercase tracking-widest">Carica Rosa</span>
            <button onPointerDown={() => setShowTeamsSubbar(false)} className="text-white/30 hover:text-white/70"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            {myTeams.length === 0 ? (
              <p className="text-xs text-white/40 py-2">Nessuna squadra assegnata</p>
            ) : myTeams.map(team => (
              <button
                key={team.id}
                onPointerDown={() => {
                  // Load team roster as players on the board
                  fetch(`/api/teams/${team.id}/members`, { credentials: "include" })
                    .then(r => r.ok ? r.json() : [])
                    .then((members: Array<{ id?: number; first_name: string; last_name: string; role?: string | null; jerseyNumber?: number | null }>) => {
                      if (members.length === 0) {
                        toast({ title: `Rosa ${team.name}`, description: "Nessun giocatore in questa squadra.", variant: "destructive" });
                        return;
                      }
                      const W = canvasSize.w, H = canvasSize.h;
                      const isPortrait = H > W * 1.1;
                      const cols = isPortrait ? 3 : 4;
                      const startX = W * (isPortrait ? 0.12 : 0.10);
                      const startY = H * (isPortrait ? 0.55 : 0.20);
                      const spacing = W * (isPortrait ? 0.28 : 0.18);
                      const rowH   = H * (isPortrait ? 0.12 : 0.15);
                      const newPlayers: BoardElement[] = members.slice(0, 20).map((m, i) => ({
                        id: uid(),
                        type: "player" as const,
                        x: startX + (i % cols) * spacing,
                        y: startY + Math.floor(i / cols) * rowH,
                        label: m.jerseyNumber != null ? String(m.jerseyNumber) : String(i + 1),
                        playerName: `${m.first_name} ${m.last_name}`,
                        playerRole: m.role ?? undefined,
                      }));
                      setElements(prev => { pushHistory(prev); return [...prev.filter(e => e.type !== "player"), ...newPlayers]; });
                      setPlayerCounter(newPlayers.length + 1);
                      toast({ title: `Rosa ${team.name} caricata`, description: `${newPlayers.length} giocatori aggiunti alla lavagna.` });
                      setShowTeamsSubbar(false);
                    });
                }}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600/80 hover:bg-blue-600 text-white transition-all active:scale-95"
              >
                {team.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Frame / animation panel ── */}
      {showFramePanel && (
        <div className="shrink-0 px-3 pb-2 space-y-2" style={{ background: "#1f2937" }}>
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={addFrame} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white transition-all">
              <Camera className="w-3 h-3" /> Aggiungi fotogramma
            </button>
            {frames.length >= 2 && !isPlaying && (
              <button onClick={playAnimation} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white transition-all">
                <Play className="w-3 h-3" /> Riproduci ({frames.length})
              </button>
            )}
            {isPlaying && (
              <button onClick={stopAnimation} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white animate-pulse">
                <Square className="w-3 h-3" /> Ferma
              </button>
            )}
            {frames.length > 0 && !isPlaying && (
              <button onClick={clearFrames} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white/70 transition-all">
                <Trash2 className="w-3 h-3" /> Elimina
              </button>
            )}
          </div>
          {frames.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {frames.map((_, idx) => (
                <div key={idx} onClick={() => jumpToFrame(idx)} className={`relative shrink-0 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${currentFrame === idx ? "border-violet-500" : "border-white/20"}`}>
                  <div className="w-12 h-9 bg-[#2d6a4f] flex items-center justify-center">
                    <span className="text-white/80 text-sm font-bold">{idx + 1}</span>
                  </div>
                  {!isPlaying && (
                    <button onClick={e => { e.stopPropagation(); removeFrame(idx); }} className="absolute top-0 right-0 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Formations popup ── */}
      {showMobileFormations && (
        <div className="shrink-0 px-3 pb-3 max-h-72 overflow-y-auto" style={{ background: "#1f2937" }}>
          {/* Standard formations */}
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Formazioni standard</span>
            <button onPointerDown={() => setShowMobileFormations(false)} className="text-white/30 hover:text-white/60"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {Object.keys(FORMATIONS).map(name => (
              <button
                key={name}
                onPointerDown={() => { applyFormation(name); setShowMobileFormations(false); }}
                className="px-2 py-2 rounded-xl text-xs font-bold bg-white/10 text-white border border-white/10 active:scale-95 transition-transform"
              >
                {name}
              </button>
            ))}
          </div>
          {/* Moduli squadra — exercises saved as formation drawings */}
          {(() => {
            const moduliExs = exercises.filter(ex =>
              !ex.isDraft &&
              (ex.category?.toLowerCase().includes("moduli") || ex.title?.toLowerCase().includes("modulo") || ex.trainingPhase?.toLowerCase().includes("moduli"))
            );
            return (
              <>
                <div className="mt-3 mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Moduli squadra</span>
                  {moduliExs.length > 0 && <span className="text-[9px] text-white/30">{moduliExs.length}</span>}
                </div>
                {moduliExs.length === 0 ? (
                  <div className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.12)" }}>
                    <LayoutGrid className="w-4 h-4 text-white/25" />
                    <p className="text-[10px] text-white/35 text-center leading-relaxed">
                      Nessun modulo trovato.<br/>Salva un esercizio con titolo o categoria <em>"Modulo"</em>.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {moduliExs.map(ex => (
                      <button
                        key={ex.id}
                        onPointerDown={() => { loadExerciseDrawing(ex); setShowMobileFormations(false); }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-primary/15 text-primary border border-primary/20 active:scale-95 transition-transform"
                      >
                        <LayoutGrid className="w-3 h-3" />
                        {ex.title}
                      </button>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ── Settings / new exercise sheet ── */}
      {showMobileSettings && (
        <div className="shrink-0 px-3 pb-2 overflow-y-auto max-h-64" style={{ background: "#1f2937" }}>
          <form onSubmit={createNewExercise} className="space-y-2 pt-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-white/60 uppercase tracking-widest">Nuova Esercitazione</span>
              {elements.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">{elements.length} elementi</span>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={newExForm.title}
                onChange={e => setNewExForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Titolo *"
                required
                className="col-span-2 h-9 rounded-lg bg-white/10 border border-white/10 text-white text-sm px-3 placeholder-white/30 focus:outline-none focus:border-primary"
              />
              <input
                type="number" min={0}
                value={newExForm.durationMinutes}
                onChange={e => setNewExForm(f => ({ ...f, durationMinutes: e.target.value }))}
                placeholder="Durata (min)"
                className="h-9 rounded-lg bg-white/10 border border-white/10 text-white text-sm px-3 placeholder-white/30 focus:outline-none"
              />
              <input
                type="number" min={0}
                value={newExForm.playersRequired}
                onChange={e => setNewExForm(f => ({ ...f, playersRequired: e.target.value }))}
                placeholder="Giocatori"
                className="h-9 rounded-lg bg-white/10 border border-white/10 text-white text-sm px-3 placeholder-white/30 focus:outline-none"
              />
            </div>
            <textarea
              value={newExForm.description}
              onChange={e => setNewExForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Descrizione..."
              rows={2}
              className="w-full rounded-lg bg-white/10 border border-white/10 text-white text-sm px-3 py-2 placeholder-white/30 focus:outline-none resize-none"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isCreating || !newExForm.title.trim()}
                className="flex-1 h-9 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40"
              >
                {isCreating ? "..." : "Pubblica"}
              </button>
              <button type="button" onPointerDown={() => setShowMobileSettings(false)} className="h-9 px-4 rounded-lg bg-white/10 text-white/70 text-sm">
                Chiudi
              </button>
            </div>
          </form>
        </div>
      )}


      {/* ── Impostazioni full-screen overlay ── */}
      {settingsOpen && (
        <div className="absolute inset-0 z-50 flex flex-col overflow-y-auto" style={{ background: "#111827" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <button onPointerDown={() => setSettingsOpen(false)} className="text-white/70 active:text-white transition-all">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className="text-base font-semibold text-white">Impostazioni</span>
            <button onPointerDown={() => { setFieldType('full'); setFieldBgColor('#2d6a4f'); setShowPlayerName(false); setShowPlayerRole(false); setShowPlayerDirection(false); setPlayerElementSize(14); }} className="text-white/50 active:text-white transition-all">
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 px-4 py-4 space-y-5">
            {/* ── Tema + Orientamento row ── */}
            <div className="grid grid-cols-2 gap-3">
              {/* Tema */}
              <div className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                <p className="text-xs text-white/50 mb-2 flex items-center gap-1">
                  <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" className="opacity-60"><path d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2zm0 14a6 6 0 1 1 0-12 6 6 0 0 1 0 12z"/></svg>
                  Tema
                </p>
                <div className="flex rounded-xl overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
                  {([["auto","⊙"],["light","☀"],["dark","☽"]] as const).map(([val, icon]) => (
                    <button key={val} className="flex-1 py-1.5 text-sm flex items-center justify-center transition-all"
                      style={{ background: settingsTema === val ? "rgba(255,255,255,0.18)" : "transparent", color: settingsTema === val ? "white" : "rgba(255,255,255,0.4)" }}
                      onPointerDown={() => setSettingsTema(val)}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              {/* Orientamento */}
              <div className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                <p className="text-xs text-white/50 mb-2 flex items-center gap-1">
                  <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-60"><rect x="5" y="2" width="10" height="16" rx="2"/></svg>
                  Orientamento
                </p>
                <div className="flex rounded-xl overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
                  {([
                    ["auto",<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" key="a"><path d="M8 1 L8 15M1 8 L15 8"/><circle cx="8" cy="8" r="3"/></svg>],
                    ["portrait",<svg viewBox="0 0 12 18" width="10" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" key="p"><rect x="1" y="1" width="10" height="16" rx="2"/><line x1="4" y1="14" x2="8" y2="14"/></svg>],
                    ["landscape",<svg viewBox="0 0 18 12" width="15" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" key="l"><rect x="1" y="1" width="16" height="10" rx="2"/><line x1="14" y1="4" x2="14" y2="8"/></svg>],
                  ] as const).map(([val, icon]) => (
                    <button key={val} className="flex-1 py-1.5 flex items-center justify-center transition-all"
                      style={{ background: settingsOrientation === val ? "rgba(255,255,255,0.18)" : "transparent", color: settingsOrientation === val ? "white" : "rgba(255,255,255,0.4)" }}
                      onPointerDown={() => setSettingsOrientation(val)}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Campo ── */}
            <div>
              <p className="text-sm font-semibold text-white mb-2 text-center">Campo</p>
              <div className="rounded-2xl p-3 flex gap-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                {/* Preview */}
                <div className="shrink-0 w-20 h-28 rounded-xl overflow-hidden flex items-center justify-center" style={{ background: fieldBgColor }}>
                  <svg viewBox="0 0 50 70" width="48" height="66" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2">
                    <rect x="3" y="3" width="44" height="64" rx="1"/>
                    <circle cx="25" cy="35" r="8"/>
                    <line x1="3" y1="35" x2="47" y2="35"/>
                    <rect x="15" y="3" width="20" height="8"/>
                    <rect x="15" y="59" width="20" height="8"/>
                  </svg>
                </div>
                <div className="flex-1 space-y-3">
                  {/* Tipo */}
                  <div>
                    <p className="text-[11px] text-white/50 mb-1.5 flex items-center gap-1">
                      <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" className="opacity-60"><path d="M1 1h14v14H1z" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
                      Tipo
                    </p>
                    <div className="flex gap-1.5">
                      {([
                        ["full",      <svg key="f" viewBox="0 0 20 28" width="16" height="22" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="18" height="26"/><line x1="1" y1="14" x2="19" y2="14"/><circle cx="10" cy="14" r="4"/></svg>],
                        ["half-top",  <svg key="ht" viewBox="0 0 20 16" width="16" height="13" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="18" height="14"/><line x1="1" y1="14" x2="19" y2="14"/><path d="M5 14 A5 5 0 0 1 15 14"/></svg>],
                        ["half-bottom",<svg key="hb" viewBox="0 0 20 16" width="16" height="13" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="18" height="14"/><line x1="1" y1="1" x2="19" y2="1"/><path d="M5 1 A5 5 0 0 0 15 1"/></svg>],
                        ["half-left", <svg key="hl" viewBox="0 0 16 20" width="13" height="16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="14" height="18"/><line x1="1" y1="1" x2="1" y2="19"/><path d="M1 5 A5 5 0 0 1 1 15"/></svg>],
                        ["half-right",<svg key="hr" viewBox="0 0 16 20" width="13" height="16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="14" height="18"/><line x1="15" y1="1" x2="15" y2="19"/><path d="M15 5 A5 5 0 0 0 15 15"/></svg>],
                      ] as const).map(([val, icon]) => (
                        <button key={val} onPointerDown={() => setFieldType(val)}
                          className="w-9 h-9 rounded-lg flex items-center justify-center transition-all active:scale-90"
                          style={{ background: fieldType === val ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.07)", border: fieldType === val ? "2px solid rgba(255,255,255,0.5)" : "2px solid transparent", color: "white" }}>
                          {icon}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Sfondo */}
                  <div>
                    <p className="text-[11px] text-white/50 mb-1.5 flex items-center gap-1">
                      <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" className="opacity-60"><path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2z"/></svg>
                      Sfondo
                    </p>
                    <div className="flex gap-2">
                      {["#2d6a4f","#1e88e5","#a8d5a2","#ffffff","#9e9e9e"].map(c => (
                        <button key={c} onPointerDown={() => setFieldBgColor(c)}
                          className="w-7 h-7 rounded-full transition-all active:scale-90"
                          style={{ background: c, border: fieldBgColor === c ? "3px solid rgba(255,255,255,0.9)" : "2px solid rgba(255,255,255,0.25)" }}/>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Giocatori ── */}
            <div>
              <p className="text-sm font-semibold text-white mb-2 text-center">Giocatori</p>
              <div className="rounded-2xl p-3 flex gap-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                {/* Preview */}
                <div className="shrink-0 w-20 h-28 rounded-xl flex flex-col items-center justify-center gap-1" style={{ background: "rgba(45,106,79,0.6)" }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: "#2563eb" }}>1</div>
                  {showPlayerName && <span className="text-[9px] text-white font-semibold">Nome</span>}
                </div>
                <div className="flex-1 space-y-2">
                  {/* Nome toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/70 flex items-center gap-1">
                      <span className="text-[11px] font-bold">Aa</span> Nome
                    </span>
                    <button onPointerDown={() => setShowPlayerName(v => !v)}
                      className="w-10 h-5 rounded-full relative transition-all"
                      style={{ background: showPlayerName ? "#2563eb" : "rgba(255,255,255,0.15)" }}>
                      <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all" style={{ left: showPlayerName ? "calc(100% - 18px)" : "2px" }}/>
                    </button>
                  </div>
                  {/* Ruolo toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/70 flex items-center gap-1">
                      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-60"><circle cx="8" cy="5" r="3"/><path d="M2 14a6 6 0 0 1 12 0"/></svg>
                      Ruolo
                    </span>
                    <button onPointerDown={() => setShowPlayerRole(v => !v)}
                      className="w-10 h-5 rounded-full relative transition-all"
                      style={{ background: showPlayerRole ? "#2563eb" : "rgba(255,255,255,0.15)" }}>
                      <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all" style={{ left: showPlayerRole ? "calc(100% - 18px)" : "2px" }}/>
                    </button>
                  </div>
                  {/* Direzione toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/70 flex items-center gap-1">
                      <ChevronRight className="w-3 h-3 opacity-60"/> Direzione
                    </span>
                    <button onPointerDown={() => setShowPlayerDirection(v => !v)}
                      className="w-10 h-5 rounded-full relative transition-all"
                      style={{ background: showPlayerDirection ? "#2563eb" : "rgba(255,255,255,0.15)" }}>
                      <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all" style={{ left: showPlayerDirection ? "calc(100% - 18px)" : "2px" }}/>
                    </button>
                  </div>
                  {/* Misura slider */}
                  <div>
                    <span className="text-xs text-white/70 flex items-center gap-1 mb-1">
                      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-60"><path d="M2 8h12M8 2v12"/><circle cx="8" cy="8" r="6"/></svg>
                      Misura
                    </span>
                    <input type="range" min={10} max={22} value={playerElementSize}
                      onChange={e => setPlayerElementSize(Number(e.target.value))}
                      className="w-full accent-blue-500" style={{ height: 4 }}/>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Squadre ── */}
            <div>
              <p className="text-sm font-semibold text-white mb-2 text-center">Squadre</p>
              <div className="rounded-2xl p-3 flex gap-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                {/* Preview */}
                <div className="shrink-0 w-20 h-28 rounded-xl flex items-center justify-center" style={{ background: "rgba(45,106,79,0.6)" }}>
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: "#2563eb" }}>1</div>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: "#dc2626" }}>2</div>
                  </div>
                </div>
                <div className="flex-1 space-y-2.5">
                  {[
                    { num: 1, label: "Squadra A", color: "#2563eb", active: true, setActive: null as null | ((v: boolean) => void) },
                    { num: 2, label: "Squadra B", color: "#dc2626", active: true, setActive: null },
                    { num: 3, label: "Squadra C", color: "#16a34a", active: activeTeamC, setActive: setActiveTeamC as (v: boolean) => void },
                    { num: 4, label: "Squadra D", color: "#f9fafb", active: activeTeamD, setActive: setActiveTeamD as (v: boolean) => void },
                  ].map(sq => (
                    <div key={sq.num} className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0" style={{ background: sq.color, color: sq.color === "#f9fafb" ? "#111" : "white", opacity: sq.active ? 1 : 0.3 }}>{sq.num}</div>
                      <span className="text-xs flex-1" style={{ color: sq.active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)" }}>{sq.label}</span>
                      {sq.setActive !== null && (
                        <button
                          onPointerDown={() => sq.setActive?.(!sq.active)}
                          className="w-9 h-5 rounded-full relative transition-all shrink-0"
                          style={{ background: sq.active ? "#3b82f6" : "rgba(255,255,255,0.12)" }}
                        >
                          <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm"
                            style={{ left: sq.active ? "calc(100% - 18px)" : "2px" }}/>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Nome tattica ── */}
            <div className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.05)" }}>
              <p className="text-xs text-white/50 mb-2">Nome tattica</p>
              <input
                value={tacticName}
                onChange={e => setTacticName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && saveTactic()}
                placeholder="Nome tattica..."
                className="w-full h-9 rounded-xl bg-white/10 border border-white/10 text-white text-sm px-3 placeholder-white/30 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* ── Contatori ── */}
            <div className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.05)" }}>
              <p className="text-xs text-white/50 mb-2">Contatori partenza</p>
              <div className="flex gap-4">
                <div className="flex-1 flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-blue-600 shrink-0"/>
                  <input type="number" min={1} max={99} value={playerCounter} onChange={e => setPlayerCounter(Number(e.target.value))}
                    className="flex-1 h-8 rounded-lg bg-white/10 text-white text-sm text-center border border-white/10 focus:outline-none focus:border-blue-500"/>
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-red-600 shrink-0"/>
                  <input type="number" min={1} max={99} value={opponentCounter} onChange={e => setOpponentCounter(Number(e.target.value))}
                    className="flex-1 h-8 rounded-lg bg-white/10 text-white text-sm text-center border border-white/10 focus:outline-none focus:border-blue-500"/>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN AREA ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">

        {/* ── CANVAS AREA ── */}
        <div ref={containerRef} className="flex-1 min-w-0 flex flex-col overflow-hidden">

          {/* Canvas — fills remaining space */}
          <div
            className="flex-1 overflow-hidden relative mx-2 my-1 rounded-xl"
            style={{ background: FIELD_COLOR }}
          >
            <canvas
              ref={canvasRef}
              width={Math.round(canvasSize.w * (window.devicePixelRatio || 1))}
              height={Math.round(canvasSize.h * (window.devicePixelRatio || 1))}
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                cursor: dragElement
                  ? "grabbing"
                  : (["player","opponent","goalkeeper","ball","cone","goal","text","goalLarge","disc","cinesino","sagoma","flag","ladder","hurdle","pole","vest"] as const).includes(tool as any)
                    ? "copy"
                    : "crosshair",
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
              onMouseDown={handleCanvasDown}
              onMouseMove={handleCanvasMove}
              onMouseUp={e => handleCanvasUp(e)}
              onMouseLeave={() => handleCanvasUp()}
              onDragOver={handleCanvasDragOver}
              onDrop={handleCanvasDrop}
            />

            {/* ── Equipment / Materiale LEFT SIDEBAR ── */}
            {showEquipSubbar && (
              <div
                className="absolute left-0 top-0 bottom-0 z-20 flex flex-col items-center py-2 gap-0.5 overflow-y-auto"
                style={{ width: 52, background: "rgba(8,10,16,0.93)", backdropFilter: "blur(8px)", borderRight: "1px solid rgba(255,255,255,0.06)", scrollbarWidth: "none" }}
                onPointerDown={e => e.stopPropagation()}
              >
                {([
                  // ⚽ Ball — detailed pentagon pattern
                  ["ball", <svg key="ball" viewBox="0 0 28 28" width="24" height="24">
                    <defs><clipPath id="ballClip"><circle cx="14" cy="14" r="11"/></clipPath></defs>
                    <circle cx="14" cy="14" r="11" fill="white" stroke="#555" strokeWidth="1.5"/>
                    <polygon points="14,5 17,9 15,13 11,13 9,9" fill="#222" clipPath="url(#ballClip)"/>
                    <polygon points="23,11 20,14 22,18 26,16 27,12" fill="#222" clipPath="url(#ballClip)"/>
                    <polygon points="5,11 8,14 6,18 2,16 1,12" fill="#222" clipPath="url(#ballClip)"/>
                    <polygon points="14,23 11,19 13,15 15,15 17,19" fill="#222" clipPath="url(#ballClip)"/>
                    <circle cx="14" cy="14" r="11" fill="none" stroke="#555" strokeWidth="1.5"/>
                  </svg>],
                  // 🥅 Grande porta — net + frame
                  ["goalLarge", <svg key="gl" viewBox="0 0 30 20" width="28" height="18">
                    <rect x="1" y="1" width="28" height="14" fill="rgba(255,255,255,0.06)" stroke="white" strokeWidth="2" rx="1"/>
                    <rect x="1" y="15" width="28" height="4" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.5)" strokeWidth="1"/>
                    {[5,9,13,17,21,25].map(x => <line key={x} x1={x} y1="1" x2={x} y2="15" stroke="rgba(255,255,255,0.3)" strokeWidth="0.7"/>)}
                    {[5,9,13].map(y => <line key={y} x1="1" y1={y} x2="29" y2={y} stroke="rgba(255,255,255,0.3)" strokeWidth="0.7"/>)}
                  </svg>],
                  // 🥅 Porta piccola
                  ["goal", <svg key="gs" viewBox="0 0 26 18" width="26" height="18">
                    <rect x="1" y="1" width="24" height="12" fill="rgba(255,255,255,0.06)" stroke="white" strokeWidth="2" rx="1"/>
                    <rect x="1" y="13" width="24" height="4" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.5)" strokeWidth="1"/>
                    {[5,9,13,17,21].map(x => <line key={x} x1={x} y1="1" x2={x} y2="13" stroke="rgba(255,255,255,0.3)" strokeWidth="0.7"/>)}
                    <line x1="1" y1="6" x2="25" y2="6" stroke="rgba(255,255,255,0.3)" strokeWidth="0.7"/>
                  </svg>],
                  // 🔴 Disco piatto
                  ["disc", <svg key="disc" viewBox="0 0 28 16" width="28" height="14">
                    <ellipse cx="14" cy="10" rx="12" ry="5" fill="#991b1b" stroke="#7f1d1d" strokeWidth="1"/>
                    <ellipse cx="14" cy="8" rx="12" ry="5" fill="#ef4444" stroke="#991b1b" strokeWidth="1.2"/>
                    <ellipse cx="14" cy="7.5" rx="7" ry="2.5" fill="rgba(255,255,255,0.15)"/>
                  </svg>],
                  // 🟡 Cinesino (flat cone)
                  ["cinesino", <svg key="cin" viewBox="0 0 28 16" width="28" height="14">
                    <ellipse cx="14" cy="13" rx="11" ry="3" fill="#92400e" stroke="#78350f" strokeWidth="0.8"/>
                    <path d="M3 13 L8 7 L20 7 L25 13 Z" fill="#fbbf24" stroke="#d97706" strokeWidth="1"/>
                    <ellipse cx="14" cy="7" rx="6" ry="2" fill="#fde68a"/>
                  </svg>],
                  // 🔴 Cono alto 3D
                  ["cone", <svg key="cone" viewBox="0 0 24 26" width="22" height="24">
                    <ellipse cx="12" cy="23" rx="9" ry="3" fill="#b91c1c" stroke="#7f1d1d" strokeWidth="0.8"/>
                    <path d="M12 2 L21 23 L3 23 Z" fill="url(#coneGrad)" stroke="#991b1b" strokeWidth="1"/>
                    <defs><linearGradient id="coneGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#ef4444"/><stop offset="40%" stopColor="#fca5a5"/><stop offset="100%" stopColor="#ef4444"/></linearGradient></defs>
                    <line x1="8" y1="14" x2="16" y2="14" stroke="white" strokeWidth="1.5" opacity="0.7"/>
                    <line x1="10" y1="8" x2="14" y2="8" stroke="white" strokeWidth="1" opacity="0.5"/>
                  </svg>],
                  // 🧍 Sagoma umana
                  ["sagoma", <svg key="sag" viewBox="0 0 22 30" width="18" height="26">
                    <circle cx="11" cy="4.5" r="3.5" fill="#60a5fa" stroke="#2563eb" strokeWidth="1"/>
                    <path d="M7 9 Q11 8 15 9 L16 19 L14 19 L13 14 L11 14 L9 14 L8 19 L6 19 Z" fill="#3b82f6"/>
                    <line x1="6" y1="10" x2="3" y2="16" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round"/>
                    <line x1="16" y1="10" x2="19" y2="16" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round"/>
                    <line x1="8" y1="19" x2="7" y2="28" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round"/>
                    <line x1="14" y1="19" x2="15" y2="28" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>],
                  // 🚩 Bandierina
                  ["flag", <svg key="flag" viewBox="0 0 22 28" width="20" height="26">
                    <line x1="7" y1="3" x2="7" y2="26" stroke="#78350f" strokeWidth="2.2" strokeLinecap="round"/>
                    <circle cx="7" cy="26" r="2" fill="#a16207"/>
                    <path d="M7 3 L20 8 L7 14 Z" fill="#f97316" stroke="#ea580c" strokeWidth="0.8"/>
                    <line x1="10" y1="6" x2="17" y2="9" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8"/>
                  </svg>],
                  // 🪜 Scala di coordinazione
                  ["ladder", <svg key="lad" viewBox="0 0 30 22" width="28" height="20">
                    <rect x="1" y="1" width="28" height="20" rx="2" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5"/>
                    <line x1="3" y1="1" x2="3" y2="21" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round"/>
                    <line x1="27" y1="1" x2="27" y2="21" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round"/>
                    {[4.5,8.5,12.5,16.5,20.5].map(y => <line key={y} x1="3" y1={y} x2="27" y2={y} stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round"/>)}
                  </svg>],
                  // 🏃 Ostacolo (hurdle) con gambe
                  ["hurdle", <svg key="hur" viewBox="0 0 30 22" width="28" height="20">
                    <line x1="3" y1="10" x2="3" y2="21" stroke="#dc2626" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="27" y1="10" x2="27" y2="21" stroke="#dc2626" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="1" y1="21" x2="5" y2="21" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="25" y1="21" x2="29" y2="21" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round"/>
                    <rect x="2" y="9" width="26" height="3.5" rx="1.5" fill="#ef4444" stroke="#b91c1c" strokeWidth="0.8"/>
                    <line x1="8" y1="9" x2="8" y2="12.5" stroke="white" strokeWidth="1" opacity="0.4"/>
                    <line x1="14" y1="9" x2="14" y2="12.5" stroke="white" strokeWidth="1" opacity="0.4"/>
                    <line x1="20" y1="9" x2="20" y2="12.5" stroke="white" strokeWidth="1" opacity="0.4"/>
                  </svg>],
                  // 🟡 Paletto
                  ["pole", <svg key="pole" viewBox="0 0 14 30" width="12" height="28">
                    <ellipse cx="7" cy="28" rx="5" ry="2" fill="#78350f" opacity="0.8"/>
                    {([0,1,2,3,4] as number[]).map(i => (
                      <rect key={i} x="4" y={2 + i * 5.2} width="6" height="4.5" rx="1" fill={i % 2 === 0 ? "#fbbf24" : "#dc2626"}/>
                    ))}
                  </svg>],
                  // 👕 Pettorina
                  ["vest", <svg key="vest" viewBox="0 0 28 26" width="24" height="24">
                    <path d="M10 2 L5 7 L1 13 L5 15 L7 11 L7 23 L21 23 L21 11 L23 15 L27 13 L23 7 L18 2 L15 9 L13 9 Z" fill="#fbbf24" stroke="#d97706" strokeWidth="1"/>
                    <path d="M10 2 L13 9 L15 9 L18 2" fill="none" stroke="#d97706" strokeWidth="1"/>
                    <line x1="7" y1="15" x2="21" y2="15" stroke="rgba(0,0,0,0.2)" strokeWidth="1"/>
                    <line x1="7" y1="19" x2="21" y2="19" stroke="rgba(0,0,0,0.2)" strokeWidth="1"/>
                  </svg>],
                  // 🅃 Testo
                  ["text", <svg key="txt" viewBox="0 0 24 24" width="22" height="22"><rect x="2" y="2" width="20" height="20" rx="3" fill="none" stroke="white" strokeWidth="1.5"/><text x="12" y="17" textAnchor="middle" fontFamily="Arial" fontWeight="bold" fontSize="13" fill="white">T</text></svg>],
                  // 🎨 Colori
                  ["colori", <svg key="col" viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/><path d="M12 2 A10 10 0 0 1 22 12 L12 12 Z" fill="#2563eb"/><path d="M22 12 A10 10 0 0 1 12 22 L12 12 Z" fill="#dc2626"/><path d="M12 22 A10 10 0 0 1 2 12 L12 12 Z" fill="#eab308"/><path d="M2 12 A10 10 0 0 1 12 2 L12 12 Z" fill="#16a34a"/></svg>],
                ] as [ToolType | "colori", React.ReactNode][]).map(([id, icon]) => {
                  const isActive = tool === id;
                  return (
                    <button
                      key={id}
                      onPointerDown={() => {
                        if (id === "colori") { setShowEquipColorBar(v => !v); return; }
                        setTool(isActive ? null : id as ToolType);
                      }}
                      className="w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90 shrink-0"
                      style={{
                        background: id === "colori" ? (showEquipColorBar ? "rgba(255,255,255,0.22)" : "transparent") : (isActive ? "rgba(255,255,255,0.22)" : "transparent"),
                        border: id === "colori" ? (showEquipColorBar ? "2px solid rgba(255,255,255,0.55)" : "2px solid transparent") : (isActive ? "2px solid rgba(255,255,255,0.55)" : "2px solid transparent"),
                      }}
                    >
                      {icon}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Global equipment color palette bar ── */}
            {showEquipColorBar && (
              <div
                className="absolute bottom-16 left-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-2xl shadow-2xl"
                style={{ transform: "translateX(-50%)", background: "rgba(14,15,20,0.96)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}
                onPointerDown={e => e.stopPropagation()}
              >
                <span className="text-[10px] text-white/50 font-semibold mr-1 whitespace-nowrap">Colore attrezzi:</span>
                {[null,"#f5f5f5","#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#a855f7","#ec4899","#000000"].map(col => (
                  <button
                    key={col ?? "default"}
                    onPointerDown={() => {
                      setGlobalEquipColor(col);
                      globalEquipColorRef.current = col;
                      // Apply to ALL existing equipment on board
                      const EQUIP_TYPES = ["ball","cone","goal","goalLarge","disc","cinesino","sagoma","flag","ladder","hurdle","pole","vest"];
                      setElements(prev => prev.map(el =>
                        EQUIP_TYPES.includes(el.type)
                          ? { ...el, equipColor: col ?? undefined }
                          : el
                      ));
                    }}
                    style={{
                      background: col ?? "linear-gradient(135deg,#ccc 50%,#888 50%)",
                      width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                      border: globalEquipColor === col ? "3px solid white" : "2px solid rgba(255,255,255,0.2)",
                      boxShadow: globalEquipColor === col ? "0 0 0 2px #3b82f6" : "none",
                      position: "relative",
                    }}
                    title={col ?? "Colore predefinito"}
                  >
                    {col === null && <span style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:"#fff", fontWeight:"bold" }}>✕</span>}
                  </button>
                ))}
              </div>
            )}

            {/* ── Player counter overlay (bottom-right of field) ── */}
            <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1.5 pointer-events-auto">
              {/* Blue player counter */}
              <button
                onPointerDown={() => setTool(tool === "player" ? null : "player")}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold text-white shadow-lg transition-all active:scale-90 border-2 ${tool === "player" ? "border-white scale-110 shadow-xl" : "border-transparent"}`}
                style={{ background: "#2563eb" }}
                title="Giocatore"
              >
                {playerCounter}
              </button>
              {/* Red opponent counter */}
              <button
                onPointerDown={() => setTool(tool === "opponent" ? null : "opponent")}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold text-white shadow-lg transition-all active:scale-90 border-2 ${tool === "opponent" ? "border-white scale-110 shadow-xl" : "border-transparent"}`}
                style={{ background: "#dc2626" }}
                title="Avversario"
              >
                {opponentCounter}
              </button>
              {/* Ball icon */}
              <button
                onPointerDown={() => setTool(tool === "ball" ? null : "ball")}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-2xl shadow-lg transition-all active:scale-90 border-2 ${tool === "ball" ? "border-white scale-110 shadow-xl bg-white/20" : "border-transparent bg-black/20"}`}
                title="Palla"
              >
                ⚽
              </button>
            </div>
          </div>

          {/* ── Bottom toolbar ── */}
          <div
            className="flex items-center justify-between px-4 h-14 shrink-0 relative"
            style={{ background: "#111827" }}
          >
            {tool === "draw" ? (
              /* ── Draw sub-toolbar ── */
              <>
                <div className="flex items-center gap-5">
                  {/* Pen icon — green circle, tap to exit */}
                  <button
                    onPointerDown={() => { setTool(null); setShowLineTypePanel(false); setShowColorPanel(false); }}
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90"
                    style={{ background: "#4ade80" }}
                    title="Esci dalla penna"
                  >
                    <Pencil className="w-5 h-5 text-black" />
                  </button>
                  {/* Line type — shows current shape icon, opens panel */}
                  <button
                    onPointerDown={() => { setShowLineTypePanel(v => !v); setShowColorPanel(false); }}
                    className="text-white/80 transition-all active:scale-90"
                    title="Tipo di linea"
                  >
                    <svg viewBox="0 0 60 44" width="32" height="24">
                      {DRAW_TYPES.find(d => d.id === drawShape)?.svg}
                    </svg>
                  </button>
                  {/* Arrow end — cycles: none → end → start → both */}
                  <button
                    onPointerDown={() => {
                      const cycle: Array<'none'|'end'|'start'|'both'> = ['none','end','start','both'];
                      const idx = cycle.indexOf(drawArrowEnd);
                      setDrawArrowEnd(cycle[(idx + 1) % cycle.length]);
                    }}
                    className="text-white/80 transition-all active:scale-90"
                    title="Direzione freccia"
                  >
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                      {drawArrowEnd === 'none'  && <line x1="4" y1="20" x2="20" y2="4"/>}
                      {drawArrowEnd === 'end'   && <><line x1="4" y1="20" x2="20" y2="4"/><polyline points="12,4 20,4 20,12"/></>}
                      {drawArrowEnd === 'start' && <><line x1="4" y1="20" x2="20" y2="4"/><polyline points="12,20 4,20 4,12"/></>}
                      {drawArrowEnd === 'both'  && <><line x1="4" y1="20" x2="20" y2="4"/><polyline points="12,4 20,4 20,12"/><polyline points="12,20 4,20 4,12"/></>}
                    </svg>
                  </button>
                  {/* Color dot */}
                  <button
                    onPointerDown={() => { setShowColorPanel(v => !v); setShowLineTypePanel(false); setShowThicknessPanel(false); }}
                    className="w-7 h-7 rounded-full border-2 border-white/40 transition-all active:scale-90 shadow-md"
                    style={{ background: drawColor }}
                    title="Colore"
                  />
                  {/* Stroke thickness */}
                  <button
                    onPointerDown={() => { setShowThicknessPanel(v => !v); setShowLineTypePanel(false); setShowColorPanel(false); }}
                    className="text-white/80 transition-all active:scale-90 flex items-center"
                    title="Spessore"
                  >
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
                      <rect x="2" y={12 - drawLineWidth * 0.8} width="20" height={drawLineWidth * 1.6} rx="2" fill="white" opacity="0.85"/>
                    </svg>
                  </button>
                </div>
                <div className="flex items-center gap-5">
                  <button onPointerDown={undo} disabled={history.length === 0} className="text-white/70 disabled:opacity-30 active:scale-90 transition-all" title="Annulla"><Undo2 className="w-6 h-6"/></button>
                  <button onPointerDown={redo} disabled={redoStack.length === 0} className="text-white/70 disabled:opacity-30 active:scale-90 transition-all" title="Ripristina"><Redo2 className="w-6 h-6"/></button>
                </div>

                {/* Line type popup panel */}
                {showLineTypePanel && (
                  <div
                    className="absolute bottom-full left-0 mb-2 z-50 rounded-2xl p-3 shadow-2xl"
                    style={{ background: "rgba(28,28,28,0.97)", backdropFilter: "blur(8px)" }}
                    onPointerDown={e => e.stopPropagation()}
                  >
                    <div className="grid grid-cols-3 gap-1.5">
                      {DRAW_TYPES.map(dt => (
                        <button
                          key={dt.id}
                          onPointerDown={() => { setDrawShape(dt.id); setShowLineTypePanel(false); }}
                          className="w-16 h-11 rounded-xl flex flex-col items-center justify-center transition-all active:scale-95 gap-0.5"
                          style={{ background: drawShape === dt.id ? 'rgba(120,120,120,0.7)' : 'transparent' }}
                          aria-label={dt.id}
                          title={dt.label}
                        >
                          <svg viewBox="0 0 60 44" width="46" height="30">
                            {dt.svg}
                          </svg>
                          <span className="text-[8px] text-white/60 truncate w-full text-center px-0.5">{dt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Color picker popup */}
                {showColorPanel && (
                  <div
                    className="absolute bottom-full left-0 mb-2 z-50 rounded-2xl p-3 shadow-2xl"
                    style={{ background: "rgba(28,28,28,0.97)", backdropFilter: "blur(8px)" }}
                    onPointerDown={e => e.stopPropagation()}
                  >
                    <div className="flex flex-wrap gap-2 max-w-[160px]">
                      {DRAW_COLORS.map(c => (
                        <button
                          key={c.hex}
                          onPointerDown={() => { setDrawColor(c.hex); setShowColorPanel(false); }}
                          className="w-8 h-8 rounded-full transition-all active:scale-90"
                          title={c.name}
                          aria-label={c.name}
                          style={{ background: c.hex, border: drawColor === c.hex ? '3px solid rgba(255,255,255,0.9)' : '2px solid rgba(255,255,255,0.2)' }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Thickness picker popup */}
                {showThicknessPanel && (
                  <div
                    className="absolute bottom-full mb-2 z-50 rounded-2xl p-4 shadow-2xl"
                    style={{ background: "rgba(28,28,28,0.97)", backdropFilter: "blur(8px)", left: "50%" }}
                    onPointerDown={e => e.stopPropagation()}
                  >
                    <p className="text-[10px] text-white/50 uppercase tracking-widest mb-3">Spessore</p>
                    <div className="flex flex-col gap-3 w-40">
                      {([1.5, 2.5, 4, 6] as const).map((lw) => (
                        <button
                          key={lw}
                          onPointerDown={() => { setDrawLineWidth(lw); setShowThicknessPanel(false); }}
                          className="flex items-center gap-3 px-2 py-1.5 rounded-lg transition-all active:scale-95"
                          style={{ background: drawLineWidth === lw ? 'rgba(120,120,120,0.6)' : 'transparent' }}
                        >
                          <svg viewBox="0 0 48 24" width="48" height="24">
                            <line x1="4" y1="12" x2="44" y2="12" stroke="white" strokeWidth={lw} strokeLinecap="round"/>
                          </svg>
                          <span className="text-xs text-white/60">{lw === 1.5 ? "Sottile" : lw === 2.5 ? "Normale" : lw === 4 ? "Spesso" : "Molto spesso"}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* ── Normal toolbar ── */
              <>
                <div className="flex items-center gap-6">
                  {/* Penna */}
                  <button
                    onPointerDown={() => { setTool("draw"); setShowLineTypePanel(false); setShowColorPanel(false); setShowEquipSubbar(false); }}
                    className="text-white/70 transition-all active:scale-90"
                    title="Disegno libero"
                  >
                    <Pencil className="w-6 h-6" />
                  </button>
                  {/* Materiale (Cono) → apre sub-toolbar */}
                  <button
                    onPointerDown={() => { setShowEquipSubbar(true); setShowMobileFormations(false); setShowTeamsSubbar(false); setShowLoad(false); setShowFramePanel(false); setSettingsOpen(false); }}
                    className={`transition-all active:scale-90 ${showEquipSubbar ? "text-orange-400 scale-110" : "text-white/70"}`}
                    title="Materiale"
                  >
                    <Triangle className="w-6 h-6" />
                  </button>
                  {/* Squadre (icona 2 persone) */}
                  <button
                    onPointerDown={() => { setShowTeamsSubbar(v => !v); setShowMobileFormations(false); setShowLoad(false); setShowFramePanel(false); setSettingsOpen(false); setShowEquipSubbar(false); }}
                    className={`transition-all active:scale-90 ${showTeamsSubbar ? "text-blue-400 scale-110" : "text-white/70"}`}
                    title="Squadre"
                  >
                    <Users className="w-6 h-6" />
                  </button>
                  {/* Griglia / formazioni */}
                  <button
                    onPointerDown={() => { setShowMobileFormations(v => !v); setShowLoad(false); setShowFramePanel(false); setShowMobileSettings(false); setShowTeamsSubbar(false); setShowEquipSubbar(false); }}
                    className={`transition-all active:scale-90 ${showMobileFormations ? "text-primary scale-110" : "text-white/70"}`}
                    title="Formazioni"
                  >
                    <LayoutGrid className="w-6 h-6" />
                  </button>
                </div>
                <div className="flex items-center gap-5">
                  <button onPointerDown={undo} disabled={history.length === 0} className="text-white/70 disabled:opacity-30 active:text-white active:scale-90 transition-all" title="Annulla"><Undo2 className="w-6 h-6"/></button>
                  <button onPointerDown={redo} disabled={redoStack.length === 0} className="text-white/70 disabled:opacity-30 active:text-white active:scale-90 transition-all" title="Ripristina"><Redo2 className="w-6 h-6"/></button>
                </div>
              </>
            )}
          </div>

          {openToolGroup && <div className="fixed inset-0 z-40" onPointerDown={() => setOpenToolGroup(null)} />}
        </div>

        {/* ── ELEMENT CONTEXT MENU ── */}
        {elementCtxMenu && (() => {
          const isPlayer = ["player","opponent","goalkeeper"].includes(elementCtxMenu.type);
          const isEquip  = ["ball","cone","goal","goalLarge","disc","cinesino","sagoma","flag","ladder","hurdle","pole","vest"].includes(elementCtxMenu.type);
          const menuEl   = elements.find(e => e.id === elementCtxMenu.id);

          const closeCtx = () => setElementCtxMenu(null);
          const deleteEl = () => { setElements(prev => { pushHistory(prev); return prev.filter(e => e.id !== elementCtxMenu.id); }); closeCtx(); };
          const dupEl    = () => {
            if (!menuEl) return;
            const d: BoardElement = { ...menuEl, id: uid(), x: (menuEl.x ?? 0)+20, y: (menuEl.y ?? 0)+20 };
            setElements(prev => { pushHistory(prev); return [...prev, d]; });
            setSelectedId(d.id); closeCtx();
          };

          const MENU_W = 192;
          const MENU_H = isPlayer ? 180 : 148;
          const mx = Math.min(elementCtxMenu.x + 4, window.innerWidth  - MENU_W - 4);
          const my = Math.min(elementCtxMenu.y + 4, window.innerHeight - MENU_H - 4);

          return (
            <>
              {/* Dismiss backdrop */}
              <div className="fixed inset-0 z-40" onPointerDown={closeCtx} />
              <div
                className="fixed z-50 rounded-2xl shadow-2xl overflow-hidden"
                style={{ left: mx, top: my, width: MENU_W, background: "rgba(24,24,27,0.97)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.1)" }}
                onPointerDown={e => e.stopPropagation()}
              >
                {isPlayer && (
                  <>
                    <button onPointerDown={() => { setPlayerEditId(elementCtxMenu.id); closeCtx(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/10 transition-colors border-b border-white/5">
                      <User className="w-4 h-4 text-white/50" /> Modifica
                    </button>
                    <button onPointerDown={() => {
                      if (!menuEl) return;
                      setElements(prev => prev.map(e => e.id === elementCtxMenu.id ? { ...e, rotation: ((e.rotation ?? 0) + 45) % 360 } : e));
                      closeCtx();
                    }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/10 transition-colors border-b border-white/5">
                      <RotateCcw className="w-4 h-4 text-white/50" /> Ruota
                    </button>
                    <button onPointerDown={dupEl} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/10 transition-colors border-b border-white/5">
                      <Copy className="w-4 h-4 text-white/50" /> Duplica
                    </button>
                    <button onPointerDown={deleteEl} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 className="w-4 h-4" /> Elimina
                    </button>
                  </>
                )}
                {isEquip && (
                  <>
                    {/* Color swatches row */}
                    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/5">
                      {["#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#a855f7","#ffffff","#000000"].map(col => (
                        <button
                          key={col}
                          onPointerDown={() => {
                            setElements(prev => prev.map(e => e.id === elementCtxMenu.id ? { ...e, equipColor: col } : e));
                            closeCtx();
                          }}
                          style={{ background: col, width: 18, height: 18, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.25)", flexShrink: 0 }}
                        />
                      ))}
                    </div>
                    <button onPointerDown={dupEl} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/10 transition-colors border-b border-white/5">
                      <Copy className="w-4 h-4 text-white/50" /> Duplica
                    </button>
                    <button onPointerDown={deleteEl} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 className="w-4 h-4" /> Elimina
                    </button>
                  </>
                )}
                {!isPlayer && !isEquip && (
                  <>
                    <button onPointerDown={dupEl} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/10 transition-colors border-b border-white/5">
                      <Copy className="w-4 h-4 text-white/50" /> Duplica
                    </button>
                    <button onPointerDown={deleteEl} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 className="w-4 h-4" /> Elimina
                    </button>
                  </>
                )}
              </div>
            </>
          );
        })()}

        {/* ── PLAYER EDIT MODAL ── */}
        {playerEditId && (() => {
          const pEl = elements.find(e => e.id === playerEditId);
          if (!pEl) return null;
          const ROLES = ["Portiere","Difensore","Terzino","Centrocampista","Trequartista","Ala","Attaccante","Seconda Punta"];
          return (
            <>
              <div className="absolute inset-0 z-50 bg-black/60" onPointerDown={() => setPlayerEditId(null)} />
              <div
                className="absolute z-50 rounded-2xl shadow-2xl p-5 w-72"
                style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "rgba(18,18,22,0.98)", border: "1px solid rgba(255,255,255,0.12)" }}
                onPointerDown={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="font-bold text-white text-sm uppercase tracking-widest">Modifica Giocatore</p>
                  <button onPointerDown={() => setPlayerEditId(null)} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
                {/* Photo upload */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-14 h-14 rounded-full overflow-hidden border-2 border-white/20 flex items-center justify-center bg-white/5 cursor-pointer"
                    onPointerDown={() => (document.getElementById("player-photo-input") as HTMLInputElement)?.click()}
                  >
                    {pEl.playerPhoto
                      ? <img src={pEl.playerPhoto} alt="foto" className="w-full h-full object-cover" />
                      : <User className="w-7 h-7 text-white/30" />
                    }
                  </div>
                  <input id="player-photo-input" type="file" accept="image/*" className="hidden" onChange={ev => {
                    const file = ev.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = e2 => {
                      setElements(prev => prev.map(el => el.id === playerEditId ? { ...el, playerPhoto: e2.target?.result as string } : el));
                    };
                    reader.readAsDataURL(file);
                  }} />
                  <div>
                    <p className="text-xs text-white/50 mb-1">Foto</p>
                    <button onPointerDown={() => (document.getElementById("player-photo-input") as HTMLInputElement)?.click()} className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors">
                      Cambia
                    </button>
                  </div>
                </div>
                {/* Numero */}
                <div className="mb-3">
                  <label className="text-xs text-white/50 mb-1 block">Numero</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range" min="1" max="99"
                      value={pEl.playerNumber ?? 1}
                      onChange={ev => setElements(prev => prev.map(el => el.id === playerEditId ? { ...el, playerNumber: Number(ev.target.value), label: ev.target.value } : el))}
                      className="flex-1 accent-blue-500"
                    />
                    <span className="text-white font-bold text-lg w-8 text-center">{pEl.playerNumber ?? pEl.label ?? "1"}</span>
                  </div>
                </div>
                {/* Nome */}
                <div className="mb-3">
                  <label className="text-xs text-white/50 mb-1 block">Nome</label>
                  <input
                    value={pEl.playerName ?? ""}
                    onChange={ev => setElements(prev => prev.map(el => el.id === playerEditId ? { ...el, playerName: ev.target.value } : el))}
                    placeholder="Nome giocatore"
                    className="w-full h-9 rounded-lg bg-white/10 border border-white/10 text-white text-sm px-3 placeholder-white/30 focus:outline-none focus:border-blue-500"
                  />
                </div>
                {/* Ruolo */}
                <div className="mb-4">
                  <label className="text-xs text-white/50 mb-1 block">Ruolo</label>
                  <div className="flex flex-wrap gap-1.5">
                    {ROLES.map(role => (
                      <button
                        key={role}
                        onPointerDown={() => setElements(prev => prev.map(el => el.id === playerEditId ? { ...el, playerRole: role } : el))}
                        className="px-2 py-1 rounded-lg text-xs font-medium transition-colors"
                        style={{ background: pEl.playerRole === role ? "#2563eb" : "rgba(255,255,255,0.08)", color: pEl.playerRole === role ? "white" : "rgba(255,255,255,0.6)" }}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
                <button onPointerDown={() => setPlayerEditId(null)} className="w-full h-9 rounded-lg bg-blue-600 text-white text-sm font-semibold">
                  Chiudi
                </button>
              </div>
            </>
          );
        })()}

        {/* ── RIGHT PANEL (overlay, does not shrink canvas) ── */}
        {showRightPanel && (
          <div className="absolute right-0 top-0 bottom-0 w-72 z-30 border-l bg-background flex flex-col overflow-y-auto shadow-2xl">

            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <p className="font-semibold text-sm">Dettagli & Strumenti</p>
              <button onClick={() => setShowRightPanel(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors" title="Chiudi pannello">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Nome tattica */}
            <div className="px-4 py-3 border-b space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Nome tattica</p>
              <Input placeholder="Nome tattica..." value={tacticName} onChange={e => setTacticName(e.target.value)} onKeyDown={e => e.key === "Enter" && saveTactic()} className="h-8 text-sm" />
            </div>

            {/* Formazioni */}
            <div className="px-4 py-3 border-b">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">{t.presets}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.keys(FORMATIONS).map(name => (
                  <button key={name} onClick={() => applyFormation(name)} className="flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-xs font-bold bg-primary/10 hover:bg-primary/20 text-primary transition-all border border-primary/20">
                    <span className="text-primary/60 text-[10px]">▶</span> {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Libreria */}
            <div className="px-4 py-3 border-b space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Libreria</p>

              {/* Carica tattica */}
              <div className="relative">
                <button onClick={() => { setShowLoad(v => !v); setShowExercises(false); setShowDrafts(false); }} className="flex items-center gap-1.5 w-full px-3 py-2 rounded-lg text-sm font-medium bg-secondary hover:bg-secondary/80 text-foreground shadow-sm transition-all">
                  <FolderOpen className="w-3.5 h-3.5" /> {t.load}
                  <span className="ml-auto">{showLoad ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</span>
                </button>
                {showLoad && (
                  <div className="mt-1 rounded-xl border border-border bg-card shadow-sm p-1 max-h-40 overflow-y-auto">
                    {savedTactics.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">{t.noTacticsSaved}</p>
                    ) : savedTactics.map(s => (
                      <div key={s.name} className="flex items-center gap-1">
                        <button onClick={() => { loadTactic(s); setShowLoad(false); }} className="flex-1 text-left px-3 py-2 rounded text-xs font-medium hover:bg-primary/10 hover:text-primary transition-colors truncate">{s.name}</button>
                        <button onClick={() => deleteTactic(s.name)} className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Disegni esercizi */}
              <div className="relative">
                <button onClick={() => { setShowExercises(v => !v); setShowDrafts(false); setShowLoad(false); }} className="flex items-center gap-1.5 w-full px-3 py-2 rounded-lg text-sm font-medium bg-secondary hover:bg-secondary/80 text-foreground shadow-sm transition-all">
                  <PenLine className="w-3.5 h-3.5" /> Disegni
                  <span className="ml-auto">{showExercises ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</span>
                </button>
                {showExercises && (
                  <div className="mt-1 rounded-xl border border-border bg-card shadow-sm p-1 max-h-52 overflow-y-auto">
                    {exercises.filter(ex => ex.drawingData && !ex.isDraft).length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">Nessun esercizio con disegno</p>
                    ) : exercises.filter(ex => ex.drawingData && !ex.isDraft).map(ex => (
                      <button key={ex.id} onClick={() => { loadExerciseDrawing(ex); setShowExercises(false); }} className="w-full flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors text-left">
                        <img src={ex.drawingData!} alt="" className="w-10 h-7 object-cover rounded border shrink-0 opacity-80" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{ex.title}</p>
                          {ex.trainingPhase && <span className="text-[9px] px-1 py-0.5 bg-blue-100 text-blue-700 rounded-full font-semibold capitalize">{ex.trainingPhase}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Bozze */}
              <div className="relative">
                <button onClick={() => { setShowDrafts(v => !v); setShowExercises(false); setShowLoad(false); }} className="flex items-center gap-1.5 w-full px-3 py-2 rounded-lg text-sm font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/20 shadow-sm transition-all">
                  <FileEdit className="w-3.5 h-3.5" /> Bozze
                  <span className="ml-auto">{showDrafts ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</span>
                </button>
                {showDrafts && (() => {
                  const drafts = exercises.filter(ex => ex.isDraft);
                  return (
                    <div className="mt-1 rounded-xl border border-border bg-card shadow-sm p-1 max-h-52 overflow-y-auto">
                      {drafts.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-3">Nessuna bozza</p>
                      ) : drafts.map(ex => (
                        <button key={ex.id} onClick={() => { openDraft(ex); setShowDrafts(false); }} className="w-full flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-400 transition-colors text-left">
                          {ex.drawingData ? (
                            <img src={ex.drawingData} alt="" className="w-10 h-7 object-cover rounded border border-amber-500/30 shrink-0 opacity-80" />
                          ) : (
                            <div className="w-10 h-7 rounded border border-amber-500/30 shrink-0 bg-amber-500/5 flex items-center justify-center"><FileEdit className="w-3 h-3 text-amber-500/50" /></div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{ex.title}</p>
                            <span className="text-[9px] px-1 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full font-semibold">Bozza</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Azioni in movimento */}
            <div className="border-t border-violet-500/30">
              <button type="button" onClick={() => setShowFramePanel(v => !v)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-violet-500/5 transition-colors text-left">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400 shrink-0"><Clapperboard className="w-3.5 h-3.5" /></div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-violet-800 dark:text-violet-300">Azioni in Movimento</p>
                  {frames.length > 0 && <span className="text-xs px-1.5 py-0.5 bg-violet-500/20 text-violet-700 dark:text-violet-400 rounded-full font-bold">{frames.length} fotogrammi</span>}
                </div>
                <ChevronRight className={`w-4 h-4 text-violet-400 transition-transform duration-200 ${showFramePanel ? "rotate-90" : ""}`} />
              </button>
              {showFramePanel && (
                <div className="border-t border-violet-500/20 px-4 pb-4 pt-3 space-y-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">Disponi i giocatori, premi <strong>Aggiungi fotogramma</strong>, sposta e aggiungi un altro. Poi premi <strong>Riproduci</strong>.</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={addFrame} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white shadow-sm transition-all">
                      <Camera className="w-3 h-3" /> Aggiungi fotogramma
                    </button>
                    {frames.length >= 2 && !isPlaying && (
                      <button onClick={playAnimation} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all">
                        <Play className="w-3 h-3" /> Riproduci ({frames.length})
                      </button>
                    )}
                    {isPlaying && (
                      <button onClick={stopAnimation} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-700 text-white shadow-sm transition-all animate-pulse">
                        <Square className="w-3 h-3" /> Ferma
                      </button>
                    )}
                    {frames.length > 0 && !isPlaying && (
                      <button onClick={clearFrames} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-card border border-border/60 hover:bg-destructive/10 hover:text-destructive shadow-sm transition-all">
                        <Trash2 className="w-3 h-3" /> Elimina
                      </button>
                    )}
                  </div>
                  {frames.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {frames.map((_, idx) => (
                        <div key={idx} onClick={() => jumpToFrame(idx)} title={`Fotogramma ${idx + 1}`} className={`relative shrink-0 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${currentFrame === idx ? "border-violet-500 ring-2 ring-violet-500/30 scale-105" : "border-border/40 hover:border-violet-400"}`}>
                          <div className="w-14 h-10 bg-[#2d6a4f] flex items-center justify-center">
                            <span className="text-white/80 font-bold">{idx + 1}</span>
                          </div>
                          {!isPlaying && (
                            <button onClick={e => { e.stopPropagation(); removeFrame(idx); }} className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-red-600 transition-colors">
                              <X className="w-2.5 h-2.5" />
                            </button>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/50 text-[8px] text-white text-center font-bold">
                            {currentFrame === idx ? "▶" : `F${idx + 1}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Draft panel (when active) */}
            {activeDraft && (
              <div className="border-t border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/10">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-500/20 bg-amber-500/5">
                  <FileEdit className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 truncate">{activeDraft.title}</p>
                    <p className="text-xs text-amber-600/70">Modifica bozza</p>
                  </div>
                  <button onClick={() => setActiveDraft(null)} className="p-1 rounded hover:bg-amber-200/40"><X className="w-4 h-4 text-amber-500" /></button>
                </div>
                <div className="px-4 py-3 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Titolo *</Label>
                    <Input value={draftForm.title} onChange={e => setDraftForm(f => ({ ...f, title: e.target.value }))} className="h-8 text-sm" placeholder="Nome esercizio" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Durata</Label>
                      <Input type="number" min={0} value={draftForm.durationMinutes} onChange={e => setDraftForm(f => ({ ...f, durationMinutes: e.target.value }))} className="h-8 text-sm" placeholder="min" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1"><UserCheck className="w-3 h-3" /> Gioc.</Label>
                      <Input type="number" min={0} value={draftForm.playersRequired} onChange={e => setDraftForm(f => ({ ...f, playersRequired: e.target.value }))} className="h-8 text-sm" placeholder="n." />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Descrizione</Label>
                    <Textarea value={draftForm.description} onChange={e => setDraftForm(f => ({ ...f, description: e.target.value }))} rows={2} className="resize-none text-sm" placeholder="Note tattiche..." />
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <Switch checked={draftForm.isDraft} onCheckedChange={v => setDraftForm(f => ({ ...f, isDraft: v }))} id="draft-toggle-panel" />
                      <Label htmlFor="draft-toggle-panel" className="text-xs cursor-pointer">{draftForm.isDraft ? "Bozza" : "Finalizzato"}</Label>
                    </div>
                    <Button size="sm" onClick={saveDraft} disabled={isSaving || !draftForm.title.trim()} className={draftForm.isDraft ? "bg-amber-600 hover:bg-amber-700 text-white text-xs" : "bg-emerald-600 hover:bg-emerald-700 text-white text-xs"}>
                      {isSaving ? "..." : draftForm.isDraft ? <><FileEdit className="w-3 h-3 mr-1" />Salva</> : <><CheckCheck className="w-3 h-3 mr-1" />Finalizza</>}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Nuova Esercitazione */}
            <div className="border-t">
              <button type="button" onClick={() => setShowNewExForm(v => !v)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary shrink-0"><Plus className="w-3.5 h-3.5" /></div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Nuova Esercitazione</p>
                  <p className="text-xs text-muted-foreground">{elements.length > 0 ? `${elements.length} elementi sulla lavagna` : "Crea da zero"}</p>
                </div>
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${showNewExForm ? "rotate-90" : ""}`} />
              </button>
              {showNewExForm && (
                <form onSubmit={createNewExercise} className="px-4 pb-4 pt-1 space-y-3 border-t border-border/50">
                  {elements.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary">
                      <PenLine className="w-3 h-3 shrink-0" /> {elements.length} elementi allegati
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Titolo *</Label>
                    <Input value={newExForm.title} onChange={e => setNewExForm(f => ({ ...f, title: e.target.value }))} placeholder="Nome esercizio" required className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Categoria</Label>
                    <select value={newExForm.category} onChange={e => setNewExForm(f => ({ ...f, category: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="">Nessuna</option>
                      {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="w-3 h-3" />Squadra</Label>
                      <select value={newExForm.teamId} onChange={e => setNewExForm(f => ({ ...f, teamId: e.target.value }))} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none">
                        <option value="">Nessuna</option>
                        {myTeams.map(tm => <option key={tm.id} value={String(tm.id)}>{tm.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1"><Dumbbell className="w-3 h-3" />Principio</Label>
                      <select value={newExForm.principio} onChange={e => setNewExForm(f => ({ ...f, principio: e.target.value }))} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none">
                        <option value="">Nessuno</option>
                        {PRINCIPI.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />Durata</Label>
                      <Input type="number" min={0} value={newExForm.durationMinutes} onChange={e => setNewExForm(f => ({ ...f, durationMinutes: e.target.value }))} className="h-8 text-sm" placeholder="min" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1"><UserCheck className="w-3 h-3" />Gioc.</Label>
                      <Input type="number" min={0} value={newExForm.playersRequired} onChange={e => setNewExForm(f => ({ ...f, playersRequired: e.target.value }))} className="h-8 text-sm" placeholder="n." />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="w-3 h-3" />Giorno</Label>
                      <Input type="date" value={newExForm.trainingDay} onChange={e => setNewExForm(f => ({ ...f, trainingDay: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1"><Layers className="w-3 h-3" />Fase</Label>
                      <select value={newExForm.trainingPhase} onChange={e => setNewExForm(f => ({ ...f, trainingPhase: e.target.value }))} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none">
                        <option value="">Nessuna</option>
                        {PHASES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Materiale</Label>
                    <Input value={newExForm.equipment} onChange={e => setNewExForm(f => ({ ...f, equipment: e.target.value }))} placeholder="Es: coni, paletti..." className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Descrizione</Label>
                    <Textarea value={newExForm.description} onChange={e => setNewExForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Note tattiche..." className="resize-none text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Mic className="w-3 h-3" />Nota Vocale</Label>
                    <ExerciseVoiceRecorder value={newExForm.voiceNoteData} onChange={data => setNewExForm(f => ({ ...f, voiceNoteData: data }))} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={newExForm.isDraft} onCheckedChange={v => setNewExForm(f => ({ ...f, isDraft: v }))} id="newex-draft-panel" />
                    <Label htmlFor="newex-draft-panel" className="text-xs cursor-pointer">{newExForm.isDraft ? "Salva come bozza" : "Pubblica subito"}</Label>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button type="submit" disabled={isCreating || !newExForm.title.trim()} size="sm" className={newExForm.isDraft ? "bg-amber-600 hover:bg-amber-700 text-white flex-1" : "bg-primary hover:bg-primary/90 flex-1"}>
                      {isCreating ? "..." : newExForm.isDraft ? <><FileEdit className="w-3 h-3 mr-1" />Bozza</> : <><CheckCheck className="w-3 h-3 mr-1" />Pubblica</>}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setShowNewExForm(false); setNewExForm(emptyNewExForm()); }}>Annulla</Button>
                  </div>
                </form>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
