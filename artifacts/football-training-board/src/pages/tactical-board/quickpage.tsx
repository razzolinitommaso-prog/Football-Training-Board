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
  ChevronRight,
  Mic,
  Video,
  PenTool,
  Move,
  Users,
  Square,
  Type,
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
  if (category === "Pulcini") return "7v7";
  if (category === "Esordienti") return "9v9";
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
  const [focusMode, setFocusMode] = useState(false);
  const [activeTool, setActiveTool] = useState("draw");
  const [saveState, setSaveState] = useState("Saved");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(initialPresetFromQuery ?? "4-3-3");
  const [boardTitle, setBoardTitle] = useState("Nuova lavagna");
  const [currentBoardId, setCurrentBoardId] = useState<number | null>(null);
  const [boardTeamId, setBoardTeamId] = useState<number | null>(initialTeamIdFromQuery);
  const [boardClubId, setBoardClubId] = useState<number | null>(parseNumericId((club as any)?.id));
  const [boardCategory, setBoardCategory] = useState<string | null>(null);
  const [boardFormat, setBoardFormat] = useState<TacticalBoardFormat>("11v11");
  const [boardType, setBoardType] = useState<(typeof BOARD_TYPES)[number]>("Training");
  const [boardNotes, setBoardNotes] = useState("Obiettivo: attirare la prima pressione e uscire sul lato debole con la mezzala dentro.");
  const [librarySearch, setLibrarySearch] = useState("");

  const [selectedElementIndex, setSelectedElementIndex] = useState<number | null>(null);

  
  const [boards, setBoards] = useState<any[]>([]);
  const [boardsError, setBoardsError] = useState<string | null>(null);
  const [elements, setElements] = useState<TacticalBoardElement[]>([]);
  const { players: fetchedTeamPlayers } = useTeamPlayers(boardTeamId);
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([]);
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
    setBoardClubId(parseNumericId((club as any)?.id));
  }, [club]);

  React.useEffect(() => {
    if (!boardTeamId) return;
    const team = (allTeams || []).find((t: any) => t.id === boardTeamId);
    if (!team) return;
    const category = team.category ?? null;
    setBoardCategory(category);
    setBoardFormat(deriveFormatFromCategory(category));
  }, [allTeams, boardTeamId]);

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
    if (!teamPlayers.length) return;
    setElements((prev) => assignPlayersToElements(prev, teamPlayers));
  }, [teamPlayers]);

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
  
  const pitchRef = React.useRef<HTMLDivElement | null>(null);
  const isDraggingRef = React.useRef(false);
  const skipNextPitchClickRef = React.useRef(false);

  const presets = [
    "4-3-3",
    "4-2-3-1",
    "3-5-2",
    "Pressing",
    "Uscita",
    "Transizione",
    "Corner Off",
    "Corner Def",
  ];

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

  const tools = [
    { id: "select", label: "Select", icon: Move },
    { id: "draw", label: "Draw", icon: PenTool },
    { id: "movement", label: "Arrow", icon: ChevronRight },
    { id: "players", label: "Players", icon: Users },
    { id: "zones", label: "Zones", icon: Square },
    { id: "text", label: "Text", icon: Type },
  ];
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
  const hasRenderableElements = elements.some((el) => isPlayerType(el?.type) || isEquipmentType(el?.type) || isDrawingType(el?.type));
  const selectedElement =
    selectedElementIndex !== null ? elements[selectedElementIndex] : null;
  const canAssignRealPlayer = selectedElement?.type === "player" || selectedElement?.type === "goalkeeper";
  const selectedElementLabel =
    selectedElement?.name ??
    (selectedElement?.type ? `${selectedElement.type[0].toUpperCase()}${selectedElement.type.slice(1)}` : "No selection");
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
            Focus
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
    setBoardTitle("Nuova lavagna");
    setSelectedPreset(null);
    setActiveTool("draw");
    setFocusMode(false);
    setElements([]);
    setSelectedElementIndex(null);
    setSaveState("New");
    const params = new URLSearchParams(window.location.search);
    const nextTeamId = parseNumericId(params.get("teamId"));
    setBoardTeamId(nextTeamId);
    const nextTeam = (allTeams || []).find((t: any) => t.id === nextTeamId);
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
      teamId: boardTeamId,
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
      setCurrentBoardId(savedBoard.id);
      
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
            Save
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
        {/* LEFT SIDEBAR */}
        {!focusMode && leftOpen && (
          <aside className="hidden lg:flex w-80 border-r border-white/10 bg-[#0F172A] flex-col p-4 gap-6 overflow-y-auto">
            <div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/5 border border-white/10">
                <Search size={16} className="text-white/50" />
                <input
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  placeholder="Search presets, boards, folders..."
                  className="bg-transparent outline-none text-sm w-full placeholder:text-white/40"
                />
              </div>
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-widest text-white/40 mb-3">
                Tools
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {tools.map((tool) => {
                  const Icon = tool.icon;
                  const active = activeTool === tool.id;
                  return (
                    <button
                      key={`sidebar-${tool.id}`}
                      onClick={() => setActiveTool(tool.id)}
                      className={`flex flex-col items-start gap-2 px-4 py-3 rounded-2xl border text-sm transition ${
                        active
                          ? "bg-[#FACC15] text-black border-[#FACC15] shadow-lg shadow-yellow-500/10"
                          : "bg-white/5 hover:bg-white/10 border-white/10 text-white"
                      }`}
                    >
                      <Icon size={16} />
                      <span className="font-medium">{tool.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-widest text-white/40 mb-3">
                Attrezzatura
              </h3>
              <div className="grid grid-cols-5 gap-2">
                {equipmentTools.map((tool) => (
                  <button
                    key={tool.id}
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
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-widest text-white/40 mb-3">
                Recent Boards
              </h3>
              <div className="space-y-2">
              {filteredBoards.map((board) => (
              <button
              key={board.id}
              onClick={() => {
                const data = (board.data || {}) as TacticalBoardData;
                setCurrentBoardId(board.id);
                setBoardTitle(board.title);
                setBoardTeamId(parseNumericId(data.teamId) ?? initialTeamIdFromQuery);
                setBoardClubId(parseNumericId(data.clubId) ?? parseNumericId((club as any)?.id));
                setBoardCategory((data.category as string | null) ?? null);
                setBoardFormat(
                  (data.format as TacticalBoardFormat | undefined) ??
                    deriveFormatFromCategory((data.category as string | null) ?? null)
                );
                setSelectedPreset(data.preset ?? null);
                setActiveTool(data.activeTool ?? "draw");
                setFocusMode(data.focusMode ?? false);
                setElements(data.elements ?? []);
                setSelectedElementIndex(null);
              }}  
              className="w-full text-left px-3 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm transition"
            >
              <div className="font-medium">{board.title}</div>
              <div className="text-xs text-white/40 mt-1">Reopen board</div>
            </button>    
                ))}
                {filteredBoards.length === 0 && (
                  <div className="px-3 py-5 rounded-2xl border border-dashed border-white/10 text-center text-sm text-white/40">
                    No boards found
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-widest text-white/40 mb-3">
                Quick Presets
              </h3>
              <div className="flex flex-wrap gap-2">
                {filteredPresets.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => applyPreset(preset)}
                    className={`px-3 py-2 rounded-full text-sm transition ${
                      selectedPreset === preset
                        ? "bg-[#FACC15] text-black font-medium"
                        : "bg-white/5 hover:bg-white/10 text-white"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
                {filteredPresets.length === 0 && (
                  <div className="text-sm text-white/40">No preset matches your search.</div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-widest text-white/40 mb-3">
                Folders
              </h3>
              <div className="space-y-2">
                {filteredFolders.map((folder) => (
                  <button
                    key={folder}
                    className="w-full flex items-center gap-2 text-left px-3 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm transition"
                  >
                    <Folder size={16} />
                    {folder}
                  </button>
                ))}
                {filteredFolders.length === 0 && (
                  <div className="text-sm text-white/40">No folders found.</div>
                )}
              </div>
            </div>
          </aside>
        )}

        {/* CENTER AREA */}
        <main className="flex-1 flex flex-col bg-[#0B1220]">
          {/* CANVAS TOP BAR */}
          <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-white/10 bg-[#0B1220]">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedPreset ?? ""}
                onChange={(e) => applyPreset(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm"
              >
                <option value="">Choose preset</option>
                {Object.keys(FORMATIONS).map((formation) => (
                  <option key={formation} value={formation}>{formation}</option>
                ))}
              </select>
              <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm">
                <option>Full Pitch</option>
                <option>Half Pitch</option>
                <option>Final Third</option>
                <option>Set Piece</option>
              </select>
              <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white/70">
                <span className="font-semibold text-white">Tool</span>
                <span>{activeTool}</span>
              </div>
            </div>
            <div className="text-xs text-emerald-400 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">{saveState}</div>
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
          <div className="flex-1 p-4 md:p-6 overflow-auto">
            <div
              className="relative w-full h-[70vh] rounded-[30px] overflow-hidden border border-white/10 shadow-2xl bg-gradient-to-b from-[#19603A] via-[#165A37] to-[#11462C]"
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
                  lineWidth: activeTool === "zones" ? 2 : 3.2,
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

                if (activeTool !== "player" && activeTool !== "opponent" && activeTool !== "goalkeeper" && activeTool !== "players" && !isEquipmentType(activeTool)) {
                  return;
                }

                const nextType =
                  activeTool === "players"
                    ? "player"
                    : activeTool;

                const newElement = { type: nextType, x, y, label: activeTool === "text" ? "T" : undefined };

                setElements((prev) => [...prev, newElement]);
                setSaveState("Unsaved");
              }}
            >
              <div className="absolute inset-x-6 top-5 z-10 flex items-center justify-between rounded-2xl bg-[#08142b]/72 border border-white/10 px-4 py-3 backdrop-blur-md">
                <div>
                  <div className="text-sm font-semibold">{boardTitle}</div>
                  <div className="text-xs text-white/50">{boardType} · {boardFormat} · {selectedPreset ?? "Free board"}</div>
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

              {/* pitch markings */}
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-y-0 left-1/2 w-[2px] bg-white/30 -translate-x-1/2" />
                <div className="absolute top-1/2 left-1/2 w-40 h-40 border border-white/30 rounded-full -translate-x-1/2 -translate-y-1/2" />
                <div className="absolute inset-4 border border-white/30 rounded-2xl" />
                <div className="absolute left-0 top-1/2 w-24 h-56 border border-white/30 border-l-0 -translate-y-1/2" />
                <div className="absolute right-0 top-1/2 w-24 h-56 border border-white/30 border-r-0 -translate-y-1/2" />
              </div>

              {/* Dynamic tactical drawings */}
              <svg className="pointer-events-none absolute inset-0 z-[3] h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <marker id="dynamicArrowYellow" markerWidth="4" markerHeight="4" refX="3.4" refY="2" orient="auto">
                    <path d="M0,0 L0,4 L4,2 z" fill="#FACC15" />
                  </marker>
                </defs>
                {elements.map((el: TacticalBoardElement, i: number) => {
                  if (!isDrawingType(el.type)) return null;
                  const points = Array.isArray(el.points) ? el.points as Array<{ x: number; y: number }> : [];
                  if (points.length < 2) return null;
                  const color = String(el.color ?? "#FACC15");
                  const width = Number(el.lineWidth ?? 3);
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
                        strokeWidth={selected ? width * 0.42 : width * 0.32}
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
                      strokeWidth={width * 0.28}
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
                    Delete
                  </button>
                </div>
              )}

              {/* Tactical arrows */}
              <svg className="pointer-events-none absolute inset-0 z-[2] h-full w-full">
                <defs>
                  <marker id="arrowYellow" markerWidth="12" markerHeight="12" refX="8" refY="4" orient="auto">
                    <path d="M0,0 L0,8 L9,4 z" fill="#FACC15" />
                  </marker>
                  <marker id="arrowWhite" markerWidth="12" markerHeight="12" refX="8" refY="4" orient="auto">
                    <path d="M0,0 L0,8 L9,4 z" fill="white" />
                  </marker>
                </defs>
                <path d="M220 300 C310 245, 398 218, 520 170" stroke="#FACC15" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" markerEnd="url(#arrowYellow)" />
                <path d="M420 430 C520 380, 585 340, 690 250" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" markerEnd="url(#arrowWhite)" />
                <path d="M300 180 C385 205, 460 250, 550 320" stroke="#FACC15" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="10 12" fill="none" markerEnd="url(#arrowYellow)" />
              </svg>

              <div className="absolute inset-x-6 bottom-5 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#08142b]/72 border border-white/10 px-4 py-3 backdrop-blur-md">
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  Live editing board
                </div>
                <div className="flex items-center gap-2 overflow-x-auto">
                  {tools.slice(0, 5).map((tool) => (
                    <button
                      key={`canvas-tool-${tool.id}`}
                      onClick={() => setActiveTool(tool.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium transition ${
                        activeTool === tool.id
                          ? "bg-[#FACC15] text-black"
                          : "bg-white/10 text-white/80 hover:bg-white/15"
                      }`}
                    >
                      {tool.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM TOOLBAR */}
          <div className="border-t border-white/10 bg-[#0F172A] px-3 md:px-6 py-3">
            <div className="flex items-center gap-2 overflow-x-auto">
              {tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    onClick={() => setActiveTool(tool.id)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm whitespace-nowrap transition ${
                      activeTool === tool.id
                        ? "bg-[#FACC15] text-black font-semibold"
                        : "bg-white/5 hover:bg-white/10 text-white"
                    }`}
                  >
                    <Icon size={16} />
                    {tool.label}
                  </button>
                );
              })}
            </div>
          </div>
        </main>

        {/* RIGHT SIDEBAR */}
        {!focusMode && rightOpen && (
          <aside className="hidden xl:flex w-80 border-l border-white/10 bg-[#0F172A] flex-col p-4 gap-5 overflow-y-auto">
            <div>
              <h3 className="text-xs uppercase tracking-widest text-white/40 mb-3">
                Board Details
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
                  <option value="">No formation preset</option>
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
                Selection Inspector
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
                        <div className="text-[10px] uppercase tracking-widest text-white/40">Type</div>
                        <div className="mt-1 text-sm">{selectedElement.type}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-widest text-white/40">Position</div>
                        <div className="mt-1 text-sm">
                          {selectedElement.x != null && selectedElement.y != null
                            ? `${Math.round(selectedElement.x)}% / ${Math.round(selectedElement.y)}%`
                            : "n/a"}
                        </div>
                      </div>
                    </div>
                    {canAssignRealPlayer && (
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                        <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Assignment</div>
                        <div className="text-sm text-white/80">
                          {selectedElement.playerId ? selectedElementLabel : "Generic tactical marker"}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-white/55">
                    Select an element on the pitch to edit contextual details here.
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-widest text-white/40 mb-3">
                Text Notes
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
                  <button className="px-3 py-2 rounded-xl bg-white/10 text-sm">Record</button>
                  <button className="px-3 py-2 rounded-xl bg-white/10 text-sm">Replace</button>
                  <button className="px-3 py-2 rounded-xl bg-white/10 text-sm">Delete</button>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-widest text-white/40 mb-3">
                Video
              </h3>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="h-32 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-white/40 text-sm">
                  Video Thumbnail
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[#FACC15] text-black text-sm font-medium">
                    <Video size={16} />
                    Record
                  </button>
                  <button className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/10 text-sm">
                    <Upload size={16} />
                    Upload
                  </button>
                  <button className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/10 text-sm">
                    <Play size={16} />
                    Play
                  </button>
                  <button className="px-3 py-2 rounded-xl bg-white/10 text-sm">Replace</button>
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
