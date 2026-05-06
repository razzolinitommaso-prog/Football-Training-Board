import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/hooks/use-auth";
import { useListTeams } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  Save,
  Copy,
  Share2,
  Search,
  ChevronDown,
  ChevronLeft,
  Mic,
  Video,
  MoreHorizontal,
  Play,
  Upload,
  Folder,
  Maximize2,
  MousePointer2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { withApi } from "@/lib/api-base";
import { FORMATIONS, isFormationPresetId } from "./formations";
import type { ArrowToolPreset, TacticalBoardData, TacticalBoardElement, TacticalBoardFormat } from "./board-types";
import { useTeamPlayers, type TeamPlayer } from "./use-team-players";
import { assignPlayersToElements } from "./player-mapping";

const deriveFormatFromCategory = (category?: string | null): TacticalBoardFormat => {
  const normalizedCategory = String(category ?? "").toLowerCase();
  if (normalizedCategory.includes("piccoli") || normalizedCategory.includes("primi calci")) return "5v5";
  if (normalizedCategory.includes("pulcini")) return "7v7";
  if (normalizedCategory.includes("esordienti")) return "9v9";
  return "11v11";
};

const parseNumericId = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const formatRosterLastName = (player?: Pick<TeamPlayer, "firstName" | "lastName"> | null) => {
  const raw = String(player?.lastName || player?.firstName || "").trim();
  if (!raw) return "";
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : "")
    .join(" ");
};

const fullPlayerName = (player: Pick<TeamPlayer, "firstName" | "lastName">) =>
  `${player.firstName ?? ""} ${player.lastName ?? ""}`.trim();

const isPlayerAvailable = (player?: Pick<TeamPlayer, "available"> | null) => player?.available !== false;

const BOARD_TYPES = ["Training", "Match", "Set Piece", "Quick Idea"] as const;
const BOARD_TAGS = ["Pressing", "Build-up", "Transition"] as const;
const EQUIPMENT_TOOLS = ["ball", "cone", "goal", "goalLarge", "sagoma", "flag", "ladder", "hurdle", "pole", "vest", "disc", "cinesino", "text"] as const;
const PLAYER_TYPES = ["player", "opponent", "goalkeeper"] as const;
const DRAWING_TYPES = ["path", "line", "arrow", "bezier", "bezierarrow", "draw", "zone"] as const;
const FIELD_MEASUREMENTS: Record<TacticalBoardFormat, {
  canvasLength: number;
  canvasWidth: number;
  length: number;
  width: number;
  gridStep: number;
  centerCircleRadius: number;
  penaltyAreaDepth: number;
  penaltyAreaWidth: number;
  goalAreaDepth: number;
  goalAreaWidth: number;
  penaltySpotDistance: number;
  goalWidth: number;
  goalDepth: number;
  cornerRadius: number;
}> = {
  "3v3": { canvasLength: 27.4, canvasWidth: 17.4, length: 25, width: 15, gridStep: 5, centerCircleRadius: 3, penaltyAreaDepth: 0, penaltyAreaWidth: 0, goalAreaDepth: 0, goalAreaWidth: 0, penaltySpotDistance: 0, goalWidth: 3, goalDepth: 1.2, cornerRadius: 1 },
  "5v5": { canvasLength: 42.8, canvasWidth: 27.8, length: 40, width: 25, gridStep: 5, centerCircleRadius: 4, penaltyAreaDepth: 6, penaltyAreaWidth: 15, goalAreaDepth: 0, goalAreaWidth: 0, penaltySpotDistance: 6, goalWidth: 3, goalDepth: 1.4, cornerRadius: 1 },
  "7v7": { canvasLength: 68.2, canvasWidth: 47.2, length: 65, width: 45, gridStep: 5, centerCircleRadius: 6, penaltyAreaDepth: 13, penaltyAreaWidth: 26, goalAreaDepth: 4, goalAreaWidth: 14, penaltySpotDistance: 9, goalWidth: 5, goalDepth: 1.6, cornerRadius: 1 },
  "9v9": { canvasLength: 75.6, canvasWidth: 52.6, length: 72, width: 50, gridStep: 5, centerCircleRadius: 6, penaltyAreaDepth: 13, penaltyAreaWidth: 30, goalAreaDepth: 4.5, goalAreaWidth: 16, penaltySpotDistance: 9, goalWidth: 6, goalDepth: 1.8, cornerRadius: 1 },
  "11v11": { canvasLength: 114, canvasWidth: 77, length: 110, width: 75, gridStep: 10, centerCircleRadius: 9.15, penaltyAreaDepth: 16.5, penaltyAreaWidth: 40.32, goalAreaDepth: 5.5, goalAreaWidth: 18.32, penaltySpotDistance: 11, goalWidth: 7.32, goalDepth: 2, cornerRadius: 1 },
};

function isPlayerType(type?: string): boolean {
  return PLAYER_TYPES.includes(type as (typeof PLAYER_TYPES)[number]);
}

function isEquipmentType(type?: string): boolean {
  return EQUIPMENT_TOOLS.includes(type as (typeof EQUIPMENT_TOOLS)[number]);
}

function isDrawingType(type?: string): boolean {
  return DRAWING_TYPES.includes(type as (typeof DRAWING_TYPES)[number]);
}

function getPitchPoint(event: React.PointerEvent<HTMLDivElement> | PointerEvent, pitch: HTMLDivElement) {
  const rect = pitch.getBoundingClientRect();
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100),
    y: clamp(((event.clientY - rect.top) / rect.height) * 100),
  };
}

function makeSmoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length < 3) return `M ${points[0].x} ${points[0].y} ${points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ")}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y} ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  d += ` T ${last.x} ${last.y}`;
  return d;
}

const DEFAULT_ARROW_PRESET: ArrowToolPreset = {
  geometry: "freehand",
  heads: "end",
  lineStyle: "solid",
};

function buildArrowDrawShape(preset: ArrowToolPreset): string {
  const base = preset.geometry === "straight" ? "straight-arrow" : "freehand-arrow";
  return preset.lineStyle === "dashed" ? `${base}-dashed` : base;
}

function resolveArrowHeads(el: TacticalBoardElement): ArrowToolPreset["heads"] {
  const h = el.arrowHeads;
  if (h === "none" || h === "end" || h === "start" || h === "both") return h;
  if (el.type !== "arrow" && el.type !== "bezierarrow") return "none";
  if (el.arrowEnd === "none") return "none";
  return "end";
}

function polylineLength(points: Array<{ x: number; y: number }>): number {
  let s = 0;
  for (let i = 1; i < points.length; i += 1) {
    s += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return s;
}

function drawingPathData(el: TacticalBoardElement, points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return "";
  if (String(el.drawShape ?? "").includes("straight")) {
    const a = points[0];
    const b = points[points.length - 1];
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  }
  return makeSmoothPath(points);
}

function strokeDashForDrawing(el: TacticalBoardElement): string | undefined {
  return String(el.drawShape ?? "").includes("dashed") ? "2.3 1.6" : undefined;
}

function ArrowToolPresetMenuContent({
  arrowToolPreset,
  setArrowToolPreset,
}: {
  arrowToolPreset: ArrowToolPreset;
  setArrowToolPreset: React.Dispatch<React.SetStateAction<ArrowToolPreset>>;
}) {
  return (
    <>
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Tracciato</div>
      <div className="mb-2 grid gap-1">
        <button
          type="button"
          onClick={() => setArrowToolPreset((p) => ({ ...p, geometry: "freehand" }))}
          className={`rounded-lg px-3 py-2 text-left text-sm ${
            arrowToolPreset.geometry === "freehand" ? "bg-[#FACC15] text-black" : "text-white/90 hover:bg-white/10"
          }`}
        >
          Mano libera (curva)
        </button>
        <button
          type="button"
          onClick={() => setArrowToolPreset((p) => ({ ...p, geometry: "straight" }))}
          className={`rounded-lg px-3 py-2 text-left text-sm ${
            arrowToolPreset.geometry === "straight" ? "bg-[#FACC15] text-black" : "text-white/90 hover:bg-white/10"
          }`}
        >
          Rettilinea
        </button>
      </div>
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Punte</div>
      <div className="mb-2 grid gap-1">
        {(
          [
            ["end", "Verso la fine"],
            ["start", "Verso l'inizio"],
            ["both", "Entrambe le estremità"],
            ["none", "Senza punta"],
          ] as const
        ).map(([heads, label]) => (
          <button
            key={heads}
            type="button"
            onClick={() => setArrowToolPreset((p) => ({ ...p, heads }))}
            className={`rounded-lg px-3 py-2 text-left text-sm ${
              arrowToolPreset.heads === heads ? "bg-[#FACC15] text-black" : "text-white/90 hover:bg-white/10"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Linea</div>
      <div className="grid gap-1">
        <button
          type="button"
          onClick={() => setArrowToolPreset((p) => ({ ...p, lineStyle: "solid" }))}
          className={`rounded-lg px-3 py-2 text-left text-sm ${
            arrowToolPreset.lineStyle === "solid" ? "bg-[#FACC15] text-black" : "text-white/90 hover:bg-white/10"
          }`}
        >
          Continua
        </button>
        <button
          type="button"
          onClick={() => setArrowToolPreset((p) => ({ ...p, lineStyle: "dashed" }))}
          className={`rounded-lg px-3 py-2 text-left text-sm ${
            arrowToolPreset.lineStyle === "dashed" ? "bg-[#FACC15] text-black" : "text-white/90 hover:bg-white/10"
          }`}
        >
          Tratteggiata
        </button>
      </div>
    </>
  );
}

