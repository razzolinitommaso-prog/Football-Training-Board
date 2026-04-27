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
import TacticalBoardLayoutV2 from "./layout-v2";
import {
  renderFootballField,
  type FieldFormat,
  type FieldOrientation,
  type FieldRenderMode,
  type FieldView,
} from "./field-renderer";
import {
  deserializeExerciseElements,
  loadSavedTacticsFromStorage,
  persistSavedTacticsToStorage,
  serializeElementsForExercise,
} from "./board-serialization";
import { LEGACY_FORMATIONS } from "./formations";
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

import { drawElements } from "./canvas-renderer";
import type { BoardElement, BoardPoint as Point, SavedTactic } from "./board-types";

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

type DevicePreviewMode = "desktop" | "mobile";

interface DragHandle { elId: string; idx: number; kind: 'point' | 'move' }

// â”€â”€ Freehand path simplification (Douglas-Peucker) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  // 3. Catmull-Rom â†’ Bezier control points
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

function drawFieldOnCanvas(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const r = (v: number) => Math.round(v);

  const background = ctx.createLinearGradient(0, 0, 0, H);
  background.addColorStop(0, "#163228");
  background.addColorStop(1, "#0d2018");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, W, H);

  const pad = Math.max(20, Math.round(Math.min(W, H) * 0.045));
  const fw = r(W - pad * 2);
  const fh = r(H - pad * 2);
  const fx = r((W - fw) / 2);
  const fy = r((H - fh) / 2);

  const grass = ctx.createLinearGradient(fx, fy, fx + fw, fy + fh);
  grass.addColorStop(0, "#24553f");
  grass.addColorStop(0.5, "#2f7554");
  grass.addColorStop(1, "#214f3c");
  ctx.fillStyle = grass;
  ctx.fillRect(fx, fy, fw, fh);

  const stripes = 10;
  const stripeW = fw / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.045)";
    ctx.fillRect(r(fx + i * stripeW), fy, Math.ceil(stripeW), fh);
  }

  const vignette = ctx.createLinearGradient(fx, fy, fx, fy + fh);
  vignette.addColorStop(0, "rgba(255,255,255,0.05)");
  vignette.addColorStop(0.45, "rgba(255,255,255,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = vignette;
  ctx.fillRect(fx, fy, fw, fh);

  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = Math.max(1.8, Math.min(2.6, fh * 0.0042));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeRect(fx, fy, fw, fh);

  const centerX = r(fx + fw / 2);
  const centerY = r(fy + fh / 2);
  const centerRadius = r(fh * 0.135);

  ctx.beginPath();
  ctx.moveTo(centerX, fy);
  ctx.lineTo(centerX, fy + fh);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(centerX, centerY, centerRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
  ctx.fill();

  const penaltyDepth = r(fw * 0.157);
  const penaltyHeight = r(fh * 0.593);
  const penaltyY = r(fy + (fh - penaltyHeight) / 2);
  const goalAreaDepth = r(fw * 0.052);
  const goalAreaHeight = r(fh * 0.269);
  const goalAreaY = r(fy + (fh - goalAreaHeight) / 2);
  const penaltySpotOffset = r(fw * 0.105);
  const goalHeight = r(fh * 0.108);
  const goalDepth = Math.max(8, Math.round(fw * 0.016));
  const goalY = r(fy + (fh - goalHeight) / 2);
  const cornerRadius = Math.max(8, Math.round(Math.min(fw, fh) * 0.015));

  ctx.strokeRect(fx, penaltyY, penaltyDepth, penaltyHeight);
  ctx.strokeRect(fx + fw - penaltyDepth, penaltyY, penaltyDepth, penaltyHeight);
  ctx.strokeRect(fx, goalAreaY, goalAreaDepth, goalAreaHeight);
  ctx.strokeRect(fx + fw - goalAreaDepth, goalAreaY, goalAreaDepth, goalAreaHeight);

  ctx.beginPath();
  ctx.arc(fx + penaltySpotOffset, centerY, 3, 0, Math.PI * 2);
  ctx.arc(fx + fw - penaltySpotOffset, centerY, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(fx + penaltySpotOffset, centerY, centerRadius, -Math.PI * 0.37, Math.PI * 0.37);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(fx + fw - penaltySpotOffset, centerY, centerRadius, Math.PI * 0.63, Math.PI * 1.37);
  ctx.stroke();

  ctx.strokeRect(fx - goalDepth, goalY, goalDepth, goalHeight);
  ctx.strokeRect(fx + fw, goalY, goalDepth, goalHeight);

  [
    [fx, fy, 0, Math.PI / 2],
    [fx + fw, fy, Math.PI / 2, Math.PI],
    [fx + fw, fy + fh, Math.PI, Math.PI * 1.5],
    [fx, fy + fh, Math.PI * 1.5, Math.PI * 2],
  ].forEach(([cx, cy, start, end]) => {
    ctx.beginPath();
    ctx.arc(cx as number, cy as number, cornerRadius, start as number, end as number);
    ctx.stroke();
  });
}

// Formation presets â€“ landscape pitch (players go left half = our team)
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
      // lateral spread â†’ x axis, depth â†’ y axis (inverted so GK at bottom)
      x = fx + py * fw;
      y = fy + (1 - px) * fh;   // GK pxâ‰ˆ0.06 â†’ y near bottom; FWD pxâ‰ˆ0.47 â†’ y near center
    } else {
      // Landscape: our team on left half
      x = fx + px * fw;
      y = fy + py * fh;
    }
    return { id: uid(), type: "player" as const, x, y, label: String(i + 1) };
  });
}

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
  const [savedTactics, setSavedTactics] = useState<SavedTactic[]>(() => loadSavedTacticsFromStorage());
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
    { id: 'bezier-dashed', label: 'Curva â€”', svg: <path d="M 5,25 C 15,5 25,40 35,20 C 45,5 55,25 55,25" fill="none" stroke="white" strokeWidth="2.5" strokeDasharray="5 3" strokeLinecap="round"/> },
    { id: 'straight-solid', label: 'Retta', svg: <line x1="5" y1="32" x2="55" y2="12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/> },
    { id: 'straight-dashed', label: 'Retta â€”', svg: <line x1="5" y1="32" x2="55" y2="12" stroke="white" strokeWidth="2.5" strokeDasharray="5 3" strokeLinecap="round"/> },
    { id: 'arc-wavy', label: 'Onda', svg: <path d="M 5,22 C 15,5 20,38 30,22 C 40,5 45,38 55,22" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"/> },
    { id: 'arc-wavy-dashed', label: 'Onda â€”', svg: <path d="M 5,22 C 15,5 20,38 30,22 C 40,5 45,38 55,22" fill="none" stroke="white" strokeWidth="2.5" strokeDasharray="5 3" strokeLinecap="round"/> },
    { id: 'rect-outline', label: 'Rettangolo', svg: <rect x="8" y="10" width="44" height="24" fill="none" stroke="white" strokeWidth="2.5" rx="1"/> },
    { id: 'rect-dashed', label: 'Rett. â€”', svg: <rect x="8" y="10" width="44" height="24" fill="none" stroke="white" strokeWidth="2.5" strokeDasharray="5 3" rx="1"/> },
    { id: 'rect-filled', label: 'Rett. pieno', svg: <rect x="8" y="10" width="44" height="24" fill="white" rx="1"/> },
    { id: 'circle-outline', label: 'Cerchio', svg: <circle cx="30" cy="22" r="14" fill="none" stroke="white" strokeWidth="2.5"/> },
    { id: 'circle-dashed', label: 'Cerchio â€”', svg: <circle cx="30" cy="22" r="14" fill="none" stroke="white" strokeWidth="2.5" strokeDasharray="5 3"/> },
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

  // Mobile touch drag from palette â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // { tool, touchId, startMoved } â€“ stored in a ref to avoid stale closures in listeners
  const touchPaletteDragRef = useRef<{ tool: ToolType; touchId: number; startMoved: boolean } | null>(null);
  const [touchGhostTool, setTouchGhostTool] = useState<{ tool: ToolType; x: number; y: number } | null>(null);
  // Tracks a pending "tap-to-place" for placement tools (doesn't block scroll until finger lifts)
  const touchPlacePendingRef = useRef<{ canvasPos: { x: number; y: number }; screenX: number; screenY: number; cancelled: boolean } | null>(null);
  // Refs that stay current inside the global touch listener (no stale closure)
  const playerCounterRef = useRef(playerCounter);
  useEffect(() => { playerCounterRef.current = playerCounter; }, [playerCounter]);
  const opponentCounterRef = useRef(opponentCounter);
  useEffect(() => { opponentCounterRef.current = opponentCounter; }, [opponentCounter]);

  // Canvas touch â€” non-passive native listeners (React synthetic events are passive for touchmove)
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

  // T002 â€“ Panel overlay / delete confirm
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // T003 â€“ Folder / save menus
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [showSaveMenu, setShowSaveMenu] = useState(false);

  // T004 â€“ Draw thickness
  const [drawLineWidth, setDrawLineWidth] = useState(2.5);
  const drawLineWidthRef = useRef(2.5);
  useEffect(() => { drawLineWidthRef.current = drawLineWidth; }, [drawLineWidth]);
  const [showThicknessPanel, setShowThicknessPanel] = useState(false);

  // T005 â€“ Settings panel
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Settings sub-states
  const [settingsTab, setSettingsTab] = useState<'campo'|'giocatori'|'squadre'>('campo');
  const [settingsTema, setSettingsTema] = useState<'auto'|'light'|'dark'>('auto');
  const [settingsOrientation, setSettingsOrientation] = useState<FieldOrientation>('auto');
  const [fieldBgColor, setFieldBgColor] = useState("#2d6a4f");
  const [fieldType, setFieldType] = useState<FieldView>('full');
  const [fieldFormat, setFieldFormat] = useState<FieldFormat>('11v11');
  const [fieldRenderMode, setFieldRenderMode] = useState<FieldRenderMode>('standard');
  const [devicePreview, setDevicePreview] = useState<DevicePreviewMode>('desktop');
  const [showPlayerName, setShowPlayerName] = useState(false);
  const [showPlayerRole, setShowPlayerRole] = useState(false);
  const [showPlayerDirection, setShowPlayerDirection] = useState(false);
  const [playerElementSize, setPlayerElementSize] = useState(14); // radius in px

  // T006/T007 â€“ Element context menu + player edit modal + confirm delete
  const [elementCtxMenu, setElementCtxMenu] = useState<{ id: string; x: number; y: number; type: string } | null>(null);
  const [playerEditId, setPlayerEditId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmDeleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctxDismissRef = useRef(false);

  // T008 â€“ Teams sub-toolbar
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
  const settingsOrientationRef = useRef<FieldOrientation>('auto');
  const fieldBgColorRef = useRef("#2d6a4f");
  const fieldTypeRef = useRef<FieldView>('full');
  const fieldFormatRef = useRef<FieldFormat>('11v11');
  const fieldRenderModeRef = useRef<FieldRenderMode>('standard');
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
        const marginH = 0;
        const marginW = 0;
        const w = Math.max(300, rect.width - marginW);
        const h = Math.max(300, rect.height - marginH);
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
  useEffect(() => { settingsOrientationRef.current = settingsOrientation; }, [settingsOrientation]);
  useEffect(() => { fieldBgColorRef.current = fieldBgColor; }, [fieldBgColor]);
  useEffect(() => { fieldTypeRef.current = fieldType; }, [fieldType]);
  useEffect(() => { fieldFormatRef.current = fieldFormat; }, [fieldFormat]);
  useEffect(() => { fieldRenderModeRef.current = fieldRenderMode; }, [fieldRenderMode]);
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

    renderFootballField(ctx, {
      width: W,
      height: H,
      baseColor: fieldBgColorRef.current,
      orientation: devicePreview === "mobile" ? "portrait" : settingsOrientationRef.current === "portrait" ? "portrait" : "landscape",
      view: fieldTypeRef.current,
      format: fieldFormatRef.current,
      mode: fieldRenderModeRef.current,
    });

    // Draw quick-board background if loaded (use logical W/H, not DPR-scaled canvas.width)
    if (bgImgRef.current) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(bgImgRef.current, 0, 0, W, H);
      ctx.globalAlpha = 1.0;
    }

    drawElements(ctx, elems, playerElementSizeRef.current);

    // â”€â”€ Player name / role / direction overlay (uses refs so always fresh) â”€â”€
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

    // â”€â”€ Equipment selection ring + resize handles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          // Resize handles: right-center (â†’ width), bottom-center (â†“ height), bottom-right (corner â†— uniform)
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
          drawElements(ctx, [
            {
              ...el,
              color: "#3b82f6",
              lineWidth: 6,
              arrowEnd: "none",
            },
          ]);
          ctx.globalAlpha = 1;
          drawHandleDot({ x: cx, y: cy }, '#3b82f6', 8);
        }
      }
    }

    if (livePoints && livePoints.length > 1) {
      if (liveTool === "draw") {
        drawElements(ctx, [
          {
            id: "live-draw-preview",
            type: "draw",
            points: livePoints,
            shape: drawShapeRef.current,
            color: drawColorRef.current,
            lineWidth: 2.5,
            arrowEnd: drawArrowEndRef.current,
          },
        ]);
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

  // â”€â”€ Global touch listener for palette-drag-to-canvas placement â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    function handleGlobalTouchMove(ev: TouchEvent) {
      const drag = touchPaletteDragRef.current;
      if (!drag) return;
      const touch = Array.from(ev.changedTouches).find(t => t.identifier === drag.touchId)
        ?? Array.from(ev.touches).find(t => t.identifier === drag.touchId);
      if (!touch) return;
      drag.startMoved = true;
      // Update ghost position (direct DOM mutation â€” no re-render per frame)
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

  // â”€â”€ Canvas native touch handlers (non-passive so preventDefault works) â”€â”€â”€
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

      // 1. Check hit on existing element â†’ drag to reposition (any tool or no tool)
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

      // 2. Drawing tool active â†’ start drawing (captures immediately)
      if (tool === "draw" || tool === "line" || tool === "arrow" || tool === "curve" || tool === "curveArrow") {
        ev.preventDefault();
        canvasTouchActiveRef.current = true;
        setIsDrawing(true);
        setCurrentPath([pos]);
        return;
      }

      // 3. Eraser â†’ erase on tap (captures immediately)
      if (tool === "eraser") {
        ev.preventDefault();
        canvasTouchActiveRef.current = true;
        const id = findElementAt(pos.x, pos.y);
        if (id) setElements(prev => { pushHistory(prev); return prev.filter(el => el.id !== id); });
        return;
      }

      // 4. Placement tools â†’ record pending tap WITHOUT preventing scroll.
      //    If the finger moves >15px it's a scroll, otherwise onEnd will place the element.
      const PLACE_TOOLS = ["player","opponent","ball","cone","goalkeeper","goal","goalLarge","text",
        "disc","cinesino","sagoma","flag","ladder","hurdle","pole","vest"];
        if (tool && PLACE_TOOLS.includes(tool)) {
        touchPlacePendingRef.current = { canvasPos: pos, screenX: touch.clientX, screenY: touch.clientY, cancelled: false };
        // Do NOT ev.preventDefault() here â€” let the browser decide scroll vs tap
        canvasTouchActiveRef.current = false;
        return;
      }

      // Otherwise â†’ don't capture, let page scroll
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

    // â”€â”€ Equip resize handle check (takes priority) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Drag existing point element (player/ball/cone) to move it â”€â”€â”€â”€â”€
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

    // â”€â”€ Handle bezier drag handles first â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        // Click on bezier body â†’ move the whole curve
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
      // Clicked away from selected element â†’ deselect
      setSelectedId(null);
    }

    // â”€â”€ Bezier tools: click on existing bezier to select â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Drawing tools â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (tool === "draw") {
      // In draw mode: first try to select an existing drawn element
      const hitId = findDrawPathAt(pos.x, pos.y);
      if (hitId) {
        setSelectedId(hitId);
        return;
      }
      // Nothing hit â†’ start drawing a new shape
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

    // â”€â”€ Equipment resize drag â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Drag existing element on canvas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // Pure tap: use REFS only (not dragElement state â€” which may be stale for quick touch taps)
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
    // Tapped on empty canvas â†’ deselect equipment
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
            // Create a bezier element with auto control points â€” user can drag handles to reshape
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

  // â”€â”€ Drag from palette onto canvas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Azioni in movimento â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    const positions = LEGACY_FORMATIONS[name];
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
      // If existing roster is larger than formation â†’ drop extras (user can always undo)
      return [...nonPlayers, ...merged];
    });
    setPlayerCounter(newPositions.length + 1);
  }

  function clearBoard() {
    if (!confirmClear) {
      setConfirmClear(true);
      toast({ title: "Cancella lavagna?", description: "Premi di nuovo il tasto ðŸ—‘ per confermare." });
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
    persistSavedTacticsToStorage(updated);
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
    persistSavedTacticsToStorage(updated);
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
        const converted = deserializeExerciseElements(
          ex.drawingElementsJson,
          canvasSize,
          uid,
        );

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
      toast({ title: `Bozza aperta: ${ex.title}`, description: "Nessun disegno â€” puoi compilare i dettagli qui sotto." });
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
      toast({ title: draftForm.isDraft ? "Bozza salvata" : "Esercizio finalizzato!", description: draftForm.isDraft ? "Le modifiche sono state salvate." : "L'esercizio Ã¨ ora in libreria come definitivo." });
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
      drawingElementsJson = serializeElementsForExercise(elements, canvasSize);
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

  const touchGhostToolData = toolButtons.find(
    (btn) => btn.key === touchGhostTool?.tool
  );
  
  const touchGhostPreview = touchGhostTool && touchGhostToolData ? (
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{ left: touchGhostTool.x - 28, top: touchGhostTool.y - 28 }}
    >
      <div className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center shadow-2xl opacity-80 border-2">
        <span className="w-6 h-6 flex items-center justify-center text-white">
          {touchGhostToolData.icon}
        </span>
        <span className="text-[8px] font-bold text-white mt-0.5 truncate px-1">
          {touchGhostToolData.label}
        </span>
      </div>
    </div>
  ) : null;

  const selectedElement = selectedId ? elements.find((element) => element.id === selectedId) ?? null : null;
  const selectedElementDetails = selectedElement
    ? [
        `Tipo: ${selectedElement.type}`,
        selectedElement.label ? `Etichetta: ${selectedElement.label}` : null,
        selectedElement.playerNumber ? `Numero: ${selectedElement.playerNumber}` : null,
        selectedElement.playerName ? `Nome: ${selectedElement.playerName}` : null,
        selectedElement.playerRole ? `Ruolo: ${selectedElement.playerRole}` : null,
        selectedElement.rotation != null ? `Rotazione: ${selectedElement.rotation}Â°` : null,
      ].filter(Boolean) as string[]
    : [];

  const activeToolV2 =
    tool === "eraser"
      ? "erase"
      : tool === "curve" || tool === "curveArrow"
        ? "bezier"
        : tool ?? "select";

  const libraryItems = [
    `Tattiche salvate: ${savedTactics.length}`,
    `Esercitazioni disponibili: ${exercises.length}`,
    `Squadre disponibili: ${myTeams.length}`,
    `Formazioni rapide: ${Object.keys(LEGACY_FORMATIONS).length}`,
  ];

  const sessionItems = [
    `Elementi in lavagna: ${elements.length}`,
    `Undo disponibili: ${history.length}`,
    `Redo disponibili: ${redoStack.length}`,
    `Canvas: ${canvasSize.w} x ${canvasSize.h}`,
  ];

  const handleLayoutToolChange = (toolId: "select" | "move" | "erase" | "draw" | "line" | "arrow" | "bezier" | "player" | "opponent" | "goalkeeper" | "ball" | "cone" | "goal" | "goalLarge" | "disc" | "cinesino" | "sagoma" | "flag" | "ladder" | "hurdle" | "pole" | "vest" | "text") => {
    if (toolId === "select" || toolId === "move") {
      setTool(null);
      return;
    }
    if (toolId === "erase") {
      setTool("eraser");
      return;
    }
    if (toolId === "bezier") {
      setTool("curve");
      return;
    }
    setTool(toolId);
  };


  const mapLayoutToolToBoardTool = (toolId: "select" | "move" | "erase" | "draw" | "line" | "arrow" | "bezier" | "player" | "opponent" | "goalkeeper" | "ball" | "cone" | "goal" | "goalLarge" | "disc" | "cinesino" | "sagoma" | "flag" | "ladder" | "hurdle" | "pole" | "vest" | "text") => {
    if (toolId === "select" || toolId === "move") return null;
    if (toolId === "erase") return "eraser" as const;
    if (toolId === "bezier") return "curve" as const;
    return toolId;
  };

  const handleLayoutToolDragStart = (
    toolId: "select" | "move" | "erase" | "draw" | "line" | "arrow" | "bezier" | "player" | "opponent" | "goalkeeper" | "ball" | "cone" | "goal" | "goalLarge" | "disc" | "cinesino" | "sagoma" | "flag" | "ladder" | "hurdle" | "pole" | "vest" | "text",
    event: React.DragEvent<HTMLElement>,
  ) => {
    const mappedTool = mapLayoutToolToBoardTool(toolId);
    if (!mappedTool) return;
    draggedToolRef.current = mappedTool;
    event.dataTransfer.effectAllowed = "copy";
    try {
      event.dataTransfer.setData("text/plain", mappedTool);
    } catch {}
  };

  const handleLayoutToolTouchStart = (
    toolId: "select" | "move" | "erase" | "draw" | "line" | "arrow" | "bezier" | "player" | "opponent" | "goalkeeper" | "ball" | "cone" | "goal" | "goalLarge" | "disc" | "cinesino" | "sagoma" | "flag" | "ladder" | "hurdle" | "pole" | "vest" | "text",
    event: React.TouchEvent<HTMLElement>,
  ) => {
    const mappedTool = mapLayoutToolToBoardTool(toolId);
    if (!mappedTool) return;
    const touch = event.touches[0];
    if (!touch) return;
    touchPaletteDragRef.current = { tool: mappedTool, touchId: touch.identifier, startMoved: false };
    setTouchGhostTool({ tool: mappedTool, x: touch.clientX, y: touch.clientY });
  };

  const handleExportBoard = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `${(tacticName.trim() || "lavagna-tattica").replace(/\\s+/g, "-").toLowerCase()}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  return (
    <TacticalBoardLayoutV2
      boardTitle={tacticName || "Nuova Lavagna Tattica"}
      onBoardTitleChange={setTacticName}
      activeTool={activeToolV2}
      onToolChange={handleLayoutToolChange}
      onToolDragStart={handleLayoutToolDragStart}
      onToolTouchStart={handleLayoutToolTouchStart}
      onSave={saveTactic}
      onOpen={() => setShowLoad(true)}
      onImport={() => setShowExercises(true)}
      onExport={handleExportBoard}
      onUndo={undo}
      onRedo={redo}
      canUndo={history.length > 0}
      canRedo={redoStack.length > 0}
      formations={Object.keys(LEGACY_FORMATIONS)}
      onApplyFormation={applyFormation}
      fieldFormat={fieldFormat}
      onFieldFormatChange={setFieldFormat}
      fieldView={fieldType}
      onFieldViewChange={setFieldType}
      fieldRenderMode={fieldRenderMode}
      onFieldRenderModeChange={setFieldRenderMode}
      devicePreview={devicePreview}
      onDevicePreviewChange={setDevicePreview}
      selectedElementLabel={selectedElement?.playerName || selectedElement?.label || null}
      selectedElementType={selectedElement?.type || null}
      selectedElementDetails={selectedElementDetails}
      libraryItems={libraryItems}
      sessionItems={sessionItems}
      boardContent={
        <div ref={containerRef} className="relative h-full w-full min-h-0 overflow-hidden">
          <canvas
            ref={canvasRef}
            width={canvasSize.w * (window.devicePixelRatio || 1)}
            height={canvasSize.h * (window.devicePixelRatio || 1)}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              cursor: dragElement
                ? "grabbing"
                : (["player", "opponent", "goalkeeper", "ball", "cone", "goal", "text", "goalLarge", "disc", "cinesino", "sagoma", "flag", "ladder", "hurdle", "pole", "vest"] as const).includes(tool as any)
                  ? "copy"
                  : "crosshair",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
            className="h-full w-full rounded-[18px]"
            onMouseDown={handleCanvasDown}
            onMouseMove={handleCanvasMove}
            onMouseUp={(e) => handleCanvasUp(e)}
            onMouseLeave={() => handleCanvasUp()}
            onDragOver={handleCanvasDragOver}
            onDrop={handleCanvasDrop}
          />
          {touchGhostPreview}
        </div>
      }
    />
  );
}



