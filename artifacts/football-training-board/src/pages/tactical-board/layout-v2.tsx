import { useState, type ComponentType, type ReactNode } from "react";
import {
  ArrowRight,
  Bell,
  BookOpen,
  ClipboardList,
  Clapperboard,
  Download,
  Eraser,
  FolderOpen,
  Menu,
  Mic,
  Monitor,
  Move,
  PanelRight,
  Pencil,
  Plus,
  Redo2,
  Save,
  Search,
  Settings2,
  Sparkles,
  Spline,
  Square,
  TabletSmartphone,
  Target,
  TimerReset,
  Undo2,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  BallToolIcon,
  CinesinoToolIcon,
  ConeToolIcon,
  DiscToolIcon,
  FlagToolIcon,
  GoalkeeperToolIcon,
  GoalToolIcon,
  HurdleToolIcon,
  LadderToolIcon,
  OpponentToolIcon,
  PlayerToolIcon,
  PoleToolIcon,
  SagomaToolIcon,
  TextToolIcon,
  VestToolIcon,
} from "./tool-icons";

type LayoutToolId =
  | "select"
  | "move"
  | "erase"
  | "draw"
  | "line"
  | "arrow"
  | "bezier"
  | "player"
  | "opponent"
  | "goalkeeper"
  | "ball"
  | "cone"
  | "goal"
  | "goalLarge"
  | "disc"
  | "cinesino"
  | "sagoma"
  | "flag"
  | "ladder"
  | "hurdle"
  | "pole"
  | "vest"
  | "text";

type FieldFormat = "5v5" | "7v7" | "9v9" | "11v11";
type FieldView = "full" | "half-top" | "half-bottom" | "half-left" | "half-right";
type FieldRenderMode = "standard" | "minimal";
type DevicePreview = "desktop" | "mobile";

type TacticalBoardLayoutV2Props = {
  boardTitle: string;
  onBoardTitleChange: (value: string) => void;
  activeTool: LayoutToolId;
  onToolChange: (toolId: LayoutToolId) => void;
  onToolDragStart: (toolId: LayoutToolId, event: React.DragEvent<HTMLElement>) => void;
  onToolTouchStart: (toolId: LayoutToolId, event: React.TouchEvent<HTMLElement>) => void;
  onSave: () => void;
  onOpen: () => void;
  onImport: () => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  formations: string[];
  onApplyFormation: (formation: string) => void;
  fieldFormat: FieldFormat;
  onFieldFormatChange: (value: FieldFormat) => void;
  fieldView: FieldView;
  onFieldViewChange: (value: FieldView) => void;
  fieldRenderMode: FieldRenderMode;
  onFieldRenderModeChange: (value: FieldRenderMode) => void;
  devicePreview: DevicePreview;
  onDevicePreviewChange: (value: DevicePreview) => void;
  selectedElementLabel: string | null;
  selectedElementType: string | null;
  selectedElementDetails: string[];
  libraryItems: string[];
  sessionItems: string[];
  boardContent: ReactNode;
};

type ToolItem = {
  id: LayoutToolId;
  label: string;
  shortLabel: string;
  icon: ComponentType<{ className?: string }>;
  accent: string;
};

const TOP_TABS = ["Build-up", "Difesa", "Transizioni", "Palle inattive"];