function MetricFieldOverlay({
  spec,
  showGrid,
  showFieldMarkings,
}: {
  spec: (typeof FIELD_MEASUREMENTS)[TacticalBoardFormat];
  showGrid: boolean;
  showFieldMarkings: boolean;
}) {
  const verticalLines = Array.from({ length: Math.floor(spec.length / spec.gridStep) }, (_, i) => (i + 1) * spec.gridStep).filter((x) => x < spec.length);
  const penaltyTop = (spec.width - spec.penaltyAreaWidth) / 2;
  const goalAreaTop = (spec.width - spec.goalAreaWidth) / 2;
  const goalTop = (spec.width - spec.goalWidth) / 2;
  const goalNetLines = Array.from({ length: 5 }, (_, i) => i + 1);
  const showPenaltyArea = spec.penaltyAreaDepth > 0 && spec.penaltyAreaWidth > 0;
  const showGoalArea = spec.goalAreaDepth > 0 && spec.goalAreaWidth > 0;
  const showPenaltySpot = spec.penaltySpotDistance > 0;
  const fieldOriginX = (spec.canvasLength - spec.length) / 2;
  const fieldOriginY = (spec.canvasWidth - spec.width) / 2;
  const gridOffsetY = spec.length >= 100 ? -(spec.gridStep / 4) : 0;
  const gridOffsetX = 0;
  const isFiveAside = spec.length <= 40;
  const gridLabelFontSize = isFiveAside
    ? 0.9
    : Math.max(1.0, Number((1.8 * (spec.canvasLength / 114)).toFixed(2)));
  const gridStrokeWidth = isFiveAside ? 0.06 : 0.08;
  const fieldX = (meters: number) => fieldOriginX + meters;
  const fieldY = (meters: number) => fieldOriginY + meters;
  const centerX = fieldX(spec.length / 2);
  const centerY = fieldY(spec.width / 2);
  const goalOuterLeft = fieldOriginX - spec.goalDepth;
  const goalOuterRight = fieldOriginX + spec.length;
  const horizontalLines = Array.from({ length: Math.ceil(spec.width / spec.gridStep) }, (_, i) => (i + 1) * spec.gridStep)
    .filter((y) => y < spec.width);

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
      viewBox={`0 0 ${spec.canvasLength} ${spec.canvasWidth}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {showGrid && (
        <>
          <g opacity="0.22">
            {verticalLines.map((x) => (
              <path key={`grid-x-${x}`} d={`M ${fieldX(x + gridOffsetX)} ${fieldOriginY + gridOffsetY} V ${fieldOriginY + spec.width}`} stroke="white" strokeWidth={gridStrokeWidth} />
            ))}
            {horizontalLines.map((y) => (
              <path key={`grid-y-${y}`} d={`M ${fieldOriginX} ${fieldY(y) + gridOffsetY} H ${fieldOriginX + spec.length}`} stroke="white" strokeWidth={gridStrokeWidth} />
            ))}
          </g>
          <g opacity="0.5" fontSize={gridLabelFontSize} fill="white" fontWeight="600">
            {verticalLines.map((x) => (
              <text key={`label-x-${x}`} x={fieldX(x + gridOffsetX)} y={fieldOriginY + (isFiveAside ? 2.0 : 2.5)} textAnchor="middle">{x}m</text>
            ))}
            {horizontalLines.map((y) => (
              <text key={`label-y-${y}`} x={fieldOriginX + (isFiveAside ? 0.9 : 1.2)} y={fieldY(y) + gridOffsetY + (isFiveAside ? 0.42 : 0.55)}>
                {Math.max(0, Math.round(y + gridOffsetY))}m
              </text>
            ))}
          </g>
        </>
      )}
      <g fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" opacity="0.52">
        {/* Single rounded outline: rx matches spec.cornerRadius; extra corner paths duplicated this and looked like a stray curve when Linee was on. */}
        <rect x={fieldOriginX} y={fieldOriginY} width={spec.length} height={spec.width} rx={spec.cornerRadius} strokeWidth="0.22" />
        {showFieldMarkings && (
          <>
            <path d={`M ${centerX} ${fieldOriginY} V ${fieldOriginY + spec.width}`} strokeWidth="0.22" />
            <circle cx={centerX} cy={centerY} r={spec.centerCircleRadius} strokeWidth="0.18" />
            {showPenaltyArea && (
              <>
                <rect x={fieldOriginX} y={fieldY(penaltyTop)} width={spec.penaltyAreaDepth} height={spec.penaltyAreaWidth} strokeWidth="0.18" />
                <rect x={fieldX(spec.length - spec.penaltyAreaDepth)} y={fieldY(penaltyTop)} width={spec.penaltyAreaDepth} height={spec.penaltyAreaWidth} strokeWidth="0.18" />
              </>
            )}
            {showGoalArea && (
              <>
                <rect x={fieldOriginX} y={fieldY(goalAreaTop)} width={spec.goalAreaDepth} height={spec.goalAreaWidth} strokeWidth="0.18" />
                <rect x={fieldX(spec.length - spec.goalAreaDepth)} y={fieldY(goalAreaTop)} width={spec.goalAreaDepth} height={spec.goalAreaWidth} strokeWidth="0.18" />
              </>
            )}
            {showPenaltySpot && (
              <>
                <circle cx={fieldX(spec.penaltySpotDistance)} cy={centerY} r="0.35" fill="white" stroke="none" opacity="0.85" />
                <circle cx={fieldX(spec.length - spec.penaltySpotDistance)} cy={centerY} r="0.35" fill="white" stroke="none" opacity="0.85" />
                <path d={`M ${fieldX(spec.penaltyAreaDepth)} ${centerY - spec.centerCircleRadius} A ${spec.centerCircleRadius} ${spec.centerCircleRadius} 0 0 1 ${fieldX(spec.penaltyAreaDepth)} ${centerY + spec.centerCircleRadius}`} strokeWidth="0.18" />
                <path d={`M ${fieldX(spec.length - spec.penaltyAreaDepth)} ${centerY - spec.centerCircleRadius} A ${spec.centerCircleRadius} ${spec.centerCircleRadius} 0 0 0 ${fieldX(spec.length - spec.penaltyAreaDepth)} ${centerY + spec.centerCircleRadius}`} strokeWidth="0.18" />
              </>
            )}
            <path d={`M ${fieldOriginX} ${fieldY(goalTop)} V ${fieldY(goalTop + spec.goalWidth)} M ${fieldOriginX + spec.length} ${fieldY(goalTop)} V ${fieldY(goalTop + spec.goalWidth)}`} strokeWidth="0.45" />
            <g opacity="0.9">
              <rect x={goalOuterLeft} y={fieldY(goalTop)} width={spec.goalDepth} height={spec.goalWidth} fill="rgba(255,255,255,0.08)" stroke="white" strokeWidth="0.12" />
              <rect x={goalOuterRight} y={fieldY(goalTop)} width={spec.goalDepth} height={spec.goalWidth} fill="rgba(255,255,255,0.08)" stroke="white" strokeWidth="0.12" />
              {goalNetLines.map((line) => (
                <React.Fragment key={`goal-net-${line}`}>
                  <path d={`M ${goalOuterLeft} ${fieldY(goalTop + (spec.goalWidth / 6) * line)} H ${fieldOriginX}`} stroke="white" strokeWidth="0.05" opacity="0.65" />
                  <path d={`M ${goalOuterRight} ${fieldY(goalTop + (spec.goalWidth / 6) * line)} H ${fieldOriginX + spec.length + spec.goalDepth}`} stroke="white" strokeWidth="0.05" opacity="0.65" />
                </React.Fragment>
              ))}
              {[0.35, 0.7].map((offset) => (
                <React.Fragment key={`goal-depth-${offset}`}>
                  <path d={`M ${goalOuterLeft + spec.goalDepth * offset} ${fieldY(goalTop)} V ${fieldY(goalTop + spec.goalWidth)}`} stroke="white" strokeWidth="0.05" opacity="0.65" />
                  <path d={`M ${goalOuterRight + spec.goalDepth * offset} ${fieldY(goalTop)} V ${fieldY(goalTop + spec.goalWidth)}`} stroke="white" strokeWidth="0.05" opacity="0.65" />
                </React.Fragment>
              ))}
            </g>
          </>
        )}
      </g>
    </svg>
  );
}

function EquipmentGlyph({ type }: { type?: string }) {
  if (type === "ball") {
    return <div className="text-[28px] leading-none drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)]">⚽</div>;
  }

  if (type === "cone") {
    return (
      <svg viewBox="0 0 48 48" className="h-10 w-10 drop-shadow-lg">
        <path d="M24 6 36 36H12L24 6Z" fill="#f97316" stroke="#991b1b" strokeWidth="2" />
        <path d="M17 24h14M14 33h20" stroke="#fed7aa" strokeWidth="3" strokeLinecap="round" />
        <path d="M9 38h30" stroke="#7f1d1d" strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "goalLarge" || type === "goal") {
    return (
      <svg viewBox="0 0 64 44" className="h-12 w-16 drop-shadow-lg">
        <path d="M6 34V10h52v24" fill="none" stroke="#f8fafc" strokeWidth="4" strokeLinejoin="round" />
        <path d="M10 14h44M10 20h44M10 26h44M16 10v24M26 10v24M38 10v24M48 10v24" stroke="#bbf7d0" strokeWidth="1.5" opacity=".9" />
        <path d="M6 34h52" stroke="#f8fafc" strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "sagoma") {
    return (
      <svg viewBox="0 0 44 58" className="h-14 w-11 drop-shadow-lg">
        <circle cx="22" cy="11" r="8" fill="#38bdf8" stroke="#075985" strokeWidth="3" />
        <path d="M13 22h18l4 25H9l4-25Z" fill="#0ea5e9" stroke="#075985" strokeWidth="3" strokeLinejoin="round" />
        <path d="M11 50h22" stroke="#082f49" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "flag") {
    return (
      <svg viewBox="0 0 38 58" className="h-14 w-10 drop-shadow-lg">
        <path d="M10 7v43" stroke="#713f12" strokeWidth="3" strokeLinecap="round" />
        <path d="M11 8c8-5 13 4 21 0v20c-8 4-13-5-21 0V8Z" fill="#fde047" stroke="#a16207" strokeWidth="2" />
        <circle cx="10" cy="51" r="4" fill="#713f12" />
      </svg>
    );
  }

  if (type === "ladder") {
    return (
      <svg viewBox="0 0 70 34" className="h-9 w-16 drop-shadow-lg">
        <path d="M8 7h54M8 27h54" stroke="#111827" strokeWidth="4" strokeLinecap="round" />
        {[18, 28, 38, 48].map((x) => <path key={x} d={`M${x} 7v20`} stroke="#111827" strokeWidth="3" strokeLinecap="round" />)}
      </svg>
    );
  }

  if (type === "hurdle") {
    return (
      <svg viewBox="0 0 58 42" className="h-11 w-14 drop-shadow-lg">
        <path d="M11 33V14h36v19" fill="none" stroke="#b91c1c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 33h10M40 33h10" stroke="#7f1d1d" strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "pole") {
    return (
      <svg viewBox="0 0 28 70" className="h-16 w-8 drop-shadow-lg">
        <path d="M14 6v58" stroke="#fde047" strokeWidth="5" strokeLinecap="round" />
        <path d="M8 64h12" stroke="#854d0e" strokeWidth="4" strokeLinecap="round" />
        <path d="M14 16h0M14 28h0M14 40h0M14 52h0" stroke="#b45309" strokeWidth="6" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "vest") {
    return (
      <svg viewBox="0 0 50 52" className="h-12 w-12 drop-shadow-lg">
        <path d="M15 6h8c0 6 4 6 4 0h8l8 10-7 7-3-4v26H17V19l-3 4-7-7 8-10Z" fill="#fde047" stroke="#a16207" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "disc" || type === "cinesino") {
    return <div className="h-8 w-8 rounded-full bg-yellow-300 border-2 border-yellow-700 shadow-lg" />;
  }

  if (type === "text") {
    return <div className="rounded-lg border-2 border-white bg-black/30 px-2 py-1 text-lg font-black text-white shadow-lg">T</div>;
  }

  return <div className="h-8 w-8 rounded-full bg-white/80 shadow-lg" />;
}

const QuickPage = () => {
  const { club } = useAuth();
  const { data: allTeams } = useListTeams();
  const initialTeamIdFromQuery = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return parseNumericId(params.get("teamId"));
  }, []);
  const initialBoardIdFromQuery = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return parseNumericId(params.get("boardId"));
  }, []);
  const initialPresetFromQuery = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("preset");
    return raw && isFormationPresetId(raw) ? raw : null;
  }, []);
  const initialConvocatiIds = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("convocati");
    if (!raw) return [] as number[];
    return raw.split(",").map((x) => Number(x)).filter((n) => Number.isFinite(n));
  }, []);

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const showRightSidebar = false;
  const [focusMode, setFocusMode] = useState(false);
  const [activeTool, setActiveTool] = useState("player");
  const [saveState, setSaveState] = useState("Saved");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(initialPresetFromQuery ?? "4-3-3");
  const [boardTitle, setBoardTitle] = useState("Nuova lavagna");
  const [currentBoardId, setCurrentBoardId] = useState<number | null>(null);
  const [boardTeamId, setBoardTeamId] = useState<number | null>(initialTeamIdFromQuery);
  const [boardMode, setBoardMode] = useState<"assigned" | "free">(initialTeamIdFromQuery ? "assigned" : "free");
  const [boardClubId, setBoardClubId] = useState<number | null>(parseNumericId((club as any)?.id));
  const [boardCategory, setBoardCategory] = useState<string | null>(null);
  const [boardFormat, setBoardFormat] = useState<TacticalBoardFormat>("11v11");
  const [boardType, setBoardType] = useState<(typeof BOARD_TYPES)[number]>("Training");
  const [boardNotes, setBoardNotes] = useState("Obiettivo: attirare la prima pressione e uscire sul lato debole con la mezzala dentro.");
  const [librarySearch, setLibrarySearch] = useState("");
  const [bottomMenu, setBottomMenu] = useState<"players" | "equipment" | "library">("players");
  const [showMetricGrid, setShowMetricGrid] = useState(true);
  const [showFieldMarkings, setShowFieldMarkings] = useState(true);
  const [pendingRosterPlayerId, setPendingRosterPlayerId] = useState<number | null>(null);
  const [freeMenuOpen, setFreeMenuOpen] = useState(false);
  const [arrowMenuOpen, setArrowMenuOpen] = useState(false);
  const [arrowToolPreset, setArrowToolPreset] = useState<ArrowToolPreset>(DEFAULT_ARROW_PRESET);
  const movementToolShellRef = useRef<HTMLDivElement>(null);
  const [arrowMenuViewport, setArrowMenuViewport] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!arrowMenuOpen) {
      setArrowMenuViewport(null);
      return;
    }
    const el = movementToolShellRef.current;
    if (!el) return;
    const place = () => {
      const r = el.getBoundingClientRect();
      const width = Math.max(260, r.width);
      let top = r.bottom + 6;
      let left = r.left;
      const maxH = Math.min(window.innerHeight * 0.7, 420);
      if (top + maxH > window.innerHeight - 8) {
        top = Math.max(8, r.top - 6 - maxH);
      }
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8);
      }
      setArrowMenuViewport({ top, left, width });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [arrowMenuOpen]);

  const [selectedElementIndex, setSelectedElementIndex] = useState<number | null>(null);
  const [selectedElementIndexes, setSelectedElementIndexes] = useState<number[]>([]);

  
  const [boards, setBoards] = useState<any[]>([]);
  const [boardsError, setBoardsError] = useState<string | null>(null);
  const [elements, setElements] = useState<TacticalBoardElement[]>([]);
  const effectiveTeamId = boardMode === "assigned" ? boardTeamId : null;
  const { players: fetchedTeamPlayers } = useTeamPlayers(effectiveTeamId);
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([]);
  const didHydrateBoardFromUrlRef = React.useRef(false);

  const setBoardIdInUrl = React.useCallback((boardId: number | null) => {
    const url = new URL(window.location.href);
    if (boardId) {
      url.searchParams.set("boardId", String(boardId));
    } else {
      url.searchParams.delete("boardId");
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const applyBoardState = React.useCallback(
    (board: any) => {
      const data = (board.data || {}) as TacticalBoardData;
      const parsedBoardId = parseNumericId(board?.id);
      setCurrentBoardId(parsedBoardId);
      setBoardTitle(board.title ?? "Nuova lavagna");
      const nextTeamId = parseNumericId(data.teamId) ?? initialTeamIdFromQuery;
      setBoardTeamId(nextTeamId);
      setBoardMode(nextTeamId ? "assigned" : "free");
      setBoardClubId(parseNumericId(data.clubId) ?? parseNumericId((club as any)?.id));
      setBoardCategory((data.category as string | null) ?? null);
      setBoardFormat(
        (data.format as TacticalBoardFormat | undefined) ??
          deriveFormatFromCategory((data.category as string | null) ?? null)
      );
      setSelectedPreset(data.preset ?? null);
      setActiveTool(data.activeTool ?? "player");
      setFocusMode(data.focusMode ?? false);
      const ap = data.arrowToolPreset;
      if (
        ap &&
        typeof ap === "object" &&
        (ap.geometry === "freehand" || ap.geometry === "straight") &&
        (ap.heads === "none" || ap.heads === "end" || ap.heads === "start" || ap.heads === "both") &&
        (ap.lineStyle === "solid" || ap.lineStyle === "dashed")
      ) {
        setArrowToolPreset({
          geometry: ap.geometry,
          heads: ap.heads,
          lineStyle: ap.lineStyle,
        });
      } else {
        setArrowToolPreset(DEFAULT_ARROW_PRESET);
      }
      setElements(data.elements ?? []);
      setSelectedElementIndex(null);
      setSelectedElementIndexes([]);
      setSaveState("Saved");
      setBoardIdInUrl(parsedBoardId);
    },
    [club, initialTeamIdFromQuery, setBoardIdInUrl]
  );

  const loadBoards = async () => {
    try {
      console.log("[tactical-board] request GET /api/boards");
      const res = await fetch(withApi("/api/boards"), { credentials: "include" });
      console.log("[tactical-board] response GET /api/boards ->", res.status);
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      const data = await res.json();
      console.log("[tactical-board] payload /api/boards:", data);
      setBoards(data);
      setBoardsError(null);
    } catch (err) {
      console.error("Errore caricamento boards", err);
      setBoards([]);
      setBoardsError("Errore caricamento lavagne dal backend.");
    }
  };
  
  React.useEffect(() => {
    loadBoards();
  }, []);

  React.useEffect(() => {
    if (!freeMenuOpen && !arrowMenuOpen) return;
    const close = () => {
      setFreeMenuOpen(false);
      setArrowMenuOpen(false);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [freeMenuOpen, arrowMenuOpen]);

  React.useEffect(() => {
    if (didHydrateBoardFromUrlRef.current) return;
    if (!initialBoardIdFromQuery) return;
    if (!boards.length) return;

    const boardFromUrl = boards.find((b) => parseNumericId(b?.id) === initialBoardIdFromQuery);
    if (!boardFromUrl) return;

    applyBoardState(boardFromUrl);
    didHydrateBoardFromUrlRef.current = true;
  }, [applyBoardState, boards, initialBoardIdFromQuery]);

  React.useEffect(() => {
    setBoardClubId(parseNumericId((club as any)?.id));
  }, [club]);

  React.useEffect(() => {
    if (boardMode === "free") {
      setBoardCategory(null);
      setBoardFormat("11v11");
      return;
    }
    if (!boardTeamId) return;
    const team = (allTeams || []).find((t: any) => parseNumericId(t.id) === boardTeamId);
    if (!team) return;
    const category = team.category ?? null;
    setBoardCategory(category);
    setBoardFormat(deriveFormatFromCategory(category));
  }, [allTeams, boardMode, boardTeamId]);

  React.useEffect(() => {
    setTeamPlayers(fetchedTeamPlayers);
  }, [fetchedTeamPlayers]);

  React.useEffect(() => {
    if (boardMode === "free") return;
    if (!teamPlayers.length) return;
    setElements((prev) => assignPlayersToElements(prev, teamPlayers));
  }, [boardMode, teamPlayers]);

  React.useEffect(() => {
    if (!initialPresetFromQuery) return;
    applyPreset(initialPresetFromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardFormat]);

  React.useEffect(() => {
    if (!initialConvocatiIds.length || !fetchedTeamPlayers.length) return;
    const convSet = new Set(initialConvocatiIds);
    const prioritized = [
      ...fetchedTeamPlayers.filter((p) => convSet.has(p.id)),
      ...fetchedTeamPlayers.filter((p) => !convSet.has(p.id)),
    ];
    setTeamPlayers(prioritized);
  }, [initialConvocatiIds, fetchedTeamPlayers]);

  React.useEffect(() => {
    if (!selectedPreset || !isFormationPresetId(selectedPreset)) return;
    if (FORMATIONS[selectedPreset].formats.includes(boardFormat)) return;
    setSelectedPreset(null);
  }, [boardFormat, selectedPreset]);

  const pitchRef = React.useRef<HTMLDivElement | null>(null);
  const isDraggingRef = React.useRef(false);
  const skipNextPitchClickRef = React.useRef(false);

  const assignedTeams = Array.isArray(allTeams) ? allTeams : [];
  const fallbackAssignedTeam = assignedTeams[0] ?? null;
  const formationPresetOptions = Object.entries(FORMATIONS)
    .filter(([, formation]) => formation.formats.includes(boardFormat))
    .map(([formation]) => formation);
  const presets = [
    ...formationPresetOptions,
    "Pressing",
    "Uscita",
    "Transizione",
    "Corner Off",
    "Corner Def",
  ];
  const loadTeamById = (teamIdRaw: string | number | null) => {
    const nextTeamId = parseNumericId(teamIdRaw) ?? parseNumericId(fallbackAssignedTeam?.id);
    if (!nextTeamId) return;
    const team = (allTeams || []).find((item: any) => parseNumericId(item.id) === nextTeamId) ?? fallbackAssignedTeam;
    const category = team?.category ?? null;
    setBoardMode("assigned");
    setBoardTeamId(nextTeamId);
    setBoardCategory(category);
    setBoardFormat(deriveFormatFromCategory(category));
    setSaveState("Unsaved");
  };

  const workFree = (format: TacticalBoardFormat = "11v11") => {
    setBoardMode("free");
    setBoardTeamId(null);
    setBoardCategory(null);
    setBoardFormat(format);
    setTeamPlayers([]);
    setSelectedPreset(null);
    setElements([]);
    setFreeMenuOpen(false);
    setArrowMenuOpen(false);
    setSaveState("Unsaved");
  };

  const detectedModule = React.useMemo(() => {
    const ownPlayers = elements.filter((el) => isPlayerType(el?.type) && el.type !== "opponent");
    const goalkeepers = ownPlayers.filter((el) => el.type === "goalkeeper").length;
    const movementPlayers = ownPlayers
      .filter((el) => el.type !== "goalkeeper" && typeof el.x === "number")
      .sort((a, b) => Number(a.x ?? 0) - Number(b.x ?? 0));

    if (!ownPlayers.length) return "";

    const lineCounts: number[] = [];
    let currentLineX: number | null = null;

    movementPlayers.forEach((player) => {
      const x = Number(player.x ?? 0);
      if (currentLineX === null || Math.abs(x - currentLineX) > 8) {
        lineCounts.push(1);
        currentLineX = x;
        return;
      }
      lineCounts[lineCounts.length - 1] += 1;
      currentLineX = (currentLineX + x) / 2;
    });

    const goalkeeperPart = `(${goalkeepers || 0})`;
    return [goalkeeperPart, ...lineCounts.map(String)].join("-");
  }, [elements]);

  const moduleLabel = selectedPreset && isFormationPresetId(selectedPreset)
    ? detectedModule && detectedModule !== `(1)-${selectedPreset}`
      ? `${selectedPreset} · rilevato ${detectedModule}`
      : detectedModule || `(1)-${selectedPreset}`
    : detectedModule || "Lavagna libera";

  const applyPreset = (presetName: string) => {
    setSelectedPreset(presetName);

    if (!isFormationPresetId(presetName)) return;

    const formation = FORMATIONS[presetName];

    const currentBoardFormat = boardFormat;

    // TEMP DEBUG: remove once board format/category are fully wired.
    console.log("[tactical-board] applyPreset formation", {
      presetName,
      currentBoardFormat,
      formationFormats: formation.formats,
    });

    if (!formation.formats.includes(currentBoardFormat)) {
      // TEMP DEBUG
      console.log("[tactical-board] Formation blocked by format guard");
      return;
    }

    const presetElements = formation.slots.map((slot) => ({
      type: slot.role,
      x: slot.x,
      y: slot.y,
    }));
    setElements(
      boardMode === "assigned" && teamPlayers.length
        ? assignPlayersToElements(presetElements, teamPlayers)
        : presetElements
    );
    setSelectedElementIndex(null);
    setSelectedElementIndexes([]);
    setSaveState("Unsaved");
  };

  const folders = [
    "Match",
    "Training",
    "Set Pieces",
    "Pressing",
    "Quick Ideas",
  ];

  const playerTools = [
    { id: "player", label: "Giocatore 1", accentClass: "bg-sky-500 border-sky-300 text-white" },
    { id: "opponent", label: "Giocatore 2", accentClass: "bg-rose-500 border-rose-300 text-white" },
    { id: "goalkeeper", label: "Portiere", accentClass: "bg-amber-400 border-amber-200 text-black" },
  ];
  const boardActionTools = [
    "Carica sessione",
    "Esercizio",
    "Tattica",
    "Rosa",
    "Note video",
    "Note vocali",
    "Note veloci testo",
    "Prepara partita",
  ];
  const tacticalToolButtons = [
    { id: "select", label: "Seleziona" },
    { id: "draw", label: "Disegno" },
    { id: "movement", label: "Freccia" },
    { id: "zones", label: "Zona" },
  ];
  const saveStateLabelMap: Record<string, string> = {
    Saved: "Salvata",
    Unsaved: "Non salvata",
    Saving: "Salvataggio...",
    New: "Nuova",
    Error: "Errore",
  };
  const activeToolLabelMap: Record<string, string> = {
    select: "Seleziona",
    draw: "Disegno",
    movement: "Freccia",
    zones: "Zona",
    player: "Giocatore 1",
    opponent: "Giocatore 2",
    goalkeeper: "Portiere",
    ball: "Palla",
    cone: "Cono",
    goalLarge: "Porta",
    sagoma: "Sagoma",
    flag: "Bandierina",
    ladder: "Scaletta",
    hurdle: "Ostacolo",
    pole: "Paletto",
    vest: "Casacca",
    disc: "Cinesino",
    text: "Testo",
  };
  const equipmentTools = [
    { id: "ball", label: "Palla" },
    { id: "cone", label: "Cono" },
    { id: "goalLarge", label: "Porta" },
    { id: "sagoma", label: "Sagoma" },
    { id: "flag", label: "Bandiera" },
    { id: "ladder", label: "Scaletta" },
    { id: "hurdle", label: "Ostacolo" },
    { id: "pole", label: "Paletto" },
    { id: "vest", label: "Casacca" },
    { id: "disc", label: "Cinesino" },
  ];
  const filteredBoards = boards.filter((board) =>
    board.title?.toLowerCase().includes(librarySearch.toLowerCase())
  );
  const filteredFolders = folders.filter((folder) =>
    folder.toLowerCase().includes(librarySearch.toLowerCase())
  );
  const filteredPresets = presets.filter((preset) =>
    preset.toLowerCase().includes(librarySearch.toLowerCase())
  );
  const pitchMeasurement = FIELD_MEASUREMENTS[boardFormat] ?? FIELD_MEASUREMENTS["11v11"];
  const hasRenderableElements = elements.some((el) => isPlayerType(el?.type) || isEquipmentType(el?.type) || isDrawingType(el?.type));
  const selectedElement =
    selectedElementIndex !== null ? elements[selectedElementIndex] : null;
  const selectedElements = selectedElementIndexes
    .map((idx) => elements[idx])
    .filter(Boolean);
  const usedPlayerIds = new Set(
    elements
      .map((el) => el.playerId)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  );
  const canAssignRealPlayer = selectedElement?.type === "player" || selectedElement?.type === "goalkeeper";
  const selectedElementLabel =
    selectedElement?.name ??
    (selectedElement?.type ? `${selectedElement.type[0].toUpperCase()}${selectedElement.type.slice(1)}` : "Nessuna selezione");
  const selectedElementMeta = selectedElement
    ? [
        selectedElement.number ? `#${selectedElement.number}` : null,
        selectedElement.x != null && selectedElement.y != null ? `${Math.round(selectedElement.x)}% / ${Math.round(selectedElement.y)}%` : null,
      ].filter(Boolean)
    : [];

  const buildPlayerAssignment = (player: TeamPlayer) => ({
    playerId: String(player.id),
    name: fullPlayerName(player),
    displayName: formatRosterLastName(player),
    number: player.jerseyNumber ?? undefined,
  });

  const getNextAvailableRosterPlayer = (type?: string) => {
    if (boardMode !== "assigned" || !teamPlayers.length) return null;
    if (pendingRosterPlayerId) {
      const pending = teamPlayers.find((p) =>
        p.id === pendingRosterPlayerId &&
        !usedPlayerIds.has(String(p.id)) &&
        isPlayerAvailable(p)
      );
      if (pending) return pending;
    }
    const isGoalkeeperSlot = type === "goalkeeper";
    const available = teamPlayers.filter((player) => !usedPlayerIds.has(String(player.id)) && isPlayerAvailable(player));
    if (!available.length) return null;
    const matchingRole = available.find((player) =>
      isGoalkeeperSlot
        ? String(player.position ?? "").toLowerCase().includes("port")
        : !String(player.position ?? "").toLowerCase().includes("port")
    );
    return matchingRole ?? available[0] ?? null;
  };

  const assignPlayerToSelectedElement = (playerIdRaw: string) => {
    if (selectedElementIndex === null) return;
    const player = teamPlayers.find((p) => String(p.id) === playerIdRaw);
    if (!player) return;

    setElements((prev) =>
      prev.map((item, idx) =>
        idx === selectedElementIndex
          ? {
              ...item,
              ...buildPlayerAssignment(player),
            }
          : item
      )
    );
    setPendingRosterPlayerId(null);
    setSaveState("Unsaved");
  };

  const selectElement = (index: number, event?: React.PointerEvent | React.MouseEvent) => {
    const additive = Boolean(event?.shiftKey || event?.ctrlKey || event?.metaKey);
    setSelectedElementIndexes((prev) => {
      const next = additive
        ? prev.includes(index)
          ? prev.filter((idx) => idx !== index)
          : [...prev, index]
        : [index];
      setSelectedElementIndex(next[next.length - 1] ?? null);
      return next;
    });
  };

  const deleteSelectedElements = () => {
    const indexes = selectedElementIndexes.length ? selectedElementIndexes : selectedElementIndex !== null ? [selectedElementIndex] : [];
    if (!indexes.length) return;
    const toDelete = new Set(indexes);
    setElements((prev) => prev.filter((_, idx) => !toDelete.has(idx)));
    setSelectedElementIndex(null);
    setSelectedElementIndexes([]);
    setSaveState("Unsaved");
  };

  const clearDrawings = () => {
    setElements((prev) => prev.filter((item) => !isDrawingType(item.type)));
    setSelectedElementIndex(null);
    setSelectedElementIndexes([]);
    setSaveState("Unsaved");
  };

  const undoLastElement = () => {
    setElements((prev) => prev.slice(0, -1));
    setSelectedElementIndex(null);
    setSelectedElementIndexes([]);
    setSaveState("Unsaved");
  };

  const clearPlayerAssignmentForSelectedElement = () => {
    if (selectedElementIndex === null) return;

    setElements((prev) =>
      prev.map((item, idx) => {
        if (idx !== selectedElementIndex) return item;
        const { playerId, name, number, ...rest } = item;
        return rest;
      })
    );
    setSaveState("Unsaved");
  };

  const dragElement = (e: React.PointerEvent<HTMLDivElement>, indexToDrag: number) => {
    e.preventDefault();
    e.stopPropagation();

    const pointerId = e.pointerId;
    selectElement(indexToDrag, e);
    isDraggingRef.current = true;
    skipNextPitchClickRef.current = true;
    setSaveState("Unsaved");

    const rect = pitchRef.current;
    const selectedGroup = selectedElementIndexes.includes(indexToDrag) && selectedElementIndexes.length > 1
      ? selectedElementIndexes
      : [indexToDrag];
    const startPoint = rect ? getPitchPoint(e, rect) : { x: 0, y: 0 };
    const startPositions = elements.map((item) => ({ x: Number(item.x ?? 50), y: Number(item.y ?? 50) }));
    if (rect) {
      const { x, y } = startPoint;
      setElements((prev) =>
        prev.map((item: TacticalBoardElement, idx: number) =>
          idx === indexToDrag ? { ...item, x, y } : item
        )
      );
    }

    const handleMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const pitch = pitchRef.current;
      if (!pitch) return;
      const { x, y } = getPitchPoint(ev, pitch);
      const dx = x - startPoint.x;
      const dy = y - startPoint.y;
      const clamp = (value: number) => Math.max(0, Math.min(100, value));

      setElements((prev) =>
        prev.map((item: TacticalBoardElement, idx: number) => {
          if (!selectedGroup.includes(idx)) return item;
          const origin = startPositions[idx] ?? { x, y };
          return { ...item, x: clamp(origin.x + dx), y: clamp(origin.y + dy) };
        })
      );
    };

    const handleUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      isDraggingRef.current = false;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  return (
    <div className="min-h-screen bg-[#0B1220] text-white flex flex-col">
      {/* HEADER */}
      <header className="h-16 border-b border-white/10 bg-[#0F172A]/90 backdrop-blur flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button className="p-2 rounded-xl hover:bg-white/10 transition">
            <ArrowLeft size={18} />
          </button>
          <div>
          <h1 className="text-lg font-semibold tracking-wide">Lavagna Tattica</h1>
          <p className="text-xs text-white/50">Allenamento / Match Plan</p>
          </div>
        </div>

        <div className="hidden md:flex flex-col items-center">
        <input
  value={boardTitle}
  onChange={(e) => setBoardTitle(e.target.value)}
  className="bg-transparent text-center text-sm md:text-base font-semibold outline-none"
/>
          <span className="text-xs text-white/40">Sessione / Allenamento</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFocusMode(!focusMode)}
            className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm"
          >
            <Maximize2 size={16} />
            Focus mode
          </button>
          <button className="p-2 rounded-xl hover:bg-white/10 transition">
            <Copy size={18} />
          </button>
          <button className="p-2 rounded-xl hover:bg-white/10 transition">
  <Share2 size={18} />
</button>

<button
  onClick={() => {
    setCurrentBoardId(null);
    setBoardIdInUrl(null);
    setBoardTitle("Nuova lavagna");
    setSelectedPreset(null);
    setActiveTool("player");
    setFocusMode(false);
    setElements([]);
    setSelectedElementIndex(null);
    setSaveState("New");
    const params = new URLSearchParams(window.location.search);
    const nextTeamId = parseNumericId(params.get("teamId"));
    setBoardTeamId(nextTeamId);
    setBoardMode(nextTeamId ? "assigned" : "free");
    const nextTeam = (allTeams || []).find((t: any) => parseNumericId(t.id) === nextTeamId);
    const nextCategory = nextTeam?.category ?? null;
    setBoardCategory(nextCategory);
    setBoardFormat(deriveFormatFromCategory(nextCategory));
    setBoardClubId(parseNumericId((club as any)?.id));

    console.log("🆕 Nuova board");
  }}
  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-sm hover:bg-white/20 transition"
>
  Nuova
</button>

<button
  onClick={async () => {      
    setSaveState("Saving...");

    const data: TacticalBoardData = {
      teamId: boardMode === "assigned" ? boardTeamId : null,
      clubId: boardClubId,
      category: boardCategory,
      format: boardFormat,
      preset: selectedPreset,
      activeTool,
      focusMode,
      arrowToolPreset,
      elements: elements,
      // Present already in backend blob usage and safe to keep:
      updatedAt: new Date().toISOString(),
      notes: "Board salvata dalla quick page",
    };

    const boardPayload = {
      title: boardTitle,
      data,
    };

    try {
      const url = currentBoardId
      ? withApi(`/api/boards/${currentBoardId}`)
      : withApi("/api/boards");
    
    const method = currentBoardId ? "PUT" : "POST";
    
    console.log(`[tactical-board] request ${method} ${url}`);
    const response = await fetch(url, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(boardPayload),
    });
    console.log(`[tactical-board] response ${method} ${url} ->`, response.status);

      if (!response.ok) {
        throw new Error("Errore salvataggio");
      }

      const savedBoard = await response.json();
      const savedBoardId = parseNumericId(savedBoard?.id);
      setCurrentBoardId(savedBoardId);
      setBoardIdInUrl(savedBoardId);
      
      console.log("✅ Board salvata:", savedBoard);
      
      await loadBoards();
      setSaveState("Saved");  
    } catch (error) {
      console.error("❌ Errore salvataggio board:", error);
      setSaveState("Error");
    }
  }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FACC15] text-black font-medium hover:opacity-90 transition"
          >
            <Save size={16} />
            Salva
          </button>
        </div>
      </header>
      {boardsError && (
        <div className="px-4 md:px-6 py-2 text-sm bg-red-50 text-red-700 border-b border-red-200">
          {boardsError}
        </div>
      )}

      {/* MAIN */}
      <div className="flex flex-1 overflow-hidden">
        {/* CENTER AREA */}
        <main className="flex-1 flex flex-col bg-[#0B1220]">
          {/* CANVAS TOP BAR */}
          <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-white/10 bg-[#0B1220]">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedPreset ?? ""}
                onChange={(e) => applyPreset(e.target.value)}
                className="rounded-xl border border-white/10 bg-[#111827] px-3 py-2 text-sm text-white outline-none"
              >
                <option className="bg-[#111827] text-white" value="">Scegli modulo</option>
                {formationPresetOptions.map((formation) => (
                  <option className="bg-[#111827] text-white" key={formation} value={formation}>{formation}</option>
                ))}
              </select>
              <select className="rounded-xl border border-white/10 bg-[#111827] px-3 py-2 text-sm text-white outline-none">
                <option className="bg-[#111827] text-white">Campo intero</option>
                <option className="bg-[#111827] text-white">Meta campo</option>
                <option className="bg-[#111827] text-white">Ultimo terzo</option>
                <option className="bg-[#111827] text-white">Palla inattiva</option>
              </select>
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setArrowMenuOpen(false);
                    setFreeMenuOpen((v) => !v);
                  }}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                    boardMode === "free" || freeMenuOpen
                      ? "border-[#FACC15] bg-[#FACC15] text-black"
                      : "border-white/10 bg-white/5 text-white/85 hover:bg-white/10"
                  }`}
                >
                  Lavora libero
                  <ChevronDown size={14} className="opacity-75" />
                </button>
                {freeMenuOpen && (
                  <div
                    className="absolute left-0 top-full mt-2 z-50 min-w-[210px] rounded-xl border border-white/10 bg-[#0F172A] p-2 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {[
                      { label: "Lavora libero a 11", format: "11v11" as TacticalBoardFormat },
                      { label: "Lavora libero a 9", format: "9v9" as TacticalBoardFormat },
                      { label: "Lavora libero a 7", format: "7v7" as TacticalBoardFormat },
                      { label: "Lavora libero a 5", format: "5v5" as TacticalBoardFormat },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => workFree(opt.format)}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
                      >
                        <span>{opt.label}</span>
                        <span className="text-xs text-white/60">{opt.format}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <select
                value={boardMode === "assigned" && boardTeamId ? String(boardTeamId) : ""}
                onChange={(e) => loadTeamById(e.target.value)}
                className={`rounded-xl border px-3 py-2 text-sm outline-none transition ${
                  boardMode === "assigned"
                    ? "border-[#FACC15] bg-[#FACC15] text-black font-semibold"
                    : "border-white/10 bg-[#111827] text-white"
                }`}
              >
                <option className="bg-[#111827] text-white" value="">Carica squadra</option>
                {assignedTeams.map((team: any) => (
                  <option className="bg-[#111827] text-white" key={team.id} value={String(team.id)}>
                    {team.name ?? team.displayName ?? `Squadra ${team.id}`}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setActiveTool("select")}
                className={`hidden md:flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  activeTool === "select" ? "border-[#FACC15] bg-[#FACC15] text-black" : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10"
                }`}
              >
                <MousePointer2 size={15} />
                Seleziona
              </button>
              <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white/70">
                <span className="font-semibold text-white">Strumento</span>
                <span>{activeToolLabelMap[activeTool] ?? activeTool}</span>
              </div>
              <div className="hidden lg:flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
                <span className="font-semibold text-white">Modulo</span>
                <span>{moduleLabel}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={undoLastElement}
                  disabled={!elements.length}
                  title="Indietro"
                  className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/75 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <RotateCcw size={16} />
                </button>
                <button
                  type="button"
                  onClick={deleteSelectedElements}
                  disabled={!selectedElementIndexes.length && selectedElementIndex === null}
                  title="Elimina selezione"
                  className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/75 transition hover:bg-red-500/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  type="button"
                  onClick={clearDrawings}
                  disabled={!elements.some((item) => isDrawingType(item.type))}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/75 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Pulisci disegni
                </button>
              </div>
            </div>
            <div className="text-xs text-emerald-400 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">{saveStateLabelMap[saveState] ?? saveState}</div>
          </div>

          {/* MOBILE PRESETS */}
          <div className="lg:hidden px-4 py-3 border-b border-white/10 overflow-x-auto">
            <div className="flex gap-2 w-max">
              {presets.map((preset) => (
                <button
                  key={preset}
                  onClick={() => applyPreset(preset)}
                  className={`px-3 py-2 rounded-full text-sm whitespace-nowrap ${
                    selectedPreset === preset
                      ? "bg-[#FACC15] text-black font-medium"
                      : "bg-white/5 text-white"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* CANVAS */}
          <div className="relative flex-1 overflow-auto px-3 py-4 sm:px-4 md:py-5">
            <div className="grid w-full grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
              <div className="min-w-0 flex-1">
            <div className="mb-3 flex w-full flex-wrap items-center justify-between gap-2 text-xs text-white/60">
              <div className="font-medium text-white/75">
                Tavola metrica: {pitchMeasurement.canvasLength}m x {pitchMeasurement.canvasWidth}m
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span>
                  Campo: {pitchMeasurement.length}m x {pitchMeasurement.width}m · griglia {pitchMeasurement.gridStep}m
                </span>
                <button
                  type="button"
                  onClick={() => setShowMetricGrid((value) => !value)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                    showMetricGrid
                      ? "border-[#FACC15] bg-[#FACC15] text-black"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  Griglia
                </button>
                <button
                  type="button"
                  onClick={() => setShowFieldMarkings((value) => !value)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                    showFieldMarkings
                      ? "border-[#FACC15] bg-[#FACC15] text-black"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  Linee
                </button>
              </div>
            </div>
            <div
              className="relative h-auto w-full rounded-[22px] sm:rounded-[26px] lg:rounded-[30px] overflow-hidden border border-white/10 shadow-2xl bg-gradient-to-b from-[#19603A] via-[#165A37] to-[#11462C]"
              style={{
                aspectRatio: `${pitchMeasurement.canvasLength} / ${pitchMeasurement.canvasWidth}`,
                maxWidth: "100%",
              }}
              ref={pitchRef}
              onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => {
                if (e.target !== e.currentTarget) return;
                if (!["draw", "movement", "zones"].includes(activeTool)) return;

                const pitch = pitchRef.current;
                if (!pitch) return;
                e.preventDefault();

                const start = getPitchPoint(e, pitch);
                const nextType = activeTool === "movement" ? "arrow" : activeTool === "zones" ? "zone" : "path";
                const draftIndex = elements.length;
                const ap = arrowToolPreset;
                const draftElement: TacticalBoardElement = {
                  type: nextType,
                  points: [start, start],
                  color: "#FACC15",
                  lineWidth: activeTool === "zones" ? 1.4 : 1.8,
                  drawShape:
                    activeTool === "movement"
                      ? buildArrowDrawShape(ap)
                      : activeTool === "zones"
                        ? "rect-outline"
                        : "freehand-solid",
                  arrowHeads: activeTool === "movement" ? ap.heads : undefined,
                  arrowEnd:
                    activeTool === "movement" && (ap.heads === "end" || ap.heads === "both")
                      ? "end"
                      : activeTool === "movement"
                        ? "none"
                        : "none",
                };

                setElements((prev) => [...prev, draftElement]);
                setSelectedElementIndex(draftIndex);
                setSaveState("Unsaved");

                const pointerId = e.pointerId;
                const handleMove = (ev: PointerEvent) => {
                  if (ev.pointerId !== pointerId) return;
                  const currentPitch = pitchRef.current;
                  if (!currentPitch) return;
                  const point = getPitchPoint(ev, currentPitch);
                  setElements((prev) =>
                    prev.map((item, idx) => {
                      if (idx !== draftIndex) return item;
                      const points = Array.isArray(item.points) ? item.points as Array<{ x: number; y: number }> : [start];
                      if (nextType === "zone") return { ...item, points: [start, point] };
                      if (nextType === "arrow" && ap.geometry === "straight") {
                        return { ...item, points: [start, point] };
                      }
                      const last = points[points.length - 1];
                      const movedEnough = !last || Math.hypot(point.x - last.x, point.y - last.y) > 0.8;
                      return movedEnough ? { ...item, points: [...points, point] } : item;
                    })
                  );
                };

                const handleUp = (ev: PointerEvent) => {
                  if (ev.pointerId !== pointerId) return;
                  window.removeEventListener("pointermove", handleMove);
                  window.removeEventListener("pointerup", handleUp);
                };

                window.addEventListener("pointermove", handleMove);
                window.addEventListener("pointerup", handleUp);
              }}
              onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                // Evita di creare nuovi elementi quando clicchi sopra un marker esistente.
                if (skipNextPitchClickRef.current) {
                  skipNextPitchClickRef.current = false;
                  setSelectedElementIndex(null);
                  setSelectedElementIndexes([]);
                  return;
                }
                if (isDraggingRef.current) return;
                if (e.target !== e.currentTarget) return;

                setSelectedElementIndex(null);
                setSelectedElementIndexes([]);

                const rect = e.currentTarget.getBoundingClientRect();
                const xPct = ((e.clientX - rect.left) / rect.width) * 100;
                const yPct = ((e.clientY - rect.top) / rect.height) * 100;

                const clamp = (v: number) => Math.max(0, Math.min(100, v));
                const x = clamp(xPct);
                const y = clamp(yPct);

                if (activeTool !== "player" && activeTool !== "opponent" && activeTool !== "goalkeeper" && !isEquipmentType(activeTool)) {
                  return;
                }

                const nextType = activeTool;
                const nextPlayer = isPlayerType(nextType) ? getNextAvailableRosterPlayer(nextType) : null;
                const usedPlayerCount = elements.filter((item) => isPlayerType(item.type) && item.playerId).length;
                const newElement: TacticalBoardElement = {
                  type: nextType,
                  x,
                  y,
                  label: activeTool === "text" ? "T" : undefined,
                  ...(nextPlayer ? buildPlayerAssignment(nextPlayer) : {}),
                  ...(nextPlayer && selectedPreset && isFormationPresetId(selectedPreset) && usedPlayerCount >= FORMATIONS[selectedPreset].slots.length
                    ? { rosterStatus: "extra" }
                    : {}),
                };

                setElements((prev) => [...prev, newElement]);
                if (nextPlayer && pendingRosterPlayerId === nextPlayer.id) setPendingRosterPlayerId(null);
                setSaveState("Unsaved");
              }}
            >
              <div className="hidden">
                <div>
                  <div className="text-sm font-semibold">{boardTitle}</div>
                  <div className="text-xs text-white/50">{boardType} · {boardFormat} · {selectedPreset ?? "Lavagna libera"}</div>
                </div>
                <div className="hidden md:flex items-center gap-2">
                  {BOARD_TAGS.map((tag) => (
                    <span key={tag} className="px-3 py-1 rounded-full bg-white/10 text-[11px] font-medium text-white/80">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),transparent_45%)]" />
              <MetricFieldOverlay
                spec={pitchMeasurement}
                showGrid={showMetricGrid}
                showFieldMarkings={showFieldMarkings}
              />

              {/* Dynamic tactical drawings */}
              <svg className="pointer-events-none absolute inset-0 z-[3] h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <marker id="dynamicArrowYellow" markerWidth="3.2" markerHeight="3.2" refX="2.8" refY="1.6" orient="auto">
                    <path d="M0,0 L0,3.2 L3.2,1.6 z" fill="#FACC15" />
                  </marker>
                  <marker
                    id="dynamicArrowYellowStart"
                    markerWidth="3.2"
                    markerHeight="3.2"
                    refX="2.8"
                    refY="1.6"
                    orient="auto-start-reverse"
                  >
                    <path d="M0,0 L0,3.2 L3.2,1.6 z" fill="#FACC15" />
                  </marker>
                </defs>
                {elements.map((el: TacticalBoardElement, i: number) => {
                  if (!isDrawingType(el.type)) return null;
                  const points = Array.isArray(el.points) ? el.points as Array<{ x: number; y: number }> : [];
                  if (points.length < 2) return null;
                  const color = String(el.color ?? "#FACC15");
                  const width = Math.max(0.8, Math.min(Number(el.lineWidth ?? 1.8), 2.2));
                  const selected = selectedElementIndex === i;

                  if (el.type === "zone") {
                    const [a, b] = points;
                    const x = Math.min(a.x, b.x);
                    const y = Math.min(a.y, b.y);
                    const w = Math.abs(a.x - b.x);
                    const h = Math.abs(a.y - b.y);
                    return (
                      <rect
                        key={`draw-${i}`}
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        rx="1.5"
                        fill="rgba(250,204,21,0.14)"
                        stroke={color}
                        strokeWidth={selected ? width * 0.24 : width * 0.18}
                        strokeDasharray={String(el.drawShape ?? "").includes("dashed") ? "2 1.6" : undefined}
                      />
                    );
                  }

                  const heads = resolveArrowHeads(el);
                  const tipLen = polylineLength(points);
                  const showTips = tipLen > 1.5;
                  const markerEndUrl =
                    showTips && (heads === "end" || heads === "both") && (el.type === "arrow" || el.type === "bezierarrow")
                      ? "url(#dynamicArrowYellow)"
                      : undefined;
                  const markerStartUrl =
                    showTips && (heads === "start" || heads === "both") && (el.type === "arrow" || el.type === "bezierarrow")
                      ? "url(#dynamicArrowYellowStart)"
                      : undefined;

                  return (
                    <path
                      key={`draw-${i}`}
                      d={drawingPathData(el, points)}
                      fill="none"
                      stroke={color}
                      strokeWidth={selected ? width * 0.2 : width * 0.16}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={strokeDashForDrawing(el)}
                      markerStart={markerStartUrl}
                      markerEnd={markerEndUrl}
                      opacity={selected ? 1 : 0.96}
                    />
                  );
                })}
              </svg>

              {/* Elements */}
              {hasRenderableElements ? (
                elements.map((el: TacticalBoardElement, i: number) => {
                  if (!isPlayerType(el?.type) && !isEquipmentType(el?.type)) return null;

                  const commonStyle = {
                    left: `${el.x ?? 50}%`,
                    top: `${el.y ?? 50}%`,
                    transform: "translate(-50%, -50%)",
                  } as const;

                  const linkedPlayer = el.playerId
                    ? teamPlayers.find((p) => String(p.id) === String(el.playerId))
                    : null;
                  const fallbackTypeLabel = el.type === "goalkeeper" ? "GK" : "P";
                  const rawLabel = typeof el.label === "string" ? el.label.trim() : "";
                  const rawName = typeof el.name === "string" ? el.name.trim() : "";
                  const rawDisplayName = typeof (el as { displayName?: unknown }).displayName === "string"
                    ? String((el as { displayName?: string }).displayName).trim()
                    : "";
                  const toNumeric = (value: unknown): number | null => {
                    if (typeof value === "number" && Number.isFinite(value)) return value;
                    if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
                    return null;
                  };
                  const numberFromNumber = toNumeric(el.number);
                  const numberFromPlayerNumber = toNumeric(el.playerNumber);
                  const numberFromLabel = toNumeric(rawLabel);
                  const nameCandidates = [
                    rawDisplayName,
                    rawName,
                    typeof el.number === "string" && !/^\d+$/.test(el.number.trim()) ? el.number.trim() : "",
                    typeof el.playerNumber === "string" && !/^\d+$/.test(el.playerNumber.trim()) ? el.playerNumber.trim() : "",
                    rawLabel && !/^\d+$/.test(rawLabel) ? rawLabel : "",
                  ].filter(Boolean);
                  const markerNumber = el.playerId
                    ? (numberFromNumber ?? linkedPlayer?.jerseyNumber ?? null)
                    : (numberFromPlayerNumber ?? numberFromLabel ?? null);
                  const content = markerNumber ?? (el.type === "goalkeeper" ? "GK" : i + 1);
                  const playerSurname = el.playerId
                    ? String(el.displayName ?? formatRosterLastName(linkedPlayer) ?? nameCandidates[0] ?? "")
                    : String(nameCandidates[0] ?? "");

                  const isSelected = selectedElementIndex === i || selectedElementIndexes.includes(i);

                  const playerClassName =
                    el.type === "player"
                      ? `absolute z-[5] flex h-8 w-8 cursor-grab touch-none select-none items-center justify-center rounded-full ${el.rosterStatus === "extra" ? "bg-emerald-500" : "bg-[#2f9cf4]"} text-xs font-bold text-white shadow-lg border-2 border-white/80 active:cursor-grabbing${isSelected ? " ring-2 ring-[#FACC15] z-10" : ""}`
                      : el.type === "opponent"
                      ? `absolute z-[5] flex h-8 w-8 cursor-grab touch-none select-none items-center justify-center rounded-full bg-[#ef4444] text-xs font-bold text-white shadow-lg border-2 border-white/80 active:cursor-grabbing${isSelected ? " ring-2 ring-[#FACC15] z-10" : ""}`
                      : `absolute z-[5] flex h-8 w-8 cursor-grab touch-none select-none items-center justify-center rounded-full bg-[#facc15] text-xs font-bold text-black shadow-lg border-2 border-white/80 active:cursor-grabbing${isSelected ? " ring-2 ring-[#FACC15] z-10" : ""}`;

                  if (isEquipmentType(el.type)) {
                    return (
                      <div
                        key={String(el.id ?? `el-${i}`)}
                        className={`absolute z-[4] flex cursor-grab touch-none select-none items-center justify-center rounded-2xl p-1 transition active:cursor-grabbing ${isSelected ? "ring-2 ring-[#FACC15] ring-offset-2 ring-offset-[#145f38]" : ""}`}
                        style={commonStyle}
                        onPointerDown={(e) => dragElement(e, i)}
                        title={String(el.type)}
                      >
                        <EquipmentGlyph type={el.type} />
                      </div>
                    );
                  }

                  return (
                    <div key={String(el.id ?? `el-${i}`)}>
                      <div
                        className={playerClassName}
                        style={commonStyle}
                        onPointerDown={(e) => dragElement(e, i)}
                      >
                        {content}
                      </div>
                      {playerSurname && (
                        <div
                          className="pointer-events-none absolute z-[6] max-w-28 truncate px-0.5 text-center text-[12px] font-semibold leading-none text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]"
                          style={{ left: `${el.x ?? 50}%`, top: `calc(${el.y ?? 50}% + 22px)`, transform: "translateX(-50%)" }}
                        >
                          {playerSurname}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/60 text-sm bg-white/5 border border-white/10 px-3 py-2 rounded-xl pointer-events-none">
                  Nessun elemento nella board
                </div>
              )}

              {/* Delete selected element */}
              {selectedElementIndex !== null && (
                <div className={`absolute right-4 top-4 z-20 flex gap-2 ${canAssignRealPlayer ? "w-64 flex-col" : "rounded-2xl border border-white/10 bg-[#1f2937]/95 p-2 shadow-2xl backdrop-blur"}`}>
                  {canAssignRealPlayer && (
                    <div className="rounded-xl border border-white/20 bg-[#0F172A]/95 p-3 shadow-lg">
                      <div className="text-xs text-white/70 mb-2">Assegna giocatore reale</div>
                      <Select
                        value={selectedElement?.playerId ? String(selectedElement.playerId) : "_none"}
                        onValueChange={(value) => {
                          if (value === "_none") {
                            clearPlayerAssignmentForSelectedElement();
                            return;
                          }
                          assignPlayerToSelectedElement(value);
                        }}
                      >
                        <SelectTrigger className="h-9 bg-white/5 border-white/20 text-white">
                          <SelectValue placeholder="Seleziona giocatore" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Marker generico (nessun player)</SelectItem>
                          {teamPlayers.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {`${p.jerseyNumber ?? "-"} · ${p.firstName} ${p.lastName}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <button
                    type="button"
                    className={`${canAssignRealPlayer ? "px-3 py-2" : "h-10 px-4"} rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold shadow-lg`}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSelectedElements();
                    }}
                  >
                    Elimina
                  </button>
                </div>
              )}

            </div>

              </div>
              <aside className="w-full shrink-0 rounded-2xl border border-white/10 bg-[#08142b]/90 px-3 py-3 shadow-xl backdrop-blur-md sm:px-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
<div className="mb-4 grid grid-cols-2 gap-2">
                  {boardActionTools.map((tool) => (
                    <button
                      key={`board-action-${tool}`}
                      type="button"
                      className="min-h-10 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-xs font-semibold text-white/80 transition hover:bg-white/10"
                    >
                      {tool}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-white/60">
                    <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                    Modifica lavagna live
                  </div>
                  <div className="grid w-full grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => setBottomMenu("players")}
                      className={`px-2 py-2 rounded-xl text-[11px] font-medium transition ${
                        bottomMenu === "players" ? "bg-[#FACC15] text-black" : "bg-white/10 text-white/80 hover:bg-white/15"
                      }`}
                    >
                      Giocatori
                    </button>
                    <button
                      type="button"
                      onClick={() => setBottomMenu("equipment")}
                      className={`px-2 py-2 rounded-xl text-[11px] font-medium transition ${
                        bottomMenu === "equipment" ? "bg-[#FACC15] text-black" : "bg-white/10 text-white/80 hover:bg-white/15"
                      }`}
                    >
                      Attrezzatura
                    </button>
                    <button
                      type="button"
                      onClick={() => setBottomMenu("library")}
                      className={`px-2 py-2 rounded-xl text-[11px] font-medium transition ${
                        bottomMenu === "library" ? "bg-[#FACC15] text-black" : "bg-white/10 text-white/80 hover:bg-white/15"
                      }`}
                    >
                      Libreria
                    </button>
                  </div>
                </div>

                {bottomMenu === "players" && (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {tacticalToolButtons.map((tool) =>
                        tool.id === "movement" ? (
                          <div key="tactical-tool-movement" ref={movementToolShellRef} className="relative z-[60]">
                            <div
                              className={`flex min-h-[2.5rem] w-full overflow-hidden rounded-xl border text-xs font-semibold transition ${
                                activeTool === "movement" || arrowMenuOpen
                                  ? "border-[#FACC15] bg-[#FACC15] text-black"
                                  : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                              }`}
                            >
                              <button
                                type="button"
                                className="flex flex-1 items-center justify-center px-2 py-2"
                                onClick={() => setActiveTool("movement")}
                              >
                                {tool.label}
                              </button>
                              <button
                                type="button"
                                className={`flex shrink-0 items-center justify-center border-l px-1.5 ${
                                  activeTool === "movement" || arrowMenuOpen
                                    ? "border-black/15 bg-black/10 text-black hover:bg-black/15"
                                    : "border-white/10 bg-white/5 text-white/90 hover:bg-white/10"
                                }`}
                                aria-label="Opzioni freccia"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFreeMenuOpen(false);
                                  setArrowMenuOpen((v) => !v);
                                }}
                              >
                                <ChevronDown size={14} />
                              </button>
                            </div>
                            {arrowMenuOpen &&
                              arrowMenuViewport &&
                              createPortal(
                                <div
                                  className="fixed z-[10000] max-h-[min(70vh,420px)] overflow-y-auto rounded-xl border border-white/10 bg-[#0F172A] p-2 shadow-2xl"
                                  style={{
                                    top: arrowMenuViewport.top,
                                    left: arrowMenuViewport.left,
                                    width: arrowMenuViewport.width,
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ArrowToolPresetMenuContent
                                    arrowToolPreset={arrowToolPreset}
                                    setArrowToolPreset={setArrowToolPreset}
                                  />
                                </div>,
                                document.body
                              )}
                          </div>
                        ) : (
                          <button
                            key={`tactical-tool-${tool.id}`}
                            type="button"
                            onClick={() => setActiveTool(tool.id)}
                            className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                              activeTool === tool.id
                                ? "border-[#FACC15] bg-[#FACC15] text-black"
                                : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                            }`}
                          >
                            {tool.label}
                          </button>
                        )
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {playerTools.map((tool) => (
                        <button
                          key={`bottom-player-${tool.id}`}
                          type="button"
                          title={tool.label}
                          onClick={() => setActiveTool(tool.id)}
                          className={`flex h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border px-2 transition ${
                            activeTool === tool.id
                              ? "border-[#FACC15] bg-[#FACC15]/20"
                              : "border-white/10 bg-white/5 hover:bg-white/10"
                          }`}
                        >
                          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold ${tool.accentClass}`}>
                            {tool.id === "goalkeeper" ? "GK" : "P"}
                          </span>
                          <span className="text-[11px] text-white/80">{tool.label}</span>
                        </button>
                      ))}
                    </div>
                    {boardMode === "assigned" && teamPlayers.length > 0 && (
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-2">
                        <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-white/55">
                          <span>Rosa caricata</span>
                          <span>{elements.filter((item) => item.playerId).length}/{teamPlayers.length}</span>
                        </div>
                        <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto pr-1">
                          {teamPlayers.map((player) => {
                            const inBoard = usedPlayerIds.has(String(player.id));
                            const isPending = pendingRosterPlayerId === player.id;
                            const isUnavailable = !isPlayerAvailable(player);
                            return (
                              <button
                                key={player.id}
                                type="button"
                                disabled={isUnavailable}
                                onClick={() => {
                                  setPendingRosterPlayerId(player.id);
                                  setActiveTool(String(player.position ?? "").toLowerCase().includes("port") ? "goalkeeper" : "player");
                                }}
                                className={`rounded-xl border px-2 py-2 text-left transition ${
                                  isUnavailable
                                    ? "border-red-400/45 bg-red-500/20 text-red-100"
                                    : isPending
                                    ? "border-[#FACC15] bg-[#FACC15] text-black"
                                    : inBoard
                                    ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
                                    : "border-white/10 bg-[#0F172A] text-white/80 hover:bg-white/10"
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                    isUnavailable
                                      ? "bg-red-500 text-white"
                                      : inBoard
                                      ? "bg-emerald-500 text-white"
                                      : "bg-[#2f9cf4] text-white"
                                  }`}>
                                    {player.jerseyNumber ?? "-"}
                                  </span>
                                  <span className="min-w-0 truncate text-[11px] font-semibold">{formatRosterLastName(player)}</span>
                                </div>
                                <div className="mt-1 text-[10px] opacity-70">
                                  {isUnavailable ? "Non disponibile" : inBoard ? "In campo" : "Disponibile"}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {bottomMenu === "equipment" && (
                  <div className="mt-3 grid grid-cols-5 gap-2">
                    {equipmentTools.map((tool) => (
                      <button
                        key={`bottom-equipment-${tool.id}`}
                        type="button"
                        title={tool.label}
                        onClick={() => setActiveTool(tool.id)}
                        className={`flex h-12 items-center justify-center rounded-2xl border transition ${
                          activeTool === tool.id
                            ? "border-[#FACC15] bg-[#FACC15]/20"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <EquipmentGlyph type={tool.id} />
                      </button>
                    ))}
                  </div>
                )}

                {bottomMenu === "library" && (
                  <div className="mt-3 space-y-3 pr-1">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/5 border border-white/10">
                      <Search size={16} className="text-white/50" />
                      <input
                        value={librarySearch}
                        onChange={(e) => setLibrarySearch(e.target.value)}
                        placeholder="Cerca moduli, lavagne, cartelle..."
                        className="bg-transparent outline-none text-sm w-full placeholder:text-white/40"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {filteredBoards.slice(0, 4).map((board) => (
                        <button
                          key={`bottom-board-${board.id}`}
                          onClick={() => applyBoardState(board)}
                          className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs"
                        >
                          {board.title}
                        </button>
                      ))}
                      {filteredBoards.length === 0 && (
                        <span className="text-xs text-white/40">Nessuna lavagna trovata</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {filteredPresets.map((preset) => (
                        <button
                          key={`bottom-preset-${preset}`}
                          onClick={() => applyPreset(preset)}
                          className={`px-3 py-2 rounded-full text-xs transition ${
                            selectedPreset === preset
                              ? "bg-[#FACC15] text-black font-medium"
                              : "bg-white/10 text-white hover:bg-white/15"
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {filteredFolders.map((folder) => (
                        <button
                          key={`bottom-folder-${folder}`}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs"
                        >
                          <Folder size={14} />
                          {folder}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </aside>
            </div>
          </div>
        </main>

        {/* RIGHT SIDEBAR */}
        {showRightSidebar && !focusMode && rightOpen && (
          <aside className="hidden xl:flex w-80 border-l border-white/10 bg-[#0F172A] flex-col p-4 gap-5 overflow-y-auto">
            <div>
              <h3 className="text-xs uppercase tracking-widest text-white/40 mb-3">
                Dettagli lavagna
              </h3>
              <div className="space-y-3">
                <input
                  value={boardTitle}
                  onChange={(e) => setBoardTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none"
                />
                <select
                  value={boardType}
                  onChange={(e) => setBoardType(e.target.value as (typeof BOARD_TYPES)[number])}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm"
                >
                  {BOARD_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <select
                  value={selectedPreset ?? ""}
                  onChange={(e) => applyPreset(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm"
                >
                  <option value="">Nessun preset formazione</option>
                  {Object.keys(FORMATIONS).map((formation) => (
                    <option key={formation} value={formation}>{formation}</option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-2">
                  {BOARD_TAGS.map((tag) => (
                    <span key={tag} className="px-3 py-1 rounded-full bg-white/10 text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-widest text-white/40 mb-3">
                Ispezione selezione
              </h3>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                {selectedElement ? (
                  <>
                    <div>
                      <div className="text-sm font-semibold">{selectedElementLabel}</div>
                      <div className="text-xs text-white/50 mt-1">
                        {selectedElementMeta.join(" · ")}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-widest text-white/40">Tipo</div>
                        <div className="mt-1 text-sm">{selectedElement.type}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-widest text-white/40">Posizione</div>
                        <div className="mt-1 text-sm">
                          {selectedElement.x != null && selectedElement.y != null
                            ? `${Math.round(selectedElement.x)}% / ${Math.round(selectedElement.y)}%`
                            : "n.d."}
                        </div>
                      </div>
                    </div>
                    {canAssignRealPlayer && (
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                        <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Assegnazione</div>
                        <div className="text-sm text-white/80">
                          {selectedElement.playerId ? selectedElementLabel : "Marcatore tattico generico"}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-white/55">
                    Seleziona un elemento sul campo per modificarne i dettagli qui.
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-widest text-white/40 mb-3">
                Note testuali
              </h3>
              <textarea
                rows={5}
                value={boardNotes}
                onChange={(e) => setBoardNotes(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-3 py-3 text-sm outline-none resize-none"
              />
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-widest text-white/40 mb-3">
                Audio
              </h3>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Nota vocale</span>
                  <span className="text-xs text-white/50">00:24</span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-3 rounded-xl bg-[#FACC15] text-black">
                    <Play size={16} />
                  </button>
                  <button className="px-3 py-2 rounded-xl bg-white/10 text-sm">Registra</button>
                  <button className="px-3 py-2 rounded-xl bg-white/10 text-sm">Sostituisci</button>
                  <button className="px-3 py-2 rounded-xl bg-white/10 text-sm">Elimina</button>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-widest text-white/40 mb-3">
                Video
              </h3>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="h-32 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-white/40 text-sm">
                  Anteprima video
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[#FACC15] text-black text-sm font-medium">
                    <Video size={16} />
                    Registra
                  </button>
                  <button className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/10 text-sm">
                    <Upload size={16} />
                    Carica
                  </button>
                  <button className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/10 text-sm">
                    <Play size={16} />
                    Riproduci
                  </button>
                  <button className="px-3 py-2 rounded-xl bg-white/10 text-sm">Sostituisci</button>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export default QuickPage;
