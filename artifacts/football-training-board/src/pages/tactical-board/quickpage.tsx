import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useListTeams } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  Save,
  Copy,
  Share2,
  Search,
  ChevronLeft,
  Mic,
  Video,
  MoreHorizontal,
  Play,
  Upload,
  Folder,
  Maximize2,
} from "lucide-react";
import { withApi } from "@/lib/api-base";
import { FORMATIONS, isFormationPresetId } from "./formations";
import type { TacticalBoardData, TacticalBoardElement, TacticalBoardFormat } from "./board-types";
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
  cornerRadius: number;
}> = {
  "3v3": { canvasLength: 110, canvasWidth: 75, length: 25, width: 15, gridStep: 10, centerCircleRadius: 3, penaltyAreaDepth: 0, penaltyAreaWidth: 0, goalAreaDepth: 0, goalAreaWidth: 0, penaltySpotDistance: 0, goalWidth: 3, cornerRadius: 1 },
  "5v5": { canvasLength: 110, canvasWidth: 75, length: 40, width: 25, gridStep: 10, centerCircleRadius: 4, penaltyAreaDepth: 6, penaltyAreaWidth: 15, goalAreaDepth: 0, goalAreaWidth: 0, penaltySpotDistance: 6, goalWidth: 3, cornerRadius: 1 },
  "7v7": { canvasLength: 110, canvasWidth: 75, length: 65, width: 45, gridStep: 10, centerCircleRadius: 6, penaltyAreaDepth: 13, penaltyAreaWidth: 26, goalAreaDepth: 4, goalAreaWidth: 14, penaltySpotDistance: 9, goalWidth: 5, cornerRadius: 1 },
  "9v9": { canvasLength: 110, canvasWidth: 75, length: 72, width: 50, gridStep: 10, centerCircleRadius: 6, penaltyAreaDepth: 13, penaltyAreaWidth: 30, goalAreaDepth: 4.5, goalAreaWidth: 16, penaltySpotDistance: 9, goalWidth: 6, cornerRadius: 1 },
  "11v11": { canvasLength: 110, canvasWidth: 75, length: 110, width: 75, gridStep: 10, centerCircleRadius: 9.15, penaltyAreaDepth: 16.5, penaltyAreaWidth: 40.32, goalAreaDepth: 5.5, goalAreaWidth: 18.32, penaltySpotDistance: 11, goalWidth: 7.32, cornerRadius: 1 },
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

function MetricFieldOverlay({
  spec,
  showGrid,
  showFieldMarkings,
}: {
  spec: (typeof FIELD_MEASUREMENTS)[TacticalBoardFormat];
  showGrid: boolean;
  showFieldMarkings: boolean;
}) {
  const verticalLines = Array.from({ length: Math.floor(spec.canvasLength / spec.gridStep) }, (_, i) => (i + 1) * spec.gridStep).filter((x) => x < spec.canvasLength);
  const penaltyTop = (spec.width - spec.penaltyAreaWidth) / 2;
  const goalAreaTop = (spec.width - spec.goalAreaWidth) / 2;
  const goalTop = (spec.width - spec.goalWidth) / 2;
  const showPenaltyArea = spec.penaltyAreaDepth > 0 && spec.penaltyAreaWidth > 0;
  const showGoalArea = spec.goalAreaDepth > 0 && spec.goalAreaWidth > 0;
  const showPenaltySpot = spec.penaltySpotDistance > 0;
  const fieldOriginX = (spec.canvasLength - spec.length) / 2;
  const fieldOriginY = (spec.canvasWidth - spec.width) / 2;
  const fieldX = (meters: number) => fieldOriginX + meters;
  const fieldY = (meters: number) => fieldOriginY + meters;
  const centerX = fieldX(spec.length / 2);
  const centerY = fieldY(spec.width / 2);
  const centeredWidthLines = [10, 20, 30, 40, 50, 60, 70]
    .map((label) => ({ label, y: centerY + (label - 40) }))
    .filter((line) => line.y > 0 && line.y < spec.canvasWidth);

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
              <path key={`grid-x-${x}`} d={`M ${x} 0 V ${spec.canvasWidth}`} stroke="white" strokeWidth="0.08" />
            ))}
            {centeredWidthLines.map(({ label, y }) => (
              <path key={`grid-y-${label}`} d={`M 0 ${y} H ${spec.canvasLength}`} stroke="white" strokeWidth="0.08" />
            ))}
          </g>
          <g opacity="0.5" fontSize="2.2" fill="white" fontWeight="600">
            {verticalLines.map((x) => (
              <text key={`label-x-${x}`} x={x} y="3.2" textAnchor="middle">{x}m</text>
            ))}
            {centeredWidthLines.map(({ label, y }) => (
              <text key={`label-y-${label}`} x="1.6" y={y + 0.7}>{label}m</text>
            ))}
          </g>
        </>
      )}
      <g fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" opacity="0.52">
        <rect x={fieldOriginX} y={fieldOriginY} width={spec.length} height={spec.width} rx="1.8" strokeWidth="0.22" />
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
            <path d={`M ${fieldOriginX} ${fieldOriginY + spec.cornerRadius} A ${spec.cornerRadius} ${spec.cornerRadius} 0 0 1 ${fieldOriginX + spec.cornerRadius} ${fieldOriginY}`} strokeWidth="0.16" />
            <path d={`M ${fieldOriginX + spec.length - spec.cornerRadius} ${fieldOriginY} A ${spec.cornerRadius} ${spec.cornerRadius} 0 0 1 ${fieldOriginX + spec.length} ${fieldOriginY + spec.cornerRadius}`} strokeWidth="0.16" />
            <path d={`M ${fieldOriginX} ${fieldOriginY + spec.width - spec.cornerRadius} A ${spec.cornerRadius} ${spec.cornerRadius} 0 0 0 ${fieldOriginX + spec.cornerRadius} ${fieldOriginY + spec.width}`} strokeWidth="0.16" />
            <path d={`M ${fieldOriginX + spec.length - spec.cornerRadius} ${fieldOriginY + spec.width} A ${spec.cornerRadius} ${spec.cornerRadius} 0 0 0 ${fieldOriginX + spec.length} ${fieldOriginY + spec.width - spec.cornerRadius}`} strokeWidth="0.16" />
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

  const [selectedElementIndex, setSelectedElementIndex] = useState<number | null>(null);

  
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
      setElements(data.elements ?? []);
      setSelectedElementIndex(null);
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
    // Fallback iniziale: non sovrascrive elementi già presenti (es. dopo rehydrate).
    setElements((prev) =>
      prev && prev.length
        ? prev
        : [
            { type: "player", x: 30, y: 50 },
            { type: "player", x: 60, y: 50 },
          ]
    );
  }, []);

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

  const workFree = () => {
    setBoardMode("free");
    setBoardTeamId(null);
    setBoardCategory(null);
    setBoardFormat("11v11");
    setTeamPlayers([]);
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

    setElements(
      formation.slots.map((slot) => ({
        type: slot.role,
        x: slot.x,
        y: slot.y,
      }))
    );
    setSelectedElementIndex(null);
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
  const saveStateLabelMap: Record<string, string> = {
    Saved: "Salvata",
    Unsaved: "Non salvata",
    Saving: "Salvataggio...",
    New: "Nuova",
    Error: "Errore",
  };
  const activeToolLabelMap: Record<string, string> = {
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

  const assignPlayerToSelectedElement = (playerIdRaw: string) => {
    if (selectedElementIndex === null) return;
    const player = teamPlayers.find((p) => String(p.id) === playerIdRaw);
    if (!player) return;

    setElements((prev) =>
      prev.map((item, idx) =>
        idx === selectedElementIndex
          ? {
              ...item,
              playerId: String(player.id),
              name: `${player.firstName} ${player.lastName}`.trim(),
              number: player.jerseyNumber ?? undefined,
            }
          : item
      )
    );
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
    setSelectedElementIndex(indexToDrag);
    isDraggingRef.current = true;
    skipNextPitchClickRef.current = true;
    setSaveState("Unsaved");

    const rect = pitchRef.current;
    if (rect) {
      const { x, y } = getPitchPoint(e, rect);
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

      setElements((prev) =>
        prev.map((item: TacticalBoardElement, idx: number) =>
          idx === indexToDrag ? { ...item, x, y } : item
        )
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
              <button
                type="button"
                onClick={workFree}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  boardMode === "free"
                    ? "border-[#FACC15] bg-[#FACC15] text-black"
                    : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                }`}
              >
                Lavora libero
              </button>
              <select
                value={boardMode === "assigned" && boardTeamId ? String(boardTeamId) : ""}
                onChange={(e) => loadTeamById(e.target.value)}
                className="rounded-xl border border-white/10 bg-[#111827] px-3 py-2 text-sm text-white outline-none"
              >
                <option className="bg-[#111827] text-white" value="">Carica squadra</option>
                {assignedTeams.map((team: any) => (
                  <option className="bg-[#111827] text-white" key={team.id} value={String(team.id)}>
                    {team.name ?? team.displayName ?? `Squadra ${team.id}`}
                  </option>
                ))}
              </select>
              <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white/70">
                <span className="font-semibold text-white">Strumento</span>
                <span>{activeToolLabelMap[activeTool] ?? activeTool}</span>
              </div>
              <div className="hidden lg:flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
                <span className="font-semibold text-white">Modulo</span>
                <span>{moduleLabel}</span>
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
                const draftElement: TacticalBoardElement = {
                  type: nextType,
                  points: [start, start],
                  color: "#FACC15",
                  lineWidth: activeTool === "zones" ? 1.4 : 1.8,
                  drawShape: activeTool === "movement" ? "freehand-arrow" : activeTool === "zones" ? "rect-outline" : "freehand-solid",
                  arrowEnd: activeTool === "movement" ? "end" : "none",
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
                  return;
                }
                if (isDraggingRef.current) return;
                if (e.target !== e.currentTarget) return;

                setSelectedElementIndex(null);

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

                const newElement = { type: nextType, x, y, label: activeTool === "text" ? "T" : undefined };

                setElements((prev) => [...prev, newElement]);
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

                  return (
                    <path
                      key={`draw-${i}`}
                      d={makeSmoothPath(points)}
                      fill="none"
                      stroke={color}
                      strokeWidth={selected ? width * 0.2 : width * 0.16}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={String(el.drawShape ?? "").includes("dashed") ? "2.3 1.6" : undefined}
                      markerEnd={el.type === "arrow" || el.type === "bezierarrow" || el.arrowEnd === "end" ? "url(#dynamicArrowYellow)" : undefined}
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
                  const content = el.playerId
                    ? (el.number ?? linkedPlayer?.jerseyNumber ?? fallbackTypeLabel)
                    : (el.playerNumber ?? el.label ?? i + 1);

                  const isSelected = selectedElementIndex === i;

                  const playerClassName =
                    el.type === "player"
                      ? `absolute z-[5] w-8 h-8 rounded-full bg-[#2f9cf4] text-white text-xs font-bold flex items-center justify-center shadow-lg border-2 border-white/80${isSelected ? " ring-2 ring-[#FACC15] z-10" : ""}`
                      : el.type === "opponent"
                      ? `absolute z-[5] w-8 h-8 rounded-full bg-[#ef4444] text-white text-xs font-bold flex items-center justify-center shadow-lg border-2 border-white/80${isSelected ? " ring-2 ring-[#FACC15] z-10" : ""}`
                      : `absolute z-[5] w-8 h-8 rounded-full bg-[#facc15] text-black text-xs font-bold flex items-center justify-center shadow-lg border-2 border-white/80${isSelected ? " ring-2 ring-[#FACC15] z-10" : ""}`;

                  if (isEquipmentType(el.type)) {
                    return (
                      <div
                        key={String(el.id ?? `el-${i}`)}
                        className={`absolute z-[4] flex touch-none select-none items-center justify-center rounded-2xl p-1 transition ${isSelected ? "ring-2 ring-[#FACC15] ring-offset-2 ring-offset-[#145f38]" : ""}`}
                        style={commonStyle}
                        onPointerDown={(e) => dragElement(e, i)}
                        title={String(el.type)}
                      >
                        <EquipmentGlyph type={el.type} />
                      </div>
                    );
                  }

                  return (
                    <div
                      key={String(el.id ?? `el-${i}`)}
                      className={playerClassName}
                      style={commonStyle}
                      onPointerDown={(e) => dragElement(e, i)}
                    >
                      {content}
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
                      setElements((prev) => prev.filter((_: TacticalBoardElement, idx: number) => idx !== selectedElementIndex));
                      setSelectedElementIndex(null);
                      setSaveState("Unsaved");
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
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                    {playerTools.map((tool) => (
                      <button
                        key={`bottom-player-${tool.id}`}
                        type="button"
                        title={tool.label}
                        onClick={() => setActiveTool(tool.id)}
                        className={`flex h-14 min-w-24 flex-col items-center justify-center gap-1 rounded-2xl border transition ${
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