const TOOL_ITEMS: ToolItem[] = [
  { id: "select", shortLabel: "Select", label: "Seleziona", icon: Target, accent: "bg-emerald-500/16 text-emerald-200 border-emerald-400/25" },
  { id: "move", shortLabel: "Move", label: "Muovi", icon: Move, accent: "bg-slate-600/20 text-slate-100 border-white/10" },
  { id: "player", shortLabel: "Player", label: "Giocatore", icon: PlayerToolIcon, accent: "bg-sky-500/16 text-sky-200 border-sky-400/25" },
  { id: "opponent", shortLabel: "Opp.", label: "Avversario", icon: OpponentToolIcon, accent: "bg-rose-500/16 text-rose-200 border-rose-400/25" },
  { id: "goalkeeper", shortLabel: "GK", label: "Portiere", icon: GoalkeeperToolIcon, accent: "bg-amber-500/16 text-amber-200 border-amber-400/25" },
  { id: "ball", shortLabel: "Ball", label: "Pallone", icon: BallToolIcon, accent: "bg-white/10 text-white border-white/15" },
  { id: "cone", shortLabel: "Cone", label: "Cono", icon: ConeToolIcon, accent: "bg-orange-500/16 text-orange-200 border-orange-400/25" },
  { id: "goal", shortLabel: "Goal", label: "Porta", icon: GoalToolIcon, accent: "bg-zinc-500/16 text-zinc-100 border-zinc-300/20" },
  { id: "disc", shortLabel: "Disc", label: "Disco", icon: DiscToolIcon, accent: "bg-cyan-500/16 text-cyan-200 border-cyan-400/25" },
  { id: "vest", shortLabel: "Vest", label: "Pettorina", icon: VestToolIcon, accent: "bg-lime-500/16 text-lime-200 border-lime-400/25" },
  { id: "flag", shortLabel: "Flag", label: "Bandierina", icon: FlagToolIcon, accent: "bg-fuchsia-500/16 text-fuchsia-200 border-fuchsia-400/25" },
  { id: "draw", shortLabel: "Draw", label: "Disegno", icon: Pencil, accent: "bg-yellow-400/16 text-yellow-200 border-yellow-300/25" },
  { id: "line", shortLabel: "Line", label: "Linea", icon: PanelRight, accent: "bg-white/10 text-white border-white/15" },
  { id: "arrow", shortLabel: "Arrow", label: "Freccia", icon: ArrowRight, accent: "bg-yellow-400/16 text-yellow-200 border-yellow-300/25" },
  { id: "bezier", shortLabel: "Curve", label: "Curva", icon: Spline, accent: "bg-white/10 text-white border-white/15" },
  { id: "text", shortLabel: "Text", label: "Testo", icon: TextToolIcon, accent: "bg-violet-500/16 text-violet-200 border-violet-300/25" },
  { id: "erase", shortLabel: "Erase", label: "Gomma", icon: Eraser, accent: "bg-red-500/16 text-red-200 border-red-300/25" },
  { id: "goalLarge", shortLabel: "Goal+", label: "Porta large", icon: Square, accent: "bg-zinc-500/16 text-zinc-100 border-zinc-300/20" },
  { id: "cinesino", shortLabel: "Cine", label: "Cinesino", icon: CinesinoToolIcon, accent: "bg-cyan-500/16 text-cyan-200 border-cyan-400/25" },
  { id: "sagoma", shortLabel: "Dummy", label: "Sagoma", icon: SagomaToolIcon, accent: "bg-blue-500/16 text-blue-200 border-blue-400/25" },
  { id: "ladder", shortLabel: "Ladder", label: "Scaletta", icon: LadderToolIcon, accent: "bg-white/10 text-white border-white/15" },
  { id: "hurdle", shortLabel: "Hurdle", label: "Ostacolo", icon: HurdleToolIcon, accent: "bg-red-500/16 text-red-200 border-red-300/25" },
  { id: "pole", shortLabel: "Pole", label: "Paletto", icon: PoleToolIcon, accent: "bg-amber-500/16 text-amber-200 border-amber-300/25" },
];

