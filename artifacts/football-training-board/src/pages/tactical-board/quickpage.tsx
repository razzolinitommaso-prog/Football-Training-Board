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
    { id: "movement", label: "Move", icon: ChevronRight },
    { id: "players", label: "Players", icon: Users },
    { id: "zones", label: "Zones", icon: Square },
    { id: "text", label: "Text", icon: Type },
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
  const hasRenderableElements = elements.some((el) =>
    ["player", "opponent", "goalkeeper"].includes(el?.type ?? "")
  );
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

                if (activeTool !== "player" && activeTool !== "opponent" && activeTool !== "goalkeeper" && activeTool !== "players") {
                  return;
                }

                const nextType =
                  activeTool === "players"
                    ? "player"
                    : activeTool;

                const newElement = { type: nextType, x, y };

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
              <div className="absolute inset-0">
                <div className="absolute inset-y-0 left-1/2 w-[2px] bg-white/30 -translate-x-1/2" />
                <div className="absolute top-1/2 left-1/2 w-40 h-40 border border-white/30 rounded-full -translate-x-1/2 -translate-y-1/2" />
                <div className="absolute inset-4 border border-white/30 rounded-2xl" />
                <div className="absolute left-0 top-1/2 w-24 h-56 border border-white/30 border-l-0 -translate-y-1/2" />
                <div className="absolute right-0 top-1/2 w-24 h-56 border border-white/30 border-r-0 -translate-y-1/2" />
              </div>

              {/* Elements (player/opponent/goalkeeper) */}
              {hasRenderableElements ? (
                elements.map((el: TacticalBoardElement, i: number) => {
                  if (!["player", "opponent", "goalkeeper"].includes(el?.type ?? "")) return null;

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

                  const className =
                    el.type === "player"
                      ? `absolute w-8 h-8 rounded-full bg-yellow-400 text-black text-xs font-bold flex items-center justify-center shadow-lg border border-black/20${isSelected ? " ring-2 ring-[#FACC15] z-10" : ""}`
                      : el.type === "opponent"
                      ? `absolute w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shadow-lg border border-white/10${isSelected ? " ring-2 ring-[#FACC15] z-10" : ""}`
                      : `absolute w-8 h-8 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shadow-lg border border-white/10${isSelected ? " ring-2 ring-[#FACC15] z-10" : ""}`;

                  return (
                    <div
                      key={String(el.id ?? `el-${i}`)}
                      className={className}
                      style={commonStyle}
                      onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => {
                        // Drag di un elemento: non deve innescare l'add del pitch.
                        e.preventDefault();
                        e.stopPropagation();

                        const indexToDrag = i;
                        const pointerId = e.pointerId;
                        setSelectedElementIndex(indexToDrag);
                        isDraggingRef.current = true;
                        skipNextPitchClickRef.current = true;
                        setSaveState("Unsaved");

                        // Aggiorna subito posizione (utile su touch e mouse).
                        const rect = pitchRef.current?.getBoundingClientRect();
                        if (rect) {
                          const clamp = (v: number) => Math.max(0, Math.min(100, v));
                          const x = clamp(((e.clientX - rect.left) / rect.width) * 100);
                          const y = clamp(((e.clientY - rect.top) / rect.height) * 100);
                          setElements((prev) =>
                            prev.map((item: TacticalBoardElement, idx: number) =>
                              idx === indexToDrag ? { ...item, x, y } : item
                            )
                          );
                        }

                        const handleMove = (ev: PointerEvent) => {
                          if (ev.pointerId !== pointerId) return;
                          const r = pitchRef.current?.getBoundingClientRect();
                          if (!r) return;

                          const clamp = (v: number) => Math.max(0, Math.min(100, v));
                          const x = clamp(((ev.clientX - r.left) / r.width) * 100);
                          const y = clamp(((ev.clientY - r.top) / r.height) * 100);

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
                      }}
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
                <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 w-64">
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
                    className="px-3 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold shadow-lg"
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
              <svg className="absolute inset-0 w-full h-full">
                <defs>
                  <marker id="arrowYellow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L6,3 z" fill="#FACC15" />
                  </marker>
                  <marker id="arrowWhite" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L6,3 z" fill="white" />
                  </marker>
                </defs>
                <path d="M220 300 C320 240, 400 220, 520 170" stroke="#FACC15" strokeWidth="4" fill="none" markerEnd="url(#arrowYellow)" />
                <path d="M420 430 C520 380, 580 340, 690 250" stroke="white" strokeWidth="4" fill="none" markerEnd="url(#arrowWhite)" />
                <path d="M300 180 C380 200, 460 250, 550 320" stroke="#FACC15" strokeWidth="3" strokeDasharray="8 8" fill="none" markerEnd="url(#arrowYellow)" />
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