const DOCK_TOOLS = [
  "select",
  "player",
  "opponent",
  "goalkeeper",
  "ball",
  "cone",
  "goal",
  "disc",
  "vest",
  "cinesino",
  "sagoma",
  "flag",
  "ladder",
  "hurdle",
  "pole",
  "draw",
  "line",
  "arrow",
  "bezier",
  "text",
  "erase",
] as LayoutToolId[];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function findTool(id: LayoutToolId) {
  return TOOL_ITEMS.find((tool) => tool.id === id) ?? TOOL_ITEMS[0];
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: typeof BookOpen; children: ReactNode }) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-[#191919] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.24)]">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/6 text-[#ffd84d]">
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function ToolButton({
  tool,
  active,
  onActivate,
  onDragStart,
  onTouchStart,
}: {
  tool: ToolItem;
  active: boolean;
  onActivate: () => void;
  onDragStart: (event: React.DragEvent<HTMLElement>) => void;
  onTouchStart: (event: React.TouchEvent<HTMLElement>) => void;
}) {
  const Icon = tool.icon;
  return (
    <button
      type="button"
      draggable
      onClick={onActivate}
      onDragStart={onDragStart}
      onTouchStart={onTouchStart}
      className={cn(
        "group flex min-w-[58px] flex-col items-center gap-1 rounded-[14px] px-1 py-1.5 transition-all duration-200",
        active
          ? "bg-white/[0.08] text-[#ffe37b] shadow-[inset_0_0_0_1px_rgba(255,227,123,0.28)]"
          : "bg-transparent text-white/85 hover:bg-white/[0.06]",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-[11px] border transition-all duration-200",
          active
            ? "border-[#ffd84d]/60 bg-[#2a2308] ring-1 ring-[#ffd84d]/45"
            : "border-white/25 bg-[#0e1014] group-hover:border-white/45",
        )}
      >
        <Icon className="h-5 w-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]" />
      </div>
      <span className={cn("text-[10px] leading-none font-medium", active ? "text-[#ffe37b]" : "text-white/78")}>
        {tool.label}
      </span>
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-white/8 bg-black/20 px-3 py-1.5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold text-white">{value}</div>
    </div>
  );
}

export default function TacticalBoardLayoutV2({
  boardTitle,
  onBoardTitleChange,
  activeTool,
  onToolChange,
  onToolDragStart,
  onToolTouchStart,
  onSave,
  onOpen,
  onImport,
  onExport,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  formations,
  onApplyFormation,
  fieldFormat,
  onFieldFormatChange,
  fieldView,
  onFieldViewChange,
  fieldRenderMode,
  onFieldRenderModeChange,
  devicePreview,
  onDevicePreviewChange,
  selectedElementLabel,
  selectedElementType,
  selectedElementDetails,
  libraryItems,
  sessionItems,
  boardContent,
}: TacticalBoardLayoutV2Props) {
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const selectedTool = findTool(activeTool);
  const isCompactLayout = devicePreview === "mobile";

  return (
    <div className="w-full bg-[#0f0f10] text-white">
      <div className="mx-auto w-full max-w-none p-0">
        <div className="overflow-hidden border-y border-white/8 bg-[#121212] shadow-[0_28px_90px_rgba(0,0,0,0.36)] lg:rounded-none">
          <div className="pointer-events-none relative z-20 mx-3 mt-2 rounded-[22px] border border-white/10 bg-[#171717]/74 px-3 py-2 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-md lg:mx-4 lg:mt-3">
            <div className="pointer-events-auto flex items-center gap-2 overflow-x-auto whitespace-nowrap">
              <button type="button" onClick={onOpen} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/85 transition hover:bg-white/[0.08]">
                <FolderOpen className="h-4 w-4" />
              </button>
              <button type="button" onClick={onSave} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/85 transition hover:bg-white/[0.08]">
                <Save className="h-4 w-4" />
              </button>
              <button type="button" onClick={onImport} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/85 transition hover:bg-white/[0.08]">
                <Upload className="h-4 w-4" />
              </button>
              <button type="button" onClick={onExport} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/85 transition hover:bg-white/[0.08]">
                <Download className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onBoardTitleChange("")}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/85 transition hover:bg-white/[0.08]"
                title="Nuova lavagna tattica"
                aria-label="Nuova lavagna tattica"
              >
                <Plus className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/20 p-1">
                <button
                  type="button"
                  onClick={() => onDevicePreviewChange("desktop")}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition",
                    devicePreview === "desktop" ? "bg-white/12 text-white" : "text-white/55 hover:text-white/82",
                  )}
                >
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => onDevicePreviewChange("mobile")}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition",
                    devicePreview === "mobile" ? "bg-emerald-500/14 text-emerald-200" : "text-white/55 hover:text-white/82",
                  )}
                >
                  Mobile
                </button>
              </div>
              <div className="flex min-w-[120px] flex-1 justify-center px-2">
                <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 p-1">
                  <button
                    type="button"
                    onClick={onUndo}
                    disabled={!canUndo}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/80 transition hover:bg-white/[0.08] disabled:opacity-35"
                    title="Annulla"
                    aria-label="Annulla"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onRedo}
                    disabled={!canRedo}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/80 transition hover:bg-white/[0.08] disabled:opacity-35"
                    title="Riprendi"
                    aria-label="Riprendi"
                  >
                    <Redo2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {!isCompactLayout ? (
                <div className="flex flex-wrap gap-1">
                  {TOP_TABS.map((tab, index) => (
                    <button
                      key={tab}
                      type="button"
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-medium transition",
                        index === 0
                          ? "bg-[#ffd84d]/14 text-[#ffe37b] shadow-[inset_0_-2px_0_rgba(255,216,77,0.75)]"
                          : "text-white/58 hover:bg-white/[0.04] hover:text-white/88",
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <label className="w-[96px] rounded-[12px] border border-white/8 bg-black/20 px-2 py-1">
                    <div className="text-[9px] uppercase tracking-[0.16em] text-white/35">Formato</div>
                    <select
                      value={fieldFormat}
                      onChange={(event) => onFieldFormatChange(event.target.value as FieldFormat)}
                      className="mt-0.5 w-full bg-transparent text-[12px] font-semibold text-white outline-none"
                    >
                      <option value="11v11" className="bg-[#171717]">11v11</option>
                      <option value="9v9" className="bg-[#171717]">9v9</option>
                      <option value="7v7" className="bg-[#171717]">7v7</option>
                      <option value="5v5" className="bg-[#171717]">5v5</option>
                    </select>
                  </label>
                  <label className="w-[96px] rounded-[12px] border border-white/8 bg-black/20 px-2 py-1">
                    <div className="text-[9px] uppercase tracking-[0.16em] text-white/35">Vista</div>
                    <select
                      value={fieldView}
                      onChange={(event) => onFieldViewChange(event.target.value as FieldView)}
                      className="mt-0.5 w-full bg-transparent text-[12px] font-semibold text-white outline-none"
                    >
                      <option value="full" className="bg-[#171717]">Intero</option>
                      <option value="half-top" className="bg-[#171717]">Alta</option>
                      <option value="half-bottom" className="bg-[#171717]">Bassa</option>
                      <option value="half-left" className="bg-[#171717]">Sinistra</option>
                      <option value="half-right" className="bg-[#171717]">Destra</option>
                    </select>
                  </label>
                </div>
              )}

              {!isCompactLayout ? (
                <>
                  <div className="ml-auto flex min-w-[180px] flex-1 items-center gap-2 rounded-full border border-white/10 bg-[#0f0f10] px-3 py-1 text-white/50 md:max-w-[220px] lg:max-w-[250px] xl:max-w-[280px]">
                    <Search className="h-3.5 w-3.5" />
                    <input
                      className="w-full bg-transparent text-[13px] text-white outline-none placeholder:text-white/35"
                      placeholder="Cerca players..."
                    />
                  </div>

                  <div className="w-[108px]">
                    <MiniStat label="Tool" value={selectedTool.shortLabel} />
                  </div>

                  <label className="w-[116px] rounded-[14px] border border-white/8 bg-black/20 px-3 py-1">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">Formato</div>
                    <select
                      value={fieldFormat}
                      onChange={(event) => onFieldFormatChange(event.target.value as FieldFormat)}
                      className="mt-0.5 w-full bg-transparent text-[14px] font-semibold text-white outline-none"
                    >
                      <option value="11v11" className="bg-[#171717]">11v11</option>
                      <option value="9v9" className="bg-[#171717]">9v9</option>
                      <option value="7v7" className="bg-[#171717]">7v7</option>
                      <option value="5v5" className="bg-[#171717]">5v5</option>
                    </select>
                  </label>

                  <label className="w-[126px] rounded-[14px] border border-white/8 bg-black/20 px-3 py-1">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">Vista</div>
                    <select
                      value={fieldView}
                      onChange={(event) => onFieldViewChange(event.target.value as FieldView)}
                      className="mt-0.5 w-full bg-transparent text-[14px] font-semibold text-white outline-none"
                    >
                      <option value="full" className="bg-[#171717]">Intero</option>
                      <option value="half-top" className="bg-[#171717]">Metà alta</option>
                      <option value="half-bottom" className="bg-[#171717]">Metà bassa</option>
                      <option value="half-left" className="bg-[#171717]">Metà sx</option>
                      <option value="half-right" className="bg-[#171717]">Metà dx</option>
                    </select>
                  </label>

                  <label className="w-[136px] rounded-[14px] border border-white/8 bg-black/20 px-3 py-1">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">Render</div>
                    <select
                      value={fieldRenderMode}
                      onChange={(event) => onFieldRenderModeChange(event.target.value as FieldRenderMode)}
                      className="mt-0.5 w-full bg-transparent text-[14px] font-semibold text-white outline-none"
                    >
                      <option value="standard" className="bg-[#171717]">Standard</option>
                      <option value="minimal" className="bg-[#171717]">Minimal</option>
                    </select>
                  </label>
                </>
              ) : null}

              <div className={cn("flex items-center gap-2", isCompactLayout ? "ml-auto" : "")}>
                <button
                  type="button"
                  onClick={() => setRightPanelOpen((value) => !value)}
                  className="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 text-white/85 transition hover:bg-white/[0.08]"
                >
                  {rightPanelOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                  <span className={cn("text-sm", isCompactLayout ? "" : "hidden md:inline")}>
                    {isCompactLayout ? "Pannelli" : "Pannelli"}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="relative -mt-[74px] p-0 pt-[74px]">
            <main className="min-w-0">
              <section className="rounded-[24px] border border-white/8 bg-[#181818] p-1 shadow-[0_24px_60px_rgba(0,0,0,0.24)]">
                <div className="overflow-hidden rounded-[20px]">
                  <div
                    className={cn(
                      "bg-[#111]",
                      devicePreview === "mobile"
                        ? "mx-auto h-[calc(100vh-170px)] min-h-[700px] max-h-[1080px] w-full max-w-[440px]"
                        : "h-[calc(100vh-170px)] min-h-[700px] max-h-[1080px] w-full xl:h-[calc(100vh-180px)] 2xl:max-h-[1140px]",
                    )}
                  >
                    {boardContent}
                  </div>
                </div>
              </section>

              <div className="mt-1.5 rounded-[18px] border border-white/8 bg-[#171717] px-2.5 py-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
                <div className="flex items-center justify-center gap-1 overflow-x-auto">
                  {DOCK_TOOLS.map((toolId) => {
                    const tool = findTool(toolId);
                    if (isCompactLayout) {
                      const Icon = tool.icon;
                      const active = activeTool === tool.id;
                      return (
                        <button
                          key={tool.id}
                          type="button"
                          draggable
                          onClick={() => onToolChange(tool.id)}
                          onDragStart={(event) => onToolDragStart(tool.id, event)}
                          onTouchStart={(event) => onToolTouchStart(tool.id, event)}
                          className={cn(
                            "group flex min-w-[52px] flex-col items-center gap-0.5 rounded-[12px] px-1 py-1 transition-all duration-200",
                            active
                              ? "bg-white/[0.09] text-[#ffe37b] shadow-[inset_0_0_0_1px_rgba(255,227,123,0.24)]"
                              : "bg-transparent text-white/86 hover:bg-white/[0.06]",
                          )}
                        >
                          <div
                            className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-[10px] border",
                              active
                                ? "border-[#ffd84d]/60 bg-[#2a2308] ring-1 ring-[#ffd84d]/45"
                                : "border-white/25 bg-[#0e1014] group-hover:border-white/45",
                            )}
                          >
                            <Icon className="h-4.5 w-4.5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]" />
                          </div>
                          <span className={cn("text-[9px] leading-none font-medium", active ? "text-[#ffe37b]" : "text-white/78")}>
                            {tool.shortLabel}
                          </span>
                        </button>
                      );
                    }

                    return (
                      <ToolButton
                        key={tool.id}
                        tool={tool}
                        active={activeTool === tool.id}
                        onActivate={() => onToolChange(tool.id)}
                        onDragStart={(event) => onToolDragStart(tool.id, event)}
                        onTouchStart={(event) => onToolTouchStart(tool.id, event)}
                      />
                    );
                  })}

                </div>
              </div>
            </main>

            {rightPanelOpen ? (
              <div
                className={cn(
                  "z-20 overflow-y-auto border border-white/10 bg-[#131313]/95 p-3 shadow-[0_28px_70px_rgba(0,0,0,0.45)] backdrop-blur",
                  isCompactLayout
                    ? "fixed inset-x-2 bottom-2 top-auto max-h-[68vh] rounded-[24px]"
                    : "absolute inset-y-2 right-2 w-[340px] rounded-[28px]",
                )}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold text-white">Pannelli rapidi</div>
                  <button
                    type="button"
                    onClick={() => setRightPanelOpen(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/80"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <SectionCard title="Starting XI" icon={Users}>
                    <div className="space-y-2">
                      {formations.length > 0 ? (
                        formations.map((formation) => (
                          <button
                            key={formation}
                            type="button"
                            onClick={() => onApplyFormation(formation)}
                            className="flex w-full items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-left text-white/78 transition hover:bg-white/[0.06]"
                          >
                            <span className="font-medium">{formation}</span>
                            <span className="text-xs uppercase tracking-[0.2em] text-white/35">Apply</span>
                          </button>
                        ))
                      ) : (
                        <div className="text-sm text-white/45">Nessuna formazione disponibile.</div>
                      )}
                    </div>
                  </SectionCard>

                  <SectionCard title="Elemento selezionato" icon={ClipboardList}>
                    {selectedElementLabel || selectedElementType ? (
                      <div className="space-y-3">
                        <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                          <div className="text-xs uppercase tracking-[0.18em] text-white/35">Focus</div>
                          <div className="mt-2 text-lg font-semibold text-white">{selectedElementLabel ?? "Elemento senza nome"}</div>
                          <div className="mt-1 text-sm text-[#ffd84d]">{selectedElementType ?? "n/d"}</div>
                        </div>
                        <div className="space-y-2">
                          {selectedElementDetails.length > 0 ? selectedElementDetails.map((detail) => (
                            <div key={detail} className="rounded-2xl border border-white/6 bg-black/20 px-3 py-2 text-sm text-white/72">
                              {detail}
                            </div>
                          )) : <div className="text-sm text-white/45">Nessun dettaglio aggiuntivo disponibile.</div>}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-white/45">
                        Seleziona un elemento dal campo per vedere proprietà e contesto.
                      </div>
                    )}
                  </SectionCard>

                  <SectionCard title="Libreria collegata" icon={BookOpen}>
                    <div className="space-y-2">
                      {libraryItems.map((item) => (
                        <div key={item} className="rounded-2xl border border-white/6 bg-black/20 px-3 py-3 text-sm text-white/72">
                          {item}
                        </div>
                      ))}
                    </div>
                  </SectionCard>

                  <SectionCard title="Sessione live" icon={TimerReset}>
                    <div className="space-y-2">
                      {sessionItems.map((item) => (
                        <div key={item} className="rounded-2xl border border-white/6 bg-black/20 px-3 py-3 text-sm text-white/72">
                          {item}
                        </div>
                      ))}
                    </div>
                  </SectionCard>

                  <SectionCard title="Note rapide" icon={Mic}>
                    <div className="space-y-3">
                      <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
                        Spazio predisposto per note veloci, memo tecnici e collegamento audio/video nel prossimo step.
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white/80 hover:bg-white/[0.08]">
                          <Mic className="h-4 w-4" />
                          Memo audio
                        </button>
                        <button type="button" className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white/80 hover:bg-white/[0.08]">
                          <Clapperboard className="h-4 w-4" />
                          Clip video
                        </button>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard title="Workspace" icon={Sparkles}>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-2xl border border-white/6 bg-black/20 px-3 py-3 text-sm text-white/72">
                        <div className="mb-1 flex items-center gap-2 text-white/85">
                          <Monitor className="h-4 w-4" />
                          Desktop
                        </div>
                        Visuale larga per analisi.
                      </div>
                      <div className="rounded-2xl border border-white/6 bg-black/20 px-3 py-3 text-sm text-white/72">
                        <div className="mb-1 flex items-center gap-2 text-white/85">
                          <TabletSmartphone className="h-4 w-4" />
                          Mobile
                        </div>
                        Preview rapida della board.
                      </div>
                      <div className="rounded-2xl border border-white/6 bg-black/20 px-3 py-3 text-sm text-white/72">
                        <div className="mb-1 flex items-center gap-2 text-white/85">
                          <Bell className="h-4 w-4" />
                          Alert
                        </div>
                        Stato e richiami operativi.
                      </div>
                      <div className="rounded-2xl border border-white/6 bg-black/20 px-3 py-3 text-sm text-white/72">
                        <div className="mb-1 flex items-center gap-2 text-white/85">
                          <Settings2 className="h-4 w-4" />
                          Setup
                        </div>
                        Controlli rapidi board.
                      </div>
                    </div>
                  </SectionCard>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
