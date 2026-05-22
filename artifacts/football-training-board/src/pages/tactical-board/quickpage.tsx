import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/hooks/use-auth";
import { useListPlayers, useListTeams } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  Save,
  Copy,
  Share2,
  Calendar,
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
  Users,
  UserPlus,
  Hash,
  Palette,
  Package,
  PencilLine,
  Library,
  Ruler,
  Type,
  ArrowRight,
  Square,
} from "lucide-react";
import { withApi } from "@/lib/api-base";
import { FORMATIONS, isFormationPresetId, type FormationPresetId } from "./formations";
import type { ArrowToolPreset, TacticalBoardData, TacticalBoardElement, TacticalBoardFormat } from "./board-types";
import { useTeamPlayers, type TeamPlayer } from "./use-team-players";
import { assignPlayersToElements, isGoalkeeperPlayer } from "./player-mapping";

type FieldElementPanel = "assign" | "text" | "number" | "color" | "rotate" | "line" | "arrow" | "shape" | "format" | "font" | "measure";
type BoardActionPanel = "load" | "create" | "exercise" | "tactics" | "match" | "none";

/**
 * Panchina riserve: fila centrata sul fondo (y alto), lontano dalla formazione,
 * così non risultano “in mezzo” al rettangolo di gioco come in angolo a x basso.
 */
function benchSpotForReserve(benchIndex: number): { x: number; y: number } {
  const col = benchIndex % 12;
  const row = Math.floor(benchIndex / 12);
  const x = 16 + col * 6.1;
  const y = 97 + row * 3.5;
  return { x: Math.min(88, x), y: Math.min(99.5, y) };
}
type MatchPlanPeriodLite = {
  key: string;
  module?: string;
  format?: TacticalBoardFormat;
  lineupPlayerIds?: number[];
  lineupDetectedModule?: string | null;
};

type MatchPlanFieldRow = { player: TeamPlayer; index: number; isReserve: boolean };

type MatchOption = {
  id: number;
  teamId?: number | null;
  opponent?: string | null;
  competition?: string | null;
  date?: string | null;
  homeAway?: string | null;
  teamName?: string | null;
  matchPlan?: { periods?: MatchPlanPeriodLite[] } | null;
};
type MatchCallupItem = {
  id: number;
  playerId: number;
  status?: string | null;
};

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

function playerRoleRank(position?: string | null): number {
  const p = String(position ?? "").trim().toLowerCase();
  if (p.includes("port") || p === "gk" || p === "por" || p === "gkp" || p.includes("goalkeep")) return 0;
  if (p.includes("dif") || p.includes("terzin") || p.includes("centrale") || p.includes("dc")) return 1;
  if (p.includes("cent") || p.includes("med") || p.includes("mezz") || p.includes("cc")) return 2;
  if (p.includes("estern") || p.includes("ala") || p.includes("trequart")) return 3;
  if (p.includes("att") || p.includes("punta") || p.includes("fw")) return 4;
  return 5;
}

function compareTeamPlayersByRole(a: TeamPlayer, b: TeamPlayer): number {
  const byRole = playerRoleRank(a.position) - playerRoleRank(b.position);
  if (byRole !== 0) return byRole;
  const byNumber = (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999);
  if (byNumber !== 0) return byNumber;
  return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "it");
}

/** Ordine titolari/riserve come in scheda: prima lineup del tempo, poi altri per ruolo (no ordine di click). */
function orderMatchPlanRosterPlayers(
  players: TeamPlayer[],
  period: { lineupPlayerIds?: number[] } | null | undefined,
): TeamPlayer[] {
  const byId = new Map(players.map((p) => [String(p.id), p]));
  const onFieldIdSet = new Set(players.map((p) => String(p.id)));
  const lineupIdsRaw = period?.lineupPlayerIds ?? [];
  const orderedFromLineup = lineupIdsRaw
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && onFieldIdSet.has(String(id)));
  const inLineup = new Set(orderedFromLineup.map(String));
  const extras = players
    .filter((p) => !inLineup.has(String(p.id)))
    .sort(compareTeamPlayersByRole);
  const ordered: TeamPlayer[] = [];
  for (const id of orderedFromLineup) {
    const p = byId.get(String(id));
    if (p) ordered.push(p);
  }
  ordered.push(...extras);
  return ordered;
}

function roleMacroKey(position?: string | null): "GK" | "DEF" | "MID" | "FWD" {
  const p = String(position ?? "").trim().toLowerCase();
  if (p.includes("port") || p === "gk" || p === "por" || p === "gkp" || p.includes("goalkeep")) return "GK";
  if (p.includes("dif") || p.includes("terzin") || p.includes("centrale") || p.includes("dc")) return "DEF";
  if (p.includes("att") || p.includes("punta") || p.includes("fw") || p.includes("wing")) return "FWD";
  return "MID";
}

function playerLimitForFormat(format: TacticalBoardFormat): number {
  if (format === "3v3") return 3;
  if (format === "5v5") return 5;
  if (format === "7v7") return 7;
  if (format === "9v9") return 9;
  return 11;
}

function moduleOptionsForFormat(format: TacticalBoardFormat): string[] {
  if (format === "3v3") return ["1-1-1", "2-1"];
  if (format === "5v5") return ["2-2", "1-2-1", "2-1-1"];
  if (format === "7v7") return ["2-3-1", "3-2-1", "3-1-2"];
  if (format === "9v9") return ["3-3-2", "3-2-3", "4-3-1"];
  return ["4-3-3", "4-2-3-1", "3-5-2", "4-4-2", "3-4-3"];
}

function detectFormatByModule(moduleValue: string): TacticalBoardFormat | null {
  const clean = moduleValue.trim();
  if (!clean) return null;
  const formats: TacticalBoardFormat[] = ["3v3", "5v5", "7v7", "9v9", "11v11"];
  for (const f of formats) {
    if (moduleOptionsForFormat(f).includes(clean)) return f;
  }
  return null;
}

function startersLimitForPeriod(period: MatchPlanPeriodLite | null | undefined, defaultFormat: TacticalBoardFormat): number {
  const defaultLimit = playerLimitForFormat(period?.format ?? defaultFormat);
  const raw = (period?.module ?? "").trim();
  if (!raw) return defaultLimit;
  const byKnownModule = detectFormatByModule(raw);
  if (byKnownModule) return playerLimitForFormat(byKnownModule);
  const nums = raw
    .split("-")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return defaultLimit;
  const sum = nums.reduce((acc, n) => acc + n, 0);
  if ([3, 5, 7, 9, 11].includes(sum)) return sum;
  if ([3, 5, 7, 9, 11].includes(sum + 1)) return sum + 1;
  if (sum === defaultLimit || sum === defaultLimit - 1) return defaultLimit;
  return defaultLimit;
}

const MATCH_PLAN_RESERVE_MARKER_HEX = "#F59E0B";

function matchOptionPhase(match: MatchOption): "autunnale" | "primaverile" | "tornei" | "amichevoli" {
  const comp = String(match.competition ?? "").toLowerCase();
  if (comp.includes("amichev") || comp.includes("friendly")) return "amichevoli";
  if (comp.includes("torneo") || comp.includes("coppa") || comp.includes("trofeo") || comp.includes("cup")) return "tornei";
  const date = match.date ? new Date(match.date) : null;
  const month = date && !Number.isNaN(date.getTime()) ? date.getMonth() : 8;
  return month >= 7 ? "autunnale" : "primaverile";
}

function formatMatchOptionLabel(match: MatchOption) {
  const when = match.date ? new Date(match.date) : null;
  const dateLabel = when && !Number.isNaN(when.getTime())
    ? when.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })
    : "";
  const opponent = match.opponent ?? "Avversario";
  return `${dateLabel ? `${dateLabel} - ` : ""}${opponent}`;
}

function extractMatchAnnataLabel(match: MatchOption): string {
  return String(match.teamName ?? "").trim();
}

function formatMatchPhaseGroupLabel(phaseLabel: string, items: MatchOption[]) {
  const annate = Array.from(
    new Set(
      items
        .map(extractMatchAnnataLabel)
        .filter((value) => value.length > 0)
    )
  );
  return annate.length > 0 ? `${phaseLabel} - ${annate.join(" · ")}` : phaseLabel;
}

const BOARD_TYPES = ["Training", "Exercise", "Match", "Match Plan", "Set Piece", "Quick Idea"] as const;
const BOARD_TAGS = ["Pressing", "Build-up", "Transition"] as const;
const EQUIPMENT_TOOLS = ["ball", "cone", "goal", "goalLarge", "goalMini", "goal5", "goal7", "goal9", "goal11", "sagoma", "flag", "ladder", "hurdle", "pole", "vest", "disc", "cinesino", "text"] as const;
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

function normalizeBoardPlayer(raw: any): TeamPlayer | null {
  const id = Number(raw?.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    firstName: String(raw?.firstName ?? raw?.first_name ?? "").trim(),
    lastName: String(raw?.lastName ?? raw?.last_name ?? "").trim(),
    jerseyNumber:
      typeof raw?.jerseyNumber === "number" ? raw.jerseyNumber : raw?.jerseyNumber == null ? null : Number(raw.jerseyNumber),
    position: (raw?.position ?? raw?.role ?? null) as string | null,
    teamId: typeof raw?.teamId === "number" ? raw.teamId : raw?.teamId == null ? null : Number(raw.teamId),
    teamName: (raw?.teamName ?? raw?.team_name ?? null) as string | null,
    available: typeof raw?.available === "boolean" ? raw.available : null,
  };
}

function mergeRosterPlayers(base: TeamPlayer[], incoming: TeamPlayer[]) {
  const merged = new Map<number, TeamPlayer>();
  [...base, ...incoming].forEach((player) => {
    const existing = merged.get(player.id);
    merged.set(player.id, {
      ...existing,
      ...player,
      firstName: player.firstName || existing?.firstName || "",
      lastName: player.lastName || existing?.lastName || "",
      jerseyNumber: player.jerseyNumber ?? existing?.jerseyNumber ?? null,
      position: player.position ?? existing?.position ?? null,
      teamId: player.teamId ?? existing?.teamId ?? null,
      teamName: player.teamName ?? existing?.teamName ?? null,
      available: player.available ?? existing?.available ?? null,
    });
  });

  return Array.from(merged.values()).sort((a, b) => {
    const teamCompare = String(a.teamName ?? "").localeCompare(String(b.teamName ?? ""), "it");
    if (teamCompare !== 0) return teamCompare;
    const numberA = a.jerseyNumber ?? 999;
    const numberB = b.jerseyNumber ?? 999;
    if (numberA !== numberB) return numberA - numberB;
    return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "it");
  });
}

const GOAL_TOOL_VARIANTS = [
  { id: "goalMini", label: "Porticina 1m", shortLabel: "1", widthMeters: 1, heightMeters: 0.67, depthMeters: 0.38, showInMenu: false },
  { id: "goal5", label: "Small", shortLabel: "S", widthMeters: 3, heightMeters: 2, depthMeters: 1.4, showInMenu: true },
  { id: "goal7", label: "Medium", shortLabel: "M", widthMeters: 5, heightMeters: 2, depthMeters: 1.6, showInMenu: true },
  { id: "goal9", label: "Large", shortLabel: "L", widthMeters: 6, heightMeters: 2, depthMeters: 1.8, showInMenu: true },
  { id: "goal11", label: "Extra Large", shortLabel: "XL", widthMeters: 7.32, heightMeters: 2.44, depthMeters: 2, showInMenu: true },
] as const;

function goalVariantForType(type?: string) {
  if (type === "goal" || type === "goalLarge") return GOAL_TOOL_VARIANTS[3];
  return GOAL_TOOL_VARIANTS.find((g) => g.id === type);
}

const BALL_SIZE_OPTIONS = [
  { id: "small", label: "Small", shortLabel: "S", className: "h-5 w-5" },
  { id: "medium", label: "Medium", shortLabel: "M", className: "h-7 w-7" },
  { id: "large", label: "Large", shortLabel: "L", className: "h-9 w-9" },
] as const;

const LADDER_STEP_OPTIONS = [
  { id: "5", label: "5 steps", shortLabel: "5", steps: 5, className: "h-8 w-16", viewWidth: 70 },
  { id: "10", label: "10 steps", shortLabel: "10", steps: 10, className: "h-8 w-32", viewWidth: 132 },
  { id: "15", label: "15 steps", shortLabel: "15", steps: 15, className: "h-8 w-48", viewWidth: 194 },
] as const;

const HURDLE_HEIGHT_OPTIONS = [
  { id: "20", label: "20 cm", shortLabel: "20", className: "h-8 w-14", topY: 22 },
  { id: "40", label: "40 cm", shortLabel: "40", className: "h-10 w-14", topY: 15 },
  { id: "60", label: "60 cm", shortLabel: "60", className: "h-12 w-14", topY: 9 },
  { id: "80", label: "80 cm", shortLabel: "80", className: "h-14 w-14", topY: 4 },
] as const;

function equipmentFormatOptions(type?: string) {
  if (type === "ball") return BALL_SIZE_OPTIONS;
  if (type === "ladder") return LADDER_STEP_OPTIONS;
  if (type === "hurdle") return HURDLE_HEIGHT_OPTIONS;
  return [];
}

function defaultEquipmentFormat(type?: string) {
  if (type === "ball") return "medium";
  if (type === "ladder") return "5";
  if (type === "hurdle") return "40";
  return undefined;
}

function isPlayerType(type?: string): boolean {
  return PLAYER_TYPES.includes(type as (typeof PLAYER_TYPES)[number]);
}

function isEquipmentType(type?: string): boolean {
  return EQUIPMENT_TOOLS.includes(type as (typeof EQUIPMENT_TOOLS)[number]);
}

function isDrawingType(type?: string): boolean {
  return DRAWING_TYPES.includes(type as (typeof DRAWING_TYPES)[number]);
}

function defaultMarkerColor(type?: string, rosterStatus?: unknown) {
  if (type === "goalkeeper") return "#FACC15";
  if (type === "opponent") return "#EF4444";
  if (rosterStatus === "extra") return "#22C55E";
  return "#2F9CF4";
}

function markerTextColor(backgroundColor: string) {
  const normalized = backgroundColor.trim().toUpperCase();
  if (normalized === "#FACC15" || normalized === "#F8FAFC" || normalized === "#FFFFFF") return "#111827";
  if (normalized === "#F59E0B" || normalized === "#D97706") return "#111827";
  return "#FFFFFF";
}

function getPitchPoint(event: React.PointerEvent<Element> | PointerEvent, pitch: HTMLDivElement) {
  const rect = pitch.getBoundingClientRect();
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100),
    y: clamp(((event.clientY - rect.top) / rect.height) * 100),
  };
}

function stabilizedDrawingPoints(points: Array<{ x: number; y: number }>) {
  if (points.length < 4) return points;
  const filtered = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = filtered[filtered.length - 1];
    const p = points[i];
    if (Math.hypot(p.x - prev.x, p.y - prev.y) >= 1.15) filtered.push(p);
  }
  filtered.push(points[points.length - 1]);
  if (filtered.length < 4) return filtered;
  return filtered.map((p, i) => {
    if (i === 0 || i === filtered.length - 1) return p;
    const prev = filtered[i - 1];
    const next = filtered[i + 1];
    return {
      x: (prev.x + p.x * 2 + next.x) / 4,
      y: (prev.y + p.y * 2 + next.y) / 4,
    };
  });
}

function makeSmoothPath(points: Array<{ x: number; y: number }>) {
  const pts = stabilizedDrawingPoints(points);
  if (!pts.length) return "";
  if (pts.length < 3) return `M ${pts[0].x} ${pts[0].y} ${pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ")}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

const DEFAULT_ARROW_PRESET: ArrowToolPreset = {
  geometry: "freehand",
  heads: "end",
  lineStyle: "solid",
  color: "#FACC15",
};

const ARROW_COLOR_OPTIONS = [
  { label: "Giallo", value: "#FACC15" },
  { label: "Bianco", value: "#F8FAFC" },
  { label: "Rosso", value: "#EF4444" },
  { label: "Blu", value: "#38BDF8" },
  { label: "Nero", value: "#111827" },
];

const EQUIPMENT_COLOR_OPTIONS = [
  { label: "Default", value: "default" },
  { label: "Bianco", value: "#F8FAFC" },
  { label: "Giallo", value: "#FACC15" },
  { label: "Arancio", value: "#F97316" },
  { label: "Rosso", value: "#EF4444" },
  { label: "Blu", value: "#2563EB" },
  { label: "Verde", value: "#22C55E" },
  { label: "Nero", value: "#111827" },
];

const DRAW_COLOR_OPTIONS = [
  { label: "Giallo", value: "#FACC15" },
  { label: "Bianco", value: "#F8FAFC" },
  { label: "Rosso", value: "#EF4444" },
  { label: "Blu", value: "#38BDF8" },
  { label: "Verde", value: "#22C55E" },
  { label: "Nero", value: "#111827" },
];

const MARKER_COLOR_OPTIONS = [
  { label: "Blu", value: "#2F9CF4" },
  { label: "Rosso", value: "#EF4444" },
  { label: "Giallo", value: "#FACC15" },
  { label: "Verde", value: "#22C55E" },
  { label: "Viola", value: "#8B5CF6" },
  { label: "Nero", value: "#111827" },
  { label: "Bianco", value: "#F8FAFC" },
  { label: "Arancio", value: "#F97316" },
];

const ELEMENT_SCALE_OPTIONS = [
  { id: "0.85", label: "S", value: 0.85 },
  { id: "1", label: "M", value: 1 },
  { id: "1.15", label: "L", value: 1.15 },
  { id: "1.3", label: "XL", value: 1.3 },
];

const ZONE_SHAPE_OPTIONS = [
  { id: "square", label: "Quadrata" },
  { id: "circle", label: "Rotonda" },
  { id: "triangle", label: "Triangolare" },
  { id: "hexagon", label: "Esagonale" },
] as const;

function drawingElementBounds(el?: TacticalBoardElement | null) {
  const points = Array.isArray(el?.points) ? el?.points as Array<{ x: number; y: number }> : [];
  if (!points.length) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(2.5, maxX - minX),
    height: Math.max(2.5, maxY - minY),
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

function regularZoneVertices(points: Array<{ x: number; y: number }>, shape: string) {
  if (points.length > 2) return points;
  if (points.length < 2) return points;
  const [a, b] = points;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (shape === "circle") {
    return [
      { x: cx, y },
      { x: x + w, y: cy },
      { x: cx, y: y + h },
      { x, y: cy },
    ];
  }
  if (shape === "triangle") {
    return [
      { x: cx, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
  }
  if (shape === "hexagon") {
    return [
      { x: x + w * 0.25, y },
      { x: x + w * 0.75, y },
      { x: x + w, y: cy },
      { x: x + w * 0.75, y: y + h },
      { x: x + w * 0.25, y: y + h },
      { x, y: cy },
    ];
  }
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

function zonePolygonPoints(points: Array<{ x: number; y: number }>) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function buildArrowDrawShape(preset: ArrowToolPreset): string {
  const base =
    preset.geometry === "straight"
      ? "straight-arrow"
      : preset.geometry === "conduzione"
        ? "conduzione-arrow"
        : "freehand-arrow";
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
  if (String(el.drawShape ?? "").includes("conduzione")) {
    const a = points[0];
    const b = points[points.length - 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const waves = Math.max(4, Math.round(length / 3.2));
    const step = length / (waves * 2);
    const amplitude = 0.75;
    let d = `M ${a.x} ${a.y}`;
    for (let i = 0; i < waves * 2; i += 1) {
      const tMid = ((i + 0.5) * step) / length;
      const tEnd = ((i + 1) * step) / length;
      const side = i % 2 === 0 ? 1 : -1;
      const cx = a.x + dx * tMid + nx * amplitude * side;
      const cy = a.y + dy * tMid + ny * amplitude * side;
      const ex = a.x + dx * tEnd;
      const ey = a.y + dy * tEnd;
      d += ` Q ${cx} ${cy} ${ex} ${ey}`;
    }
    return d;
  }
  if (String(el.drawShape ?? "").includes("straight")) {
    const a = points[0];
    const b = points[points.length - 1];
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  }
  return makeSmoothPath(points);
}

function strokeDashForDrawing(el: TacticalBoardElement): string | undefined {
  if (String(el.drawShape ?? "").includes("conduzione")) return undefined;
  return String(el.drawShape ?? "").includes("dashed") ? "1.55 1.75" : undefined;
}

function arrowHeadPath(tip: { x: number; y: number }, from: { x: number; y: number }, size = 2.45): string {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const backX = tip.x - ux * size;
  const backY = tip.y - uy * size;
  return `M ${backX + nx * size * 0.55} ${backY + ny * size * 0.55} L ${tip.x} ${tip.y} L ${backX - nx * size * 0.55} ${backY - ny * size * 0.55}`;
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
        <button
          type="button"
          onClick={() => setArrowToolPreset((p) => ({ ...p, geometry: "conduzione", lineStyle: "solid" }))}
          className={`rounded-lg px-3 py-2 text-left text-sm ${
            arrowToolPreset.geometry === "conduzione" ? "bg-[#FACC15] text-black" : "text-white/90 hover:bg-white/10"
          }`}
        >
          Conduzione
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
      <div className="mb-2 grid gap-1">
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
          disabled={arrowToolPreset.geometry === "conduzione"}
          onClick={() => setArrowToolPreset((p) => ({ ...p, lineStyle: "dashed" }))}
          className={`rounded-lg px-3 py-2 text-left text-sm ${
            arrowToolPreset.geometry === "conduzione"
              ? "cursor-not-allowed text-white/25"
              : arrowToolPreset.lineStyle === "dashed" ? "bg-[#FACC15] text-black" : "text-white/90 hover:bg-white/10"
          }`}
        >
          Tratteggiata
        </button>
      </div>
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Colore</div>
      <div className="grid grid-cols-5 gap-1 px-1">
        {ARROW_COLOR_OPTIONS.map((c) => {
          const active = (arrowToolPreset.color ?? DEFAULT_ARROW_PRESET.color) === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => setArrowToolPreset((p) => ({ ...p, color: c.value }))}
              className={`h-8 rounded-lg border transition ${active ? "border-white bg-white/15" : "border-white/10 hover:bg-white/10"}`}
              title={c.label}
              aria-label={`Colore freccia ${c.label}`}
            >
              <span
                className="mx-auto block h-4 w-4 rounded-full border border-white/40"
                style={{ backgroundColor: c.value }}
              />
            </button>
          );
        })}
      </div>
    </>
  );
}

function ColorSwatches({
  value,
  onChange,
  ariaPrefix,
  options = DRAW_COLOR_OPTIONS,
  className = "grid grid-cols-6 gap-1 px-1",
}: {
  value: string;
  onChange: (value: string) => void;
  ariaPrefix: string;
  options?: readonly { label: string; value: string }[];
  className?: string;
}) {
  return (
    <div className={className}>
      {options.map((c) => {
        const active = value === c.value;
        return (
          <button
            key={c.value}
            type="button"
            onClick={() => onChange(c.value)}
            className={`h-8 rounded-lg border transition ${active ? "border-white bg-white/15" : "border-white/10 hover:bg-white/10"}`}
            title={c.label}
            aria-label={`${ariaPrefix} ${c.label}`}
          >
            <span className="mx-auto block h-4 w-4 rounded-full border border-white/40" style={{ backgroundColor: c.value }} />
          </button>
        );
      })}
    </div>
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

function GoalEquipmentGlyph({ type, color }: { type?: string; color?: string }) {
  const variant = goalVariantForType(type) ?? GOAL_TOOL_VARIANTS[3];
  const primary = color ?? "#f8fafc";
  const insetBySize = {
    goalMini: 6.5,
    goal5: 4.5,
    goal7: 3,
    goal9: 1.5,
    goal11: 0.8,
  } as Record<string, number>;
  const inset = insetBySize[variant.id] ?? 5.7;
  const top = inset;
  const bottom = 32 - inset;
  const netX = 6.5;
  const faceX = 22.5;
  const faceEndX = 26;

  return (
    <svg viewBox="0 0 32 32" className="h-8 w-10 overflow-visible">
      <g transform="rotate(90 16 16)">
        <rect
          x={netX}
          y={top}
          width={faceX - netX}
          height={bottom - top}
          fill="rgba(248,250,252,0.08)"
          stroke={primary}
          strokeWidth="1.2"
        />
        {[1, 2, 3].map((line) => (
          <React.Fragment key={line}>
            <path d={`M ${netX} ${top + ((bottom - top) / 4) * line} H ${faceX}`} stroke="#d9f99d" strokeWidth="0.55" opacity="0.76" />
            <path d={`M ${netX + ((faceX - netX) / 4) * line} ${top} V ${bottom}`} stroke="#d9f99d" strokeWidth="0.5" opacity="0.68" />
          </React.Fragment>
        ))}
        <path
          d={`M ${faceX} ${top - 0.9} H ${faceEndX} A 1.1 1.1 0 0 1 ${faceEndX} ${top + 1.3} V ${bottom - 1.3} A 1.1 1.1 0 0 1 ${faceEndX} ${bottom + 0.9} H ${faceX} A 1.1 1.1 0 0 1 ${faceX} ${bottom - 1.3} V ${top + 1.3} A 1.1 1.1 0 0 1 ${faceX} ${top - 0.9} Z`}
          fill={primary}
        />
      </g>
    </svg>
  );
}

function FieldGoalEquipment({
  type,
  color,
}: {
  type?: string;
  color?: string;
}) {
  const variant = goalVariantForType(type) ?? GOAL_TOOL_VARIANTS[3];
  const postStroke = variant.id === "goalMini" ? 5.2 : 4.2;
  const primary = color ?? "#f8fafc";
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" preserveAspectRatio="none" style={{ overflow: "visible" }}>
      <rect
        x="0"
        y="0"
        width="72"
        height="100"
        fill="rgba(248,250,252,0.08)"
        stroke={primary}
        strokeWidth={variant.id === "goalMini" ? 3.2 : 2.4}
      />
      {[1, 2, 3, 4, 5].map((line) => (
        <React.Fragment key={line}>
          <path d={`M 0 ${(100 / 6) * line} H 72`} stroke="#d9f99d" strokeWidth="1.3" opacity="0.72" />
          {line <= 3 && <path d={`M ${18 * line} 0 V 100`} stroke="#d9f99d" strokeWidth="1.15" opacity="0.62" />}
        </React.Fragment>
      ))}
      <path
        d={`M 72 ${-postStroke / 2} H 86 A ${postStroke / 2} ${postStroke / 2} 0 0 1 86 ${postStroke / 2} V ${100 - postStroke / 2} A ${postStroke / 2} ${postStroke / 2} 0 0 1 86 ${100 + postStroke / 2} H 72 A ${postStroke / 2} ${postStroke / 2} 0 0 1 72 ${100 - postStroke / 2} V ${postStroke / 2} A ${postStroke / 2} ${postStroke / 2} 0 0 1 72 ${-postStroke / 2} Z`}
        fill={primary}
      />
    </svg>
  );
}

function EquipmentGlyph({
  type,
  color,
  format,
  fontSize,
  fontWeight,
  label,
  textWidth,
  textHeight,
  textAlign,
  textVerticalAlign,
}: {
  type?: string;
  color?: string;
  format?: string;
  fontSize?: number;
  fontWeight?: string;
  label?: string;
  textWidth?: number;
  textHeight?: number;
  textAlign?: "left" | "center" | "right";
  textVerticalAlign?: "top" | "middle" | "bottom";
}) {
  const primary = color;
  if (type === "ball") {
    const fill = primary ?? "#f8fafc";
    const ink = fill === "#111827" ? "#f8fafc" : "#111827";
    const ballSize = BALL_SIZE_OPTIONS.find((option) => option.id === (format ?? defaultEquipmentFormat(type))) ?? BALL_SIZE_OPTIONS[1];
    return (
      <svg viewBox="0 0 32 32" className={ballSize.className}>
        <circle cx="16" cy="16" r="12.2" fill={fill} stroke={ink} strokeWidth="1.7" />
        <path d="M7.8 8.2c4.6-.8 10.8.5 16.4 4.5" fill="none" stroke={ink} strokeWidth="1.9" strokeLinecap="round" />
        <path d="M5.5 14.3c5.9-1.6 12.3-.5 17.6 4.5" fill="none" stroke={ink} strokeWidth="1.9" strokeLinecap="round" />
        <path d="M10.4 25.4c-2.7-5.4-2.3-10.5.6-15.5" fill="none" stroke={ink} strokeWidth="1.9" strokeLinecap="round" />
        <path d="M16.6 27.5c-3.6-5.9-3.9-11.8-.8-17.7" fill="none" stroke={ink} strokeWidth="1.9" strokeLinecap="round" />
        <path d="M24.5 7.7c-.2 5.7-3.3 10-8.7 12" fill="none" stroke={ink} strokeWidth="1.9" strokeLinecap="round" />
        <path d="M27.2 14.3c-1.9 5.2-5.6 8.7-11 10.5" fill="none" stroke={ink} strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "cone") {
    const fill = primary ?? "#f8fafc";
    const ink = fill === "#111827" ? "#f8fafc" : "#111827";
    return (
      <svg viewBox="0 0 48 48" className="h-10 w-10">
        <path d="M17.2 34.2 21 9.8h6l3.8 24.4c-3.35 1.9-10.25 1.9-13.6 0Z" fill={fill} stroke={ink} strokeWidth="0.8" strokeLinejoin="round" />
        <ellipse cx="24" cy="9.8" rx="2.45" ry="0.95" fill={ink} opacity="0.82" />
      </svg>
    );
  }

  if (type === "goalLarge" || type === "goal" || goalVariantForType(type)) {
    return <GoalEquipmentGlyph type={type} color={primary} />;
  }

  if (type === "sagoma") {
    const fill = primary ?? "#2563eb";
    return (
      <svg viewBox="0 0 40 58" className="h-11 w-8">
        <circle cx="20" cy="10" r="6.5" fill={fill} stroke="#dbeafe" strokeWidth="1.4" />
        <path d="M13.5 21h13l3.5 25H10l3.5-25Z" fill={fill} stroke="#dbeafe" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M12 49.5h16" stroke="#dbeafe" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "flag") {
    const fill = primary ?? "#fde047";
    return (
      <svg viewBox="0 0 38 58" className="h-11 w-8 drop-shadow-lg">
        <path d="M10 7v43" stroke="#713f12" strokeWidth="3" strokeLinecap="round" />
        <path d="M11 8c8-5 13 4 21 0v20c-8 4-13-5-21 0V8Z" fill={fill} stroke="#a16207" strokeWidth="2" />
        <circle cx="10" cy="51" r="4" fill="#713f12" />
      </svg>
    );
  }

  if (type === "ladder") {
    const stroke = primary ?? "#f8fafc";
    const ladder = LADDER_STEP_OPTIONS.find((option) => option.id === (format ?? defaultEquipmentFormat(type))) ?? LADDER_STEP_OPTIONS[0];
    const unitGap = 10;
    const railStart = 8;
    const railEnd = railStart + unitGap * ladder.steps;
    const rungs = Array.from({ length: Math.max(1, ladder.steps - 1) }, (_, i) => railStart + unitGap * (i + 1));
    return (
      <svg viewBox={`0 0 ${ladder.viewWidth} 34`} className={ladder.className}>
        <path d={`M${railStart} 8h${railEnd - railStart}M${railStart} 26h${railEnd - railStart}`} stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
        {rungs.map((x) => <path key={x} d={`M${x} 8v18`} stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />)}
      </svg>
    );
  }

  if (type === "hurdle") {
    const stroke = primary ?? "#f8fafc";
    const hurdle = HURDLE_HEIGHT_OPTIONS.find((option) => option.id === (format ?? defaultEquipmentFormat(type))) ?? HURDLE_HEIGHT_OPTIONS[1];
    return (
      <svg viewBox="0 0 58 42" className={hurdle.className}>
        <path d={`M12 33V${hurdle.topY}h34v${33 - hurdle.topY}`} fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 33h11M39 33h11" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "pole") {
    const stroke = primary ?? "#facc15";
    return (
      <svg viewBox="0 0 24 68" className="h-12 w-5">
        <path d="M12 6v56" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M7 63h10" stroke="#f8fafc" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M12 18h0M12 31h0M12 44h0" stroke="#f8fafc" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "vest") {
    const stroke = primary ?? "#fde047";
    return (
      <svg viewBox="0 0 50 52" className="h-10 w-10 drop-shadow-sm">
        <ellipse cx="25" cy="28" rx="15.5" ry="7.2" fill="none" stroke={stroke} strokeWidth="3" />
        <path d="M11.2 28.5c3.2 4.3 24.4 4.3 27.6 0" fill="none" stroke="#f8fafc" strokeWidth="1" opacity="0.45" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "disc" || type === "cinesino") {
    const fill = primary ?? "#f8fafc";
    return (
      <svg viewBox="0 0 48 26" className="h-6 w-10 drop-shadow-sm">
        <path d="M9.2 16.1C11.4 9.9 16.9 6.9 24 6.9s12.6 3 14.8 9.2C35.5 22 12.5 22 9.2 16.1Z" fill={fill} stroke="#111827" strokeWidth="0.85" strokeLinejoin="round" />
        <ellipse cx="24" cy="7.9" rx="5.2" ry="2.1" fill="#0f172a" stroke="#f8fafc" strokeWidth="0.45" />
      </svg>
    );
  }

  if (type === "text") {
    return (
      <div
        className="flex min-w-8 max-w-[420px] whitespace-pre-wrap break-words rounded-lg border-2 bg-black/30 px-2 py-1 text-lg font-black leading-tight shadow-lg"
        style={{
          borderColor: primary ?? "#f8fafc",
          color: primary ?? "#f8fafc",
          fontFamily: format,
          fontSize: fontSize ? `${fontSize}px` : undefined,
          fontWeight: fontWeight ?? undefined,
          width: textWidth ? `${textWidth}px` : undefined,
          minHeight: textHeight ? `${textHeight}px` : "34px",
          textAlign: textAlign ?? "center",
          alignItems: textVerticalAlign === "top" ? "flex-start" : textVerticalAlign === "bottom" ? "flex-end" : "center",
          justifyContent: textAlign === "left" ? "flex-start" : textAlign === "right" ? "flex-end" : "center",
        }}
      >
        {label || "T"}
      </div>
    );
  }

  return <div className="h-8 w-8 rounded-full bg-white/80 shadow-lg" />;
}

function DrawingToolGlyph({ type }: { type: string }) {
  const stroke = "#FACC15";
  const muted = "#E2E8F0";
  const glow = "rgba(250,204,21,0.16)";

  if (type === "movement") {
    return (
      <svg viewBox="0 0 44 44" className="h-9 w-9">
        <path d="M7 31c8.8-16 20.8-16.5 30-3.8" fill="none" stroke={glow} strokeWidth="7" strokeLinecap="round" />
        <path d="M7 31c8.8-16 20.8-16.5 30-3.8" fill="none" stroke={stroke} strokeWidth="3.4" strokeLinecap="round" />
        <path d="M34.5 19.4 38.3 27 30 27.4" fill="none" stroke={stroke} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "draw") {
    return (
      <svg viewBox="0 0 44 44" className="h-9 w-9">
        <path d="M13 31 28.6 12.8l5 4.2L18 35.2 12 37Z" fill="rgba(250,204,21,0.16)" stroke={stroke} strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M26.8 15 31.8 19.2" stroke={muted} strokeWidth="2" strokeLinecap="round" />
        <path d="M12 37 14 31" stroke={muted} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "zones") {
    return (
      <svg viewBox="0 0 44 44" className="h-9 w-9">
        <rect x="8" y="10" width="28" height="23" rx="3" fill={glow} stroke={stroke} strokeWidth="2.8" />
        <path d="M22 10v23M8 21.5h28" stroke={muted} strokeWidth="1.55" opacity="0.9" />
        <circle cx="22" cy="21.5" r="4.6" fill="none" stroke={muted} strokeWidth="1.25" opacity="0.7" />
      </svg>
    );
  }

  if (type === "text") {
    return (
      <svg viewBox="0 0 44 44" className="h-9 w-9">
        <rect x="9" y="9" width="26" height="26" rx="5" fill="rgba(248,250,252,0.08)" stroke={muted} strokeWidth="1.6" />
        <path d="M14.5 16.5h15M22 16.5v14" stroke={stroke} strokeWidth="3.6" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "measure") {
    return (
      <svg viewBox="0 0 44 44" className="h-9 w-9">
        <path d="M8 28 28 8l8 8-20 20-8-8Z" fill="rgba(248,250,252,0.08)" stroke={stroke} strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M15 27 12.6 24.6M19 23l-2.4-2.4M23 19l-2.4-2.4M27 15l-2.4-2.4M31 17l-3 3" stroke={muted} strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  return <PencilLine size={20} />;
}

const QuickPage = () => {
  const { club, user } = useAuth();
  const { data: allTeams } = useListTeams();
  const { data: allPlayersData } = useListPlayers();
  const [assignmentTeamId, setAssignmentTeamId] = useState<string>("");
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
  const initialBoardTitleFromQuery = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("matchTitle")?.trim() || null;
  }, []);
  const initialMatchIdFromQuery = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return parseNumericId(params.get("matchId"));
  }, []);
  const initialPeriodKeyFromQuery = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get("periodKey");
    return key === "t1" || key === "t2" || key === "t3" || key === "t4" ? key : "t1";
  }, []);
  const isMatchPlanBoard = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("source") === "match-plan";
  }, []);
  const initialConvocatiIds = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("convocati");
    if (!raw) return [] as number[];
    return raw.split(",").map((x) => Number(x)).filter((n) => Number.isFinite(n));
  }, []);
  const returnToMatchUrl = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("returnTo");
    if (raw) {
      try {
        const target = new URL(raw, window.location.origin);
        if (target.origin === window.location.origin && target.pathname.startsWith("/calendari/")) {
          return `${target.pathname}${target.search}${target.hash}`;
        }
      } catch {
        if (raw.startsWith("/calendari/")) return raw;
      }
    }
    const source = params.get("source");
    const teamId = parseNumericId(params.get("teamId"));
    const matchId = parseNumericId(params.get("matchId"));
    if (source === "match-plan" && teamId && matchId) {
      const phase = params.get("phase");
      const phaseQuery =
        phase === "autunnale" || phase === "primaverile" || phase === "tornei" || phase === "amichevoli"
          ? `&phase=${phase}`
          : "";
      return `/calendari/${teamId}?openMatchId=${matchId}${phaseQuery}`;
    }
    if (teamId && params.get("convocati")) {
      return `/calendari/${teamId}`;
    }
    return null;
  }, []);
  const goBackFromBoard = () => {
    if (returnToMatchUrl) {
      window.location.href = returnToMatchUrl;
      return;
    }
    window.history.back();
  };

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const showRightSidebar = false;
  const [focusMode, setFocusMode] = useState(false);
  const [activeTool, setActiveTool] = useState("player");
  const [saveState, setSaveState] = useState("Saved");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(initialPresetFromQuery ?? "4-3-3");
  const [boardTitle, setBoardTitle] = useState(initialBoardTitleFromQuery ?? "Nuova lavagna");
  const [currentBoardId, setCurrentBoardId] = useState<number | null>(null);
  const [boardTeamId, setBoardTeamId] = useState<number | null>(initialTeamIdFromQuery);
  const [boardMode, setBoardMode] = useState<"assigned" | "free">(initialTeamIdFromQuery ? "assigned" : "free");
  const [boardClubId, setBoardClubId] = useState<number | null>(parseNumericId((club as any)?.id));
  const [boardCategory, setBoardCategory] = useState<string | null>(null);
  const [boardFormat, setBoardFormat] = useState<TacticalBoardFormat>("11v11");
  const [boardType, setBoardType] = useState<(typeof BOARD_TYPES)[number]>("Training");
  const [boardNotes, setBoardNotes] = useState("Obiettivo: attirare la prima pressione e uscire sul lato debole con la mezzala dentro.");
  const [activeBoardAction, setActiveBoardAction] = useState<BoardActionPanel>("load");
  const [matchPeriodKey, setMatchPeriodKey] = useState<"t1" | "t2" | "t3" | "t4">(initialPeriodKeyFromQuery);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(initialMatchIdFromQuery);
  const [matchPlanPlayerId, setMatchPlanPlayerId] = useState<string>("");
  const [matchSheetSaveHint, setMatchSheetSaveHint] = useState<string | null>(null);
  const [replacingElementIndex, setReplacingElementIndex] = useState<number | null>(null);
  const [matchOptions, setMatchOptions] = useState<MatchOption[]>([]);
  const [matchCallups, setMatchCallups] = useState<MatchCallupItem[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [bottomMenu, setBottomMenu] = useState<"players" | "equipment" | "drawing" | "library">("players");
  const [showMetricGrid, setShowMetricGrid] = useState(true);
  const [showFieldMarkings, setShowFieldMarkings] = useState(true);
  const [pendingRosterPlayerId, setPendingRosterPlayerId] = useState<number | null>(null);
  const [freeMenuOpen, setFreeMenuOpen] = useState(false);
  const [arrowMenuOpen, setArrowMenuOpen] = useState(false);
  const [drawMenuOpen, setDrawMenuOpen] = useState(false);
  const [textMenuOpen, setTextMenuOpen] = useState(false);
  const [zoneMenuOpen, setZoneMenuOpen] = useState(false);
  const [measureMenuOpen, setMeasureMenuOpen] = useState(false);
  const [goalMenuOpen, setGoalMenuOpen] = useState(false);
  const [fieldElementMenuOpen, setFieldElementMenuOpen] = useState(false);
  const [markerPanel, setMarkerPanel] = useState<FieldElementPanel | null>(null);
  const [selectedGoalTool, setSelectedGoalTool] = useState<(typeof GOAL_TOOL_VARIANTS)[number]["id"]>("goal9");
  const [equipmentColor, setEquipmentColor] = useState("default");
  const [arrowToolPreset, setArrowToolPreset] = useState<ArrowToolPreset>(DEFAULT_ARROW_PRESET);
  const [drawToolPreset, setDrawToolPreset] = useState({ color: "#FACC15", lineWidth: 2 });
  const [textToolPreset, setTextToolPreset] = useState({ color: "#F8FAFC", fontFamily: "Arial", fontSize: 16, bold: true });
  const [zoneToolPreset, setZoneToolPreset] = useState<{ color: string; shape: (typeof ZONE_SHAPE_OPTIONS)[number]["id"] }>({ color: "#FACC15", shape: "square" });
  const [measureToolPreset, setMeasureToolPreset] = useState({ color: "#F8FAFC", textSize: 2.35 });
  const movementToolShellRef = useRef<HTMLDivElement>(null);
  const drawToolShellRef = useRef<HTMLDivElement>(null);
  const textToolShellRef = useRef<HTMLDivElement>(null);
  const zoneToolShellRef = useRef<HTMLDivElement>(null);
  const measureToolShellRef = useRef<HTMLDivElement>(null);
  const goalToolShellRef = useRef<HTMLDivElement>(null);
  const [arrowMenuViewport, setArrowMenuViewport] = useState<{ top: number; left: number; width: number } | null>(null);
  const [drawMenuViewport, setDrawMenuViewport] = useState<{ top: number; left: number; width: number } | null>(null);
  const [textMenuViewport, setTextMenuViewport] = useState<{ top: number; left: number; width: number } | null>(null);
  const [zoneMenuViewport, setZoneMenuViewport] = useState<{ top: number; left: number; width: number } | null>(null);
  const [measureMenuViewport, setMeasureMenuViewport] = useState<{ top: number; left: number; width: number } | null>(null);
  const [goalMenuViewport, setGoalMenuViewport] = useState<{ top: number; left: number; width: number } | null>(null);

  const closeToolPopovers = React.useCallback(() => {
    setFreeMenuOpen(false);
    setArrowMenuOpen(false);
    setDrawMenuOpen(false);
    setTextMenuOpen(false);
    setZoneMenuOpen(false);
    setMeasureMenuOpen(false);
    setGoalMenuOpen(false);
  }, []);

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

  useLayoutEffect(() => {
    if (!goalMenuOpen) {
      setGoalMenuViewport(null);
      return;
    }
    const el = goalToolShellRef.current;
    if (!el) return;
    const place = () => {
      const r = el.getBoundingClientRect();
      const width = Math.max(112, r.width);
      let top = r.bottom + 6;
      let left = r.left;
      const maxH = Math.min(window.innerHeight * 0.7, 360);
      if (top + maxH > window.innerHeight - 8) {
        top = Math.max(8, r.top - 6 - maxH);
      }
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8);
      }
      setGoalMenuViewport({ top, left, width });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [goalMenuOpen]);

  useLayoutEffect(() => {
    const configs = [
      { open: drawMenuOpen, ref: drawToolShellRef, set: setDrawMenuViewport, width: 230 },
      { open: textMenuOpen, ref: textToolShellRef, set: setTextMenuViewport, width: 250 },
      { open: zoneMenuOpen, ref: zoneToolShellRef, set: setZoneMenuViewport, width: 250 },
      { open: measureMenuOpen, ref: measureToolShellRef, set: setMeasureMenuViewport, width: 230 },
    ] as const;
    const active = configs.find((cfg) => cfg.open);
    if (!active) {
      setDrawMenuViewport(null);
      setTextMenuViewport(null);
      setZoneMenuViewport(null);
      setMeasureMenuViewport(null);
      return;
    }
    const el = active.ref.current;
    if (!el) return;
    const place = () => {
      const r = el.getBoundingClientRect();
      const width = Math.max(active.width, r.width);
      let top = r.bottom + 6;
      let left = r.left;
      const maxH = Math.min(window.innerHeight * 0.7, 420);
      if (top + maxH > window.innerHeight - 8) top = Math.max(8, r.top - 6 - maxH);
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
      active.set({ top, left, width });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [drawMenuOpen, textMenuOpen, zoneMenuOpen, measureMenuOpen]);

  const [selectedElementIndex, setSelectedElementIndex] = useState<number | null>(null);
  const [selectedElementIndexes, setSelectedElementIndexes] = useState<number[]>([]);

  
  const [boards, setBoards] = useState<any[]>([]);
  const [boardsError, setBoardsError] = useState<string | null>(null);
  const [elements, setElements] = useState<TacticalBoardElement[]>([]);
  const effectiveTeamId = boardMode === "assigned" ? boardTeamId : null;
  const { players: fetchedTeamPlayers } = useTeamPlayers(effectiveTeamId);
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([]);
  const [freeRosterPlayers, setFreeRosterPlayers] = useState<TeamPlayer[]>([]);
  const didHydrateBoardFromUrlRef = React.useRef(false);
  /** Per lavagna non salvata: finché è false, all'apertura di «Prepara partita» la partita resta «nessuna»; dopo la prima scelta nel menu resta fino a nuova lavagna / sessione o caricamento da libreria. */
  const matchPrepBindingCommittedRef = React.useRef(Boolean(initialMatchIdFromQuery || isMatchPlanBoard));

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
      setBoardType(BOARD_TYPES.includes(data.boardType as any) ? data.boardType as (typeof BOARD_TYPES)[number] : "Training");
      setBoardNotes(typeof data.notes === "string" ? data.notes : "");
      setSelectedMatchId(parseNumericId(data.matchId) ?? null);
      matchPrepBindingCommittedRef.current = true;
      if (data.matchPeriodKey === "t1" || data.matchPeriodKey === "t2" || data.matchPeriodKey === "t3" || data.matchPeriodKey === "t4") {
        setMatchPeriodKey(data.matchPeriodKey);
      }
      setSelectedPreset(data.preset ?? null);
      setActiveTool(data.activeTool ?? "player");
      setFocusMode(data.focusMode ?? false);
      const ap = data.arrowToolPreset;
      if (
        ap &&
        typeof ap === "object" &&
        (ap.geometry === "freehand" || ap.geometry === "straight" || ap.geometry === "conduzione") &&
        (ap.heads === "none" || ap.heads === "end" || ap.heads === "start" || ap.heads === "both") &&
        (ap.lineStyle === "solid" || ap.lineStyle === "dashed")
      ) {
        setArrowToolPreset({
          geometry: ap.geometry,
          heads: ap.heads,
          lineStyle: ap.lineStyle,
          color: typeof ap.color === "string" ? ap.color : DEFAULT_ARROW_PRESET.color,
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
    if (isMatchPlanBoard) setActiveBoardAction("match");
  }, [isMatchPlanBoard]);

  React.useEffect(() => {
    let cancelled = false;
    const loadMatches = async () => {
      try {
        const allTeamsSafe = Array.isArray(allTeams) ? allTeams : [];
        const currentUserId = parseNumericId((user as any)?.id);
        const assignedForMember = currentUserId
          ? allTeamsSafe.filter((team: any) =>
              Array.isArray(team?.assignedStaff) &&
              team.assignedStaff.some((member: any) => parseNumericId(member?.userId) === currentUserId)
            )
          : [];
        const visibleTeams = assignedForMember.length > 0 ? assignedForMember : allTeamsSafe;
        const visibleTeamIds = visibleTeams
          .map((team: any) => parseNumericId(team?.id))
          .filter((id): id is number => id !== null);

        if (visibleTeamIds.length === 0) {
          if (!cancelled) setMatchOptions([]);
          return;
        }

        const rows = await Promise.all(
          visibleTeamIds.map(async (teamId) => {
            const res = await fetch(withApi(`/api/matches?teamId=${teamId}`), { credentials: "include" });
            if (!res.ok) return [] as MatchOption[];
            const data = await res.json();
            return Array.isArray(data) ? data : [];
          })
        );

        const merged = new Map<number, MatchOption>();
        rows.flat().forEach((match) => {
          const id = parseNumericId((match as any)?.id);
          if (!id) return;
          merged.set(id, match);
        });
        if (!cancelled) setMatchOptions(Array.from(merged.values()));
      } catch {
        if (!cancelled) setMatchOptions([]);
      }
    };
    loadMatches();
    return () => {
      cancelled = true;
    };
  }, [allTeams, user]);

  const loadMatchCallups = React.useCallback(async (matchId: number) => {
    try {
      const res = await fetch(withApi(`/api/matches/${matchId}/callups`), { credentials: "include" });
      if (!res.ok) {
        setMatchCallups([]);
        return;
      }
      const data = await res.json();
      setMatchCallups(Array.isArray(data) ? data : []);
    } catch {
      setMatchCallups([]);
    }
  }, []);

  React.useEffect(() => {
    if (!selectedMatchId) {
      setMatchCallups([]);
      return;
    }
    loadMatchCallups(selectedMatchId);
  }, [loadMatchCallups, selectedMatchId]);

  React.useEffect(() => {
    if (!selectedMatchId) return;
    const refresh = () => {
      loadMatchCallups(selectedMatchId);
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [loadMatchCallups, selectedMatchId]);

  React.useEffect(() => {
    if (!freeMenuOpen && !arrowMenuOpen && !drawMenuOpen && !textMenuOpen && !zoneMenuOpen && !measureMenuOpen && !goalMenuOpen) return;
    const close = () => {
      closeToolPopovers();
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [arrowMenuOpen, closeToolPopovers, drawMenuOpen, freeMenuOpen, goalMenuOpen, measureMenuOpen, textMenuOpen, zoneMenuOpen]);

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
    setTeamPlayers([...fetchedTeamPlayers].sort(compareTeamPlayersByRole));
  }, [fetchedTeamPlayers]);

  React.useEffect(() => {
    if (boardMode === "free") return;
    if (!teamPlayers.length) return;
    if (isMatchPlanBoard) return;
    setElements((prev) => assignPlayersToElements(prev, teamPlayers));
  }, [boardMode, isMatchPlanBoard, teamPlayers]);

  React.useEffect(() => {
    if (!initialPresetFromQuery) return;
    applyPreset(initialPresetFromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardFormat]);

  React.useEffect(() => {
    if (!initialConvocatiIds.length || !fetchedTeamPlayers.length) return;
    const convSet = new Set(initialConvocatiIds);
    const convoked = fetchedTeamPlayers
      .filter((p) => convSet.has(p.id))
      .sort(compareTeamPlayersByRole);
    const prioritized = [
      ...convoked,
      ...fetchedTeamPlayers.filter((p) => !convSet.has(p.id)).sort(compareTeamPlayersByRole),
    ];
    setTeamPlayers(prioritized);
  }, [initialConvocatiIds, fetchedTeamPlayers, isMatchPlanBoard]);

  React.useEffect(() => {
    if (!selectedPreset || !isFormationPresetId(selectedPreset)) return;
    if (FORMATIONS[selectedPreset].formats.includes(boardFormat)) return;
    setSelectedPreset(null);
  }, [boardFormat, selectedPreset]);

  const pitchRef = React.useRef<HTMLDivElement | null>(null);
  const isDraggingRef = React.useRef(false);
  const skipNextPitchClickRef = React.useRef(false);

  const assignedTeams = React.useMemo(() => Array.isArray(allTeams) ? allTeams : [], [allTeams]);
  const fallbackAssignedTeam = assignedTeams[0] ?? null;
  const assignedTeamIds = React.useMemo(
    () => assignedTeams
      .map((team: any) => parseNumericId(team?.id))
      .filter((id): id is number => id !== null),
    [assignedTeams]
  );
  const allRosterPlayers = React.useMemo(
    () => (Array.isArray(allPlayersData) ? allPlayersData : []).map(normalizeBoardPlayer).filter((p): p is TeamPlayer => Boolean(p)),
    [allPlayersData]
  );
  React.useEffect(() => {
    let cancelled = false;

    if (!assignedTeamIds.length) {
      setFreeRosterPlayers(allRosterPlayers);
      return;
    }

    const loadFreeRosterMembers = async () => {
      try {
        const teamMembers = await Promise.all(
          assignedTeamIds.map(async (teamId) => {
            const res = await fetch(withApi(`/api/teams/${teamId}/members`), { credentials: "include" });
            if (!res.ok) return [] as TeamPlayer[];
            const rows = await res.json();
            const team = assignedTeams.find((item: any) => parseNumericId(item?.id) === teamId);
            return (Array.isArray(rows) ? rows : [])
              .map((row) => normalizeBoardPlayer({ ...row, teamId, teamName: team?.name ?? row?.teamName }))
              .filter((p): p is TeamPlayer => Boolean(p));
          })
        );

        if (!cancelled) {
          setFreeRosterPlayers(mergeRosterPlayers(allRosterPlayers, teamMembers.flat()));
        }
      } catch (error) {
        console.error("Errore caricamento rosa libera", error);
        if (!cancelled) setFreeRosterPlayers(allRosterPlayers);
      }
    };

    loadFreeRosterMembers();

    return () => {
      cancelled = true;
    };
  }, [allRosterPlayers, assignedTeamIds, assignedTeams]);

  const playerAssignmentOptions = boardMode === "assigned" ? teamPlayers : freeRosterPlayers;
  const freeAssignmentTeams = React.useMemo(() => {
    const teamsById = new Map<string, { id: string; name: string; playerCount: number }>();

    assignedTeams.forEach((team: any) => {
      const id = parseNumericId(team?.id);
      if (id === null) return;
      teamsById.set(String(id), {
        id: String(id),
        name: String(team?.name ?? team?.displayName ?? `Squadra ${id}`),
        playerCount: 0,
      });
    });

    freeRosterPlayers.forEach((player) => {
      if (player.teamId == null) return;
      const id = String(player.teamId);
      const current = teamsById.get(id);
      teamsById.set(id, {
        id,
        name: String(player.teamName ?? current?.name ?? `Squadra ${id}`),
        playerCount: (current?.playerCount ?? 0) + 1,
      });
    });

    return Array.from(teamsById.values())
      .filter((team) => team.playerCount > 0)
      .sort((a, b) => a.name.localeCompare(b.name, "it"));
  }, [assignedTeams, freeRosterPlayers]);
  const shouldChooseAssignmentTeam = boardMode === "free" && freeAssignmentTeams.length > 1;
  const activeAssignmentTeamId =
    shouldChooseAssignmentTeam && freeAssignmentTeams.some((team) => team.id === assignmentTeamId)
      ? assignmentTeamId
      : freeAssignmentTeams[0]?.id ?? "";
  const visiblePlayerAssignmentOptions = shouldChooseAssignmentTeam
    ? playerAssignmentOptions.filter((player) => String(player.teamId ?? "") === activeAssignmentTeamId)
    : playerAssignmentOptions;

  React.useEffect(() => {
    if (!shouldChooseAssignmentTeam) {
      setAssignmentTeamId("");
      return;
    }
    if (!freeAssignmentTeams.some((team) => team.id === assignmentTeamId)) {
      setAssignmentTeamId(freeAssignmentTeams[0]?.id ?? "");
    }
  }, [assignmentTeamId, freeAssignmentTeams, shouldChooseAssignmentTeam]);

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
    setAssignmentTeamId("");
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
    setAssignmentTeamId("");
    setTeamPlayers([]);
    setSelectedPreset(null);
    setElements([]);
    closeToolPopovers();
    setSaveState("Unsaved");
  };

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
    { id: "load" as const, label: "Carica", icon: Folder },
    { id: "create" as const, label: "Crea", icon: Play },
    { id: "exercise" as const, label: "Esercitazione", icon: Upload },
    { id: "tactics" as const, label: "Tattica", icon: MoreHorizontal },
    { id: "match" as const, label: "Prepara partita", icon: Calendar },
  ];
  const drawingTools = [
    { id: "draw", label: "Disegno", icon: PencilLine },
    { id: "movement", label: "Freccia", icon: ArrowRight },
    { id: "zones", label: "Zona campo", icon: Square },
    { id: "text", label: "Testo", icon: Type },
    { id: "measure", label: "Misura", icon: Ruler },
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
    measure: "Misura",
    player: "Giocatore 1",
    opponent: "Giocatore 2",
    goalkeeper: "Portiere",
    ball: "Palla",
    cone: "Cono",
    goalLarge: "Porta",
    goalMini: "Porticina 1m",
    goal5: "Small",
    goal7: "Medium",
    goal9: "Large",
    goal11: "Extra Large",
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
    { id: "goalMenu", label: "Porta" },
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
  const selectedRotation = selectedElement ? Math.round(Number(selectedElement.rotation ?? 0)) : 0;
  const selectedDrawingBounds = drawingElementBounds(selectedElement);
  const selectedElements = selectedElementIndexes
    .map((idx) => elements[idx])
    .filter(Boolean);
  const usedPlayerIds = new Set(
    elements
      .map((el) => el.playerId)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  );
  const canEditPlayerMarker = selectedElement ? isPlayerType(selectedElement.type) : false;
  const canAssignRealPlayer = selectedElement?.type === "player" || selectedElement?.type === "goalkeeper";
  const isSelectedMeasure = String(selectedElement?.drawShape ?? "") === "measure-line";
  const isSelectedTextElement = selectedElement?.type === "text";
  const selectedGoalVariant = goalVariantForType(selectedElement?.type);
  const selectedEquipmentFormats = selectedElement ? equipmentFormatOptions(selectedElement.type) : [];
  const compactElementToolItems = selectedElement
    ? [
        ...(canAssignRealPlayer ? [{ id: "assign" as const, label: "Giocatore", icon: UserPlus }] : []),
        ...(canEditPlayerMarker ? [
          { id: "text" as const, label: "Testo", icon: Type },
          { id: "number" as const, label: "Numero", icon: Hash },
          { id: "color" as const, label: "Colore", icon: Palette },
        ] : []),
        ...(isEquipmentType(selectedElement.type) && !isSelectedTextElement ? [{ id: "color" as const, label: "Colore", icon: Palette }] : []),
        ...(isDrawingType(selectedElement.type) && selectedElement.type !== "zone" && !isSelectedMeasure && !isSelectedTextElement ? [
          ...((selectedElement.type === "arrow" || selectedElement.type === "bezierarrow") ? [{ id: "arrow" as const, label: "Freccia", icon: ArrowRight }] : []),
          { id: "color" as const, label: "Colore", icon: Palette },
        ] : []),
        ...(selectedElement.type === "zone" ? [
          { id: "shape" as const, label: "Forma", icon: Square },
          { id: "color" as const, label: "Colore", icon: Palette },
        ] : []),
        ...(isSelectedMeasure ? [
          { id: "measure" as const, label: "Formato", icon: Package },
          { id: "color" as const, label: "Colore", icon: Palette },
        ] : []),
        ...(isSelectedTextElement ? [
          { id: "text" as const, label: "Testo", icon: Type },
        ] : []),
        ...(!isSelectedTextElement && !isSelectedMeasure ? [{ id: "format" as const, label: "Formato", icon: Package }] : []),
        ...(!isDrawingType(selectedElement.type) ? [{ id: "rotate" as const, label: "Ruota", icon: RotateCcw }] : []),
      ]
    : [];
  const activePanelIndex = Math.max(0, compactElementToolItems.findIndex((item) => item.id === markerPanel));
  const markerPanelOffsetClass =
    activePanelIndex === 0 ? "mt-0" :
    activePanelIndex === 1 ? "mt-[2.125rem]" :
    activePanelIndex === 2 ? "mt-[4.25rem]" :
    activePanelIndex === 3 ? "mt-[6.375rem]" :
    activePanelIndex === 4 ? "mt-[8.5rem]" :
    activePanelIndex === 5 ? "mt-[10.625rem]" :
    "mt-[12.75rem]";
  const markerPanelWidthClass =
    markerPanel === "assign" ? "w-60" :
    markerPanel === "color" ? "w-[12.5rem]" :
    markerPanel === "rotate" ? "w-56" :
    markerPanel === "number" ? "w-32" :
    markerPanel === "text" && isSelectedTextElement ? "w-56" :
    markerPanel === "format" && selectedElement && isDrawingType(selectedElement.type) ? "w-44" :
    markerPanel === "format" || markerPanel === "font" ? "w-52" :
    markerPanel ? "w-44" :
    "";
  const selectedElementLabel =
    (typeof selectedElement?.displayName === "string" ? selectedElement.displayName : null) ??
    selectedElement?.name ??
    (selectedElement?.type ? `${selectedElement.type[0].toUpperCase()}${selectedElement.type.slice(1)}` : "Nessuna selezione");
  const selectedElementMeta = selectedElement
    ? [
        selectedElement.number ? `#${selectedElement.number}` : null,
        selectedElement.x != null && selectedElement.y != null ? `${Math.round(selectedElement.x)}% / ${Math.round(selectedElement.y)}%` : null,
      ].filter(Boolean)
    : [];
  const selectedElementAnchorX = Number(selectedElement?.x ?? selectedDrawingBounds?.cx ?? 50);
  const selectedElementAnchorY = Number(selectedElement?.y ?? selectedDrawingBounds?.cy ?? 50);
  const useCompactElementMenu = Boolean(selectedElement);
  const selectedElementMenuLeft = useCompactElementMenu
    ? Math.max(5, Math.min(95, selectedElementAnchorX))
    : Math.max(12, Math.min(88, selectedElementAnchorX));
  const selectedElementMenuTop = useCompactElementMenu
    ? Math.max(18, Math.min(82, selectedElementAnchorY))
    : Math.max(10, Math.min(90, selectedElementAnchorY));
  const selectedElementMenuStyle = selectedElement
    ? {
        left: `${selectedElementMenuLeft}%`,
        top: `${selectedElementMenuTop}%`,
      }
    : undefined;
  const markerMenuSide = useCompactElementMenu && selectedElementAnchorX > 52 ? "left" : "right";
  const selectedElementMenuClass = useCompactElementMenu
    ? markerMenuSide === "left"
      ? "translate-x-[calc(-100%_-_30px)] -translate-y-1/2"
      : "translate-x-[30px] -translate-y-1/2"
    : "-translate-x-1/2 -translate-y-[calc(100%+14px)]";

  const buildPlayerAssignment = (player: TeamPlayer) => ({
    playerId: String(player.id),
    name: fullPlayerName(player),
    displayName: formatRosterLastName(player),
    number: player.jerseyNumber ?? undefined,
  });

  const focusPlayersOnPitch = () => {
    const convokedIds = new Set(teamPlayers.map((player) => String(player.id)));
    const indexes = elements
      .map((item, index) => item.playerId && convokedIds.has(String(item.playerId)) ? index : -1)
      .filter((index) => index >= 0);
    if (!indexes.length) return;
    closeToolPopovers();
    setActiveTool("select");
    setSelectedElementIndexes(indexes);
    setSelectedElementIndex(indexes[indexes.length - 1] ?? null);
    pitchRef.current?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  };

  const matchPlanPlayersOnField = React.useMemo(() => {
    const byId = new Map(teamPlayers.map((player) => [String(player.id), player]));
    return elements
      .map((item, index) => ({ item, index, player: item.playerId ? byId.get(String(item.playerId)) : null }))
      .filter((entry): entry is { item: TacticalBoardElement; index: number; player: TeamPlayer } =>
        isPlayerType(entry.item.type) && entry.item.type !== "opponent" && Boolean(entry.player)
      )
      .sort((a, b) => compareTeamPlayersByRole(a.player, b.player));
  }, [elements, teamPlayers]);

  const usedMatchPlanPlayerIds = React.useMemo(
    () => new Set(matchPlanPlayersOnField.map((entry) => String(entry.player.id))),
    [matchPlanPlayersOnField]
  );
  const callupByPlayerId = React.useMemo(() => {
    const map = new Map<string, MatchCallupItem>();
    matchCallups.forEach((item) => {
      const playerId = parseNumericId((item as any)?.playerId);
      if (!playerId) return;
      map.set(String(playerId), item);
    });
    return map;
  }, [matchCallups]);
  const matchCallupPlayerIds = React.useMemo(
    () => {
      const ids = new Set(Array.from(callupByPlayerId.keys()));
      initialConvocatiIds.forEach((id) => ids.add(String(id)));
      return ids;
    },
    [callupByPlayerId, initialConvocatiIds]
  );
  const matchPlanCalledPlayers = React.useMemo(
    () =>
      teamPlayers
        .filter((player) => matchCallupPlayerIds.has(String(player.id)))
        .sort(compareTeamPlayersByRole),
    [matchCallupPlayerIds, teamPlayers]
  );
  const matchPlanAvailablePlayers = React.useMemo(
    () => teamPlayers.filter((player) => isPlayerAvailable(player)),
    [teamPlayers]
  );
  const matchPlanSelectablePlayers = React.useMemo(() => {
    const currentReplacingPlayerId = replacingElementIndex !== null ? elements[replacingElementIndex]?.playerId : null;
    return matchPlanAvailablePlayers.filter((player) =>
      String(player.id) === String(currentReplacingPlayerId) || !usedMatchPlanPlayerIds.has(String(player.id))
    );
  }, [elements, matchPlanAvailablePlayers, replacingElementIndex, usedMatchPlanPlayerIds]);
  const matchPlanSelectableGrouped = React.useMemo(() => {
    const groups: Record<"GK" | "DEF" | "MID" | "FWD", TeamPlayer[]> = {
      GK: [],
      DEF: [],
      MID: [],
      FWD: [],
    };
    matchPlanSelectablePlayers.forEach((player) => {
      groups[roleMacroKey(player.position)].push(player);
    });
    return groups;
  }, [matchPlanSelectablePlayers]);

  /** Prepara partita (sidebar o URL match-plan): rosa = solo convocati, non tutta l'annata. */
  const isMatchPreparationUi = React.useMemo(
    () => boardMode === "assigned" && (isMatchPlanBoard || activeBoardAction === "match"),
    [activeBoardAction, boardMode, isMatchPlanBoard],
  );

  const selectedMatchOption = React.useMemo(
    () => (selectedMatchId ? matchOptions.find((m) => m.id === selectedMatchId) ?? null : null),
    [matchOptions, selectedMatchId],
  );
  const selectedMatchSheetUrl = React.useMemo(() => {
    if (!selectedMatchId || !boardTeamId) return null;
    return `/calendari/${boardTeamId}?openMatchId=${selectedMatchId}`;
  }, [boardTeamId, selectedMatchId]);

  const activeMatchPlanPeriod = React.useMemo(() => {
    const plan = selectedMatchOption?.matchPlan;
    if (!plan || typeof plan !== "object") return null;
    const periods = (plan as { periods?: MatchPlanPeriodLite[] }).periods;
    if (!Array.isArray(periods)) return null;
    return periods.find((p) => p.key === matchPeriodKey) ?? null;
  }, [matchPeriodKey, selectedMatchOption]);

  const matchPlanStartersLimit = React.useMemo(
    () => startersLimitForPeriod(activeMatchPlanPeriod, boardFormat),
    [activeMatchPlanPeriod, boardFormat],
  );

  const rebuildMatchPlanLayout = React.useCallback(
    (prev: TacticalBoardElement[], formationPresetOverride?: string | null): TacticalBoardElement[] => {
      if (!isMatchPreparationUi) return prev;

      const tryPreset = formationPresetOverride ?? selectedPreset;
      let layoutPresetId: FormationPresetId | null =
        tryPreset && isFormationPresetId(tryPreset) && FORMATIONS[tryPreset].formats.includes(boardFormat)
          ? tryPreset
          : null;
      if (!layoutPresetId) {
        const fromMenu = moduleOptionsForFormat(boardFormat).find(
          (id): id is FormationPresetId =>
            isFormationPresetId(id) && FORMATIONS[id].formats.includes(boardFormat),
        );
        layoutPresetId =
          fromMenu ??
          ((Object.keys(FORMATIONS) as FormationPresetId[]).find((id) =>
            FORMATIONS[id].formats.includes(boardFormat),
          ) ?? null);
      }
      if (!layoutPresetId) return prev;

      const formation = FORMATIONS[layoutPresetId];
      if (!formation.formats.includes(boardFormat)) return prev;

      const rest = prev.filter((el) => {
        if (!isPlayerType(el?.type) || el.type === "opponent") return true;
        if (!el.playerId) return true;
        return false;
      });

      const uniqueIds = [
        ...new Set(
          prev
            .filter((el) => isPlayerType(el.type) && el.type !== "opponent" && el.playerId)
            .map((el) => String(el.playerId)),
        ),
      ];
      const roster: TeamPlayer[] = uniqueIds
        .map((id) => teamPlayers.find((p) => String(p.id) === id))
        .filter((p): p is TeamPlayer => Boolean(p));

      if (!roster.length) return prev;

      const orderedAll = orderMatchPlanRosterPlayers(roster, activeMatchPlanPeriod);
      const startersCap = matchPlanStartersLimit;
      const officialStarters = orderedAll.slice(0, startersCap);
      const officialReserves = orderedAll.slice(startersCap);

      const presetElements = formation.slots.map((slot) => ({
        type: slot.role,
        x: slot.x,
        y: slot.y,
        label: slot.role === "goalkeeper" ? "GK" : "P",
        markerColor: slot.role === "goalkeeper" ? "#FACC15" : "#2f9cf4",
      }));

      const maxOnFormation = Math.min(formation.slots.length, officialStarters.length);
      const startersForAssign = officialStarters.slice(0, maxOnFormation);
      const filled =
        startersForAssign.length > 0
          ? assignPlayersToElements(presetElements, startersForAssign)
          : presetElements.map((p) => ({ ...p }));

      const placed = new Set(filled.map((e) => ("playerId" in e ? e.playerId : null)).filter(Boolean).map(String));
      const startersNotOnFormation = officialStarters.filter((p) => !placed.has(String(p.id)));
      const benchPlayers = [...startersNotOnFormation, ...officialReserves];
      const benchEls: TacticalBoardElement[] = benchPlayers.map((p, idx) => {
        const pos = benchSpotForReserve(idx);
        const isGk = isGoalkeeperPlayer(p);
        return {
          type: isGk ? "goalkeeper" : "player",
          x: pos.x,
          y: 50,
          playerId: String(p.id),
          name: fullPlayerName(p),
          displayName: formatRosterLastName(p),
          number: p.jerseyNumber ?? undefined,
        };
      });

      return [...rest, ...filled, ...benchEls];
    },
    [
      activeMatchPlanPeriod,
      boardFormat,
      isMatchPreparationUi,
      matchPlanStartersLimit,
      selectedPreset,
      teamPlayers,
    ],
  );

  const matchPlanPitchPlacement = React.useMemo(() => {
    const empty: { limit: number; ordered: MatchPlanFieldRow[]; reserveIds: Set<string> } = {
      limit: 11,
      ordered: [],
      reserveIds: new Set(),
    };
    if (!isMatchPreparationUi) return empty;
    const limit = matchPlanStartersLimit;
    const onField = matchPlanPlayersOnField;
    if (!onField.length) {
      return { limit, ordered: [], reserveIds: new Set<string>() };
    }
    const onFieldIdSet = new Set(onField.map((e) => String(e.player.id)));
    const lineupIdsRaw = activeMatchPlanPeriod?.lineupPlayerIds ?? [];
    const orderedFromLineup = lineupIdsRaw
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && onFieldIdSet.has(String(id)));
    const inLineup = new Set(orderedFromLineup.map(String));
    const extras = onField
      .filter((e) => !inLineup.has(String(e.player.id)))
      .sort((a, b) => compareTeamPlayersByRole(a.player, b.player));
    const orderedEntries = [
      ...orderedFromLineup
        .map((id) => onField.find((e) => String(e.player.id) === String(id)))
        .filter((e): e is NonNullable<typeof e> => Boolean(e)),
      ...extras,
    ];
    const reserveIds = new Set<string>();
    const ordered: MatchPlanFieldRow[] = orderedEntries.map((entry, idx) => {
      const isReserve = idx >= limit;
      if (isReserve) reserveIds.add(String(entry.player.id));
      return { player: entry.player, index: entry.index, isReserve };
    });
    return { limit, ordered, reserveIds };
  }, [activeMatchPlanPeriod, isMatchPreparationUi, matchPlanPlayersOnField, matchPlanStartersLimit]);

  const detectedModule = React.useMemo(() => {
    const reserveIds =
      isMatchPreparationUi && boardMode === "assigned" ? matchPlanPitchPlacement.reserveIds : new Set<string>();
    const ownPlayers = elements.filter(
      (el) =>
        isPlayerType(el?.type) &&
        el.type !== "opponent" &&
        !(el.playerId && reserveIds.has(String(el.playerId))),
    );
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
  }, [boardMode, elements, isMatchPreparationUi, matchPlanPitchPlacement]);

  const moduleLabelFull =
    selectedPreset && isFormationPresetId(selectedPreset)
      ? detectedModule
        ? `Scelto: ${selectedPreset} — Rilevato: ${detectedModule}`
        : `Scelto: ${selectedPreset}${detectedModule ? "" : " — (posiziona i titolari sul campo)"}`
      : detectedModule || "Lavagna libera";

  const moduleLabel = detectedModule || "—";

  const getLineupPlayerIdsForMatchPlan = React.useCallback(() => {
    if (isMatchPreparationUi && matchPlanPitchPlacement.ordered.length > 0) {
      return matchPlanPitchPlacement.ordered.map((row) => Number(row.player.id)).filter((id) => Number.isFinite(id));
    }
    return elements
      .filter((item) => isPlayerType(item.type) && item.type !== "opponent" && item.playerId)
      .map((item) => Number(item.playerId))
      .filter((id) => Number.isFinite(id));
  }, [elements, isMatchPreparationUi, matchPlanPitchPlacement.ordered]);

  const boardPlayerIdsForCallupSync = React.useMemo(() => {
    if (!isMatchPreparationUi || boardMode !== "assigned") return "";
    const ids = [
      ...new Set(
        elements
          .filter((el) => isPlayerType(el.type) && el.type !== "opponent" && el.playerId)
          .map((el) => {
            const n = parseNumericId(el.playerId);
            return n != null ? String(n) : String(el.playerId);
          }),
      ),
    ].sort();
    return ids.join(",");
  }, [boardMode, elements, isMatchPreparationUi]);

  const ensureMatchCallup = React.useCallback(async (playerIdRaw: string | number) => {
    if (!selectedMatchId) return;
    const playerId = parseNumericId(playerIdRaw);
    if (!playerId) return;
    try {
      await fetch(withApi(`/api/matches/${selectedMatchId}/callups`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, status: "called" }),
      });
      await loadMatchCallups(selectedMatchId);
    } catch {
      // keep board usable even if callup sync fails temporarily
    }
  }, [loadMatchCallups, selectedMatchId]);

  const removeMatchCallup = React.useCallback(async (playerIdRaw: string | number) => {
    if (!selectedMatchId) return;
    const playerId = parseNumericId(playerIdRaw);
    if (!playerId) return;
    const callup = callupByPlayerId.get(String(playerId));
    const callupId = parseNumericId((callup as any)?.id);
    if (!callupId) return;
    try {
      await fetch(withApi(`/api/callups/${callupId}`), {
        method: "DELETE",
        credentials: "include",
      });
      await loadMatchCallups(selectedMatchId);
    } catch {
      // keep board usable even if callup sync fails temporarily
    }
  }, [callupByPlayerId, loadMatchCallups, selectedMatchId]);

  React.useEffect(() => {
    if (!selectedMatchId || !boardPlayerIdsForCallupSync) return;
    const ids = boardPlayerIdsForCallupSync.split(",").filter(Boolean);
    const missing = ids.filter((id) => !matchCallupPlayerIds.has(id));
    if (!missing.length) return;
    let cancelled = false;
    void (async () => {
      for (const id of missing) {
        if (cancelled) return;
        await ensureMatchCallup(id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardPlayerIdsForCallupSync, ensureMatchCallup, matchCallupPlayerIds, selectedMatchId]);

  React.useEffect(() => {
    if (!isMatchPreparationUi || boardMode !== "assigned" || !selectedMatchId) return;
    setElements((prev) => {
      const alreadyHasMatchPlayers = prev.some((item) => isPlayerType(item.type) && item.type !== "opponent" && item.playerId);
      if (alreadyHasMatchPlayers) return prev;
      const keep = prev.filter((item) => {
        if (!isPlayerType(item.type) || item.type === "opponent") return true;
        if (!item.playerId) return false;
        const pid = String(item.playerId);
        if (matchCallupPlayerIds.has(pid)) return true;
        return matchPlanPitchPlacement.ordered.some((row) => String(row.player.id) === pid);
      });
      const placedIds = new Set(
        keep
          .map((item) => (item.playerId ? String(item.playerId) : ""))
          .filter((id) => id.length > 0),
      );
      const missing = matchPlanCalledPlayers.filter((player) => !placedIds.has(String(player.id)));
      if (!missing.length) return keep;
      const stubs = missing.map((player) => {
        const isGoalkeeper = isGoalkeeperPlayer(player);
        return {
          type: isGoalkeeper ? "goalkeeper" : "player",
          x: 50,
          y: 50,
          ...buildPlayerAssignment(player),
        } as TacticalBoardElement;
      });
      const next = rebuildMatchPlanLayout([...keep, ...stubs]);
      const prevKey = prev.map((item) => `${item.type}:${item.playerId ?? ""}:${Math.round(Number(item.x ?? 0) * 10) / 10}:${Math.round(Number(item.y ?? 0) * 10) / 10}`).join("|");
      const nextKey = next.map((item) => `${item.type}:${item.playerId ?? ""}:${Math.round(Number(item.x ?? 0) * 10) / 10}:${Math.round(Number(item.y ?? 0) * 10) / 10}`).join("|");
      return prevKey === nextKey ? prev : next;
    });
  }, [
    boardFormat,
    boardMode,
    isMatchPreparationUi,
    matchCallupPlayerIds,
    matchPlanCalledPlayers,
    rebuildMatchPlanLayout,
    selectedMatchId,
    selectedPreset,
  ]);

  const replaceMatchPlanPlayer = async (elementIndex: number, playerIdRaw: string) => {
    const player = matchPlanAvailablePlayers.find((item) => String(item.id) === playerIdRaw);
    if (!player) return;
    const previousPlayerIdRaw = elements[elementIndex]?.playerId ?? null;
    const isGoalkeeper = isGoalkeeperPlayer(player);
    setElements((prev) =>
      rebuildMatchPlanLayout(
        prev.map((item, index) =>
          index === elementIndex
            ? { ...item, type: isGoalkeeper ? "goalkeeper" : "player", ...buildPlayerAssignment(player) }
            : item,
        ),
      ),
    );
    setReplacingElementIndex(null);
    setMatchPlanPlayerId("");
    setSaveState("Unsaved");
    await ensureMatchCallup(player.id);
    if (previousPlayerIdRaw && String(previousPlayerIdRaw) !== String(player.id)) {
      await removeMatchCallup(previousPlayerIdRaw);
    }
  };

  const removeMatchPlanPlayer = async (elementIndex: number) => {
    const playerIdRaw = elements[elementIndex]?.playerId ?? null;
    setElements((prev) => rebuildMatchPlanLayout(prev.filter((_, index) => index !== elementIndex)));
    setReplacingElementIndex(null);
    setSaveState("Unsaved");
    if (playerIdRaw) {
      await removeMatchCallup(playerIdRaw);
    }
  };

  const addMatchPlanPlayerToPitch = async (playerIdRaw: string) => {
    if (replacingElementIndex !== null) {
      await replaceMatchPlanPlayer(replacingElementIndex, playerIdRaw);
      return;
    }
    const player = matchPlanAvailablePlayers.find((item) => String(item.id) === playerIdRaw);
    if (!player || usedPlayerIds.has(String(player.id))) return;
    const isGoalkeeper = isGoalkeeperPlayer(player);
    const stub: TacticalBoardElement = {
      type: isGoalkeeper ? "goalkeeper" : "player",
      x: 50,
      y: 50,
      ...buildPlayerAssignment(player),
    };
    setElements((prev) => {
      const preferredEmptyIndex = prev.findIndex(
        (item) =>
          isPlayerType(item.type) &&
          item.type !== "opponent" &&
          !item.playerId &&
          (isGoalkeeper ? item.type === "goalkeeper" : item.type === "player"),
      );
      const anyEmptyIndex =
        preferredEmptyIndex >= 0
          ? preferredEmptyIndex
          : prev.findIndex((item) => isPlayerType(item.type) && item.type !== "opponent" && !item.playerId);
      if (anyEmptyIndex >= 0) {
        return prev.map((item, index) =>
          index === anyEmptyIndex
            ? {
                ...item,
                type: isGoalkeeper ? "goalkeeper" : "player",
                ...buildPlayerAssignment(player),
              }
            : item,
        );
      }
      return prev;
    });
    setSelectedElementIndex(null);
    setSelectedElementIndexes([]);
    setActiveTool("select");
    setMatchPlanPlayerId("");
    setSaveState("Unsaved");
    await ensureMatchCallup(player.id);
  };

  const applyMatchPlanFormation = (presetName: string) => {
    setSelectedPreset(presetName);
    if (!isFormationPresetId(presetName)) return;
    const formation = FORMATIONS[presetName];
    if (!formation.formats.includes(boardFormat)) return;
    setElements((prev) => rebuildMatchPlanLayout(prev, presetName));
    setSelectedElementIndex(null);
    setSelectedElementIndexes([]);
    setSaveState("Unsaved");
  };

  const selectMatchForBoard = (matchIdRaw: string) => {
    const matchId = parseNumericId(matchIdRaw);
    if (!matchId) {
      setSelectedMatchId(null);
      matchPrepBindingCommittedRef.current = false;
      setSaveState("Unsaved");
      return;
    }
    const match = matchOptions.find((item) => item.id === matchId);
    if (!match || !match.id) return;
    matchPrepBindingCommittedRef.current = true;
    setSelectedMatchId(match.id);
    setBoardType("Match Plan");
    setActiveBoardAction("match");
    if (match.teamId) loadTeamById(match.teamId);
    if (boardTitle === "Nuova lavagna" || boardTitle === "Nuova sessione lavagna") {
      setBoardTitle(`Preparazione partita vs ${match.opponent ?? "avversario"}`);
    }
    setSaveState("Unsaved");
  };

  const linkSavedBoardToMatchPeriod = async (savedBoardId: number | null, savedBoardTitle: string) => {
    if (!savedBoardId || !selectedMatchId || !boardTeamId) return;
    const matchesRes = await fetch(withApi(`/api/matches?teamId=${boardTeamId}`), { credentials: "include" });
    if (!matchesRes.ok) return;
    const matches = await matchesRes.json();
    const match = Array.isArray(matches) ? matches.find((item) => parseNumericId(item?.id) === selectedMatchId) : null;
    if (!match) return;
    const existingPlan = match.matchPlan && typeof match.matchPlan === "object" ? match.matchPlan : {};
    const currentPeriods = Array.isArray(existingPlan.periods) ? existingPlan.periods : [];
    const periodLabels: Record<typeof matchPeriodKey, string> = { t1: "1° tempo", t2: "2° tempo", t3: "3° tempo", t4: "4° tempo" };
    const boardUrl = `/tactical-board?boardId=${savedBoardId}&teamId=${boardTeamId}&matchId=${selectedMatchId}&periodKey=${matchPeriodKey}&returnTo=${encodeURIComponent(`/calendari/${boardTeamId}?openMatchId=${selectedMatchId}`)}`;
    const lineupPlayerIds = getLineupPlayerIdsForMatchPlan();
    const playerIds = Array.from(new Set([
      ...matchCallups.map((callup) => callup.playerId),
      ...lineupPlayerIds,
    ]));
    const hasPeriod = currentPeriods.some((period: any) => period?.key === matchPeriodKey);
    const periods = (hasPeriod ? currentPeriods : [...currentPeriods, { key: matchPeriodKey, label: periodLabels[matchPeriodKey], minutes: "" }]).map((period: any) =>
      period?.key === matchPeriodKey
        ? {
            ...period,
            lineupPlayerIds,
            lineupDetectedModule: detectedModule || period?.lineupDetectedModule || null,
            boardId: savedBoardId,
            boardTitle: savedBoardTitle,
            boardUrl,
            boardSnapshotAt: new Date().toISOString(),
            boardConfirmed: true,
          }
        : period
    );
    const planRes = await fetch(withApi(`/api/matches/${selectedMatchId}/plan`), {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerIds, matchPlan: { ...existingPlan, periods } }),
    });
    if (!planRes.ok) throw new Error("Errore collegamento scheda partita");
    await loadMatchCallups(selectedMatchId);
  };

  const saveMatchSheetFromBoard = async () => {
    if (!selectedMatchId || !boardTeamId) {
      setMatchSheetSaveHint("Seleziona una partita con squadra collegata.");
      return;
    }
    setMatchSheetSaveHint(null);
    try {
      const matchesRes = await fetch(withApi(`/api/matches?teamId=${boardTeamId}`), { credentials: "include" });
      if (!matchesRes.ok) throw new Error("matches");
      const matches = await matchesRes.json();
      const match = Array.isArray(matches) ? matches.find((item) => parseNumericId(item?.id) === selectedMatchId) : null;
      if (!match) throw new Error("match");
      const existingPlan = match.matchPlan && typeof match.matchPlan === "object" ? match.matchPlan : {};
      const currentPeriods = Array.isArray(existingPlan.periods) ? existingPlan.periods : [];
      const lineupPlayerIds = getLineupPlayerIdsForMatchPlan();
      const playerIds = Array.from(new Set([
        ...matchCallups.map((callup) => callup.playerId),
        ...lineupPlayerIds,
      ]));
      const periodLabels: Record<typeof matchPeriodKey, string> = { t1: "1° tempo", t2: "2° tempo", t3: "3° tempo", t4: "4° tempo" };
      const hasPeriod = currentPeriods.some((period: any) => period?.key === matchPeriodKey);
      const periods = (hasPeriod ? currentPeriods : [...currentPeriods, { key: matchPeriodKey, label: periodLabels[matchPeriodKey], minutes: "" }]).map((period: any) =>
        period?.key === matchPeriodKey
          ? { ...period, lineupPlayerIds, lineupDetectedModule: detectedModule || period?.lineupDetectedModule || null, boardConfirmed: false }
          : period
      );
      const patchRes = await fetch(withApi(`/api/matches/${selectedMatchId}/plan`), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerIds, matchPlan: { ...existingPlan, periods } }),
      });
      if (!patchRes.ok) throw new Error("patch");
      await loadMatchCallups(selectedMatchId);
      setMatchSheetSaveHint("Scheda partita salvata (da confermare in calendario).");
      window.setTimeout(() => setMatchSheetSaveHint(null), 5000);
    } catch {
      setMatchSheetSaveHint("Errore nel salvataggio della scheda.");
      window.setTimeout(() => setMatchSheetSaveHint(null), 6000);
    }
  };

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
      isGoalkeeperSlot ? isGoalkeeperPlayer(player) : !isGoalkeeperPlayer(player)
    );
    return matchingRole ?? available[0] ?? null;
  };

  const assignPlayerToSelectedElement = (playerIdRaw: string) => {
    if (selectedElementIndex === null) return;
    const player = playerAssignmentOptions.find((p) => String(p.id) === playerIdRaw);
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

  const selectElementAndOpenMenu = (index: number, event: React.PointerEvent | React.MouseEvent) => {
    selectElement(index, event);
    setFieldElementMenuOpen(true);
    setMarkerPanel(null);
  };

  const deleteSelectedElements = () => {
    const indexes = selectedElementIndexes.length ? selectedElementIndexes : selectedElementIndex !== null ? [selectedElementIndex] : [];
    if (!indexes.length) return;
    const toDelete = new Set(indexes);
    setElements((prev) => prev.filter((_, idx) => !toDelete.has(idx)));
    setSelectedElementIndex(null);
    setSelectedElementIndexes([]);
    setFieldElementMenuOpen(false);
    setMarkerPanel(null);
    setSaveState("Unsaved");
  };

  const rotateSelectedElements = (delta: number) => {
    const indexes = selectedElementIndexes.length ? selectedElementIndexes : selectedElementIndex !== null ? [selectedElementIndex] : [];
    if (!indexes.length) return;
    const toRotate = new Set(indexes);
    setElements((prev) =>
      prev.map((item, idx) => {
        if (!toRotate.has(idx)) return item;
        const current = typeof item.rotation === "number" ? item.rotation : Number(item.rotation ?? 0);
        return { ...item, rotation: ((Number.isFinite(current) ? current : 0) + delta + 360) % 360 };
      })
    );
    setSaveState("Unsaved");
  };

  const setSelectedElementsRotation = (rotation: number) => {
    const indexes = selectedElementIndexes.length ? selectedElementIndexes : selectedElementIndex !== null ? [selectedElementIndex] : [];
    if (!indexes.length) return;
    const normalized = ((rotation % 360) + 360) % 360;
    const toRotate = new Set(indexes);
    setElements((prev) =>
      prev.map((item, idx) => (
        toRotate.has(idx) ? { ...item, rotation: normalized } : item
      ))
    );
    setSaveState("Unsaved");
  };

  const setSelectedEquipmentColor = (color: string) => {
    const indexes = selectedElementIndexes.length ? selectedElementIndexes : selectedElementIndex !== null ? [selectedElementIndex] : [];
    if (!indexes.length) return;
    const toColor = new Set(indexes);
    setElements((prev) =>
      prev.map((item, idx) => {
        if (!toColor.has(idx) || !isEquipmentType(item.type)) return item;
        if (color === "default") {
          const { equipColor, ...rest } = item;
          return rest;
        }
        return { ...item, equipColor: color };
      })
    );
    setEquipmentColor(color);
    setSaveState("Unsaved");
  };

  const setSelectedGoalType = (type: (typeof GOAL_TOOL_VARIANTS)[number]["id"]) => {
    if (selectedElementIndex === null) return;
    setElements((prev) =>
      prev.map((item, idx) => (
        idx === selectedElementIndex && goalVariantForType(item.type)
          ? { ...item, type }
          : item
      ))
    );
    setSelectedGoalTool(type);
    setFieldElementMenuOpen(true);
    setSaveState("Unsaved");
  };

  const setSelectedEquipmentFormat = (format: string) => {
    const indexes = selectedElementIndexes.length ? selectedElementIndexes : selectedElementIndex !== null ? [selectedElementIndex] : [];
    if (!indexes.length) return;
    const toFormat = new Set(indexes);
    setElements((prev) =>
      prev.map((item, idx) => (
        toFormat.has(idx) && equipmentFormatOptions(item.type).length
          ? { ...item, equipFormat: format }
          : item
      ))
    );
    setFieldElementMenuOpen(true);
    setSaveState("Unsaved");
  };

  const setSelectedElementScale = (scale: number) => updateSelectedElements((item) => ({ ...item, scale }));

  const updateSelectedElements = (updater: (item: TacticalBoardElement) => TacticalBoardElement) => {
    const indexes = selectedElementIndexes.length ? selectedElementIndexes : selectedElementIndex !== null ? [selectedElementIndex] : [];
    if (!indexes.length) return;
    const selected = new Set(indexes);
    setElements((prev) => prev.map((item, idx) => selected.has(idx) ? updater(item) : item));
    setFieldElementMenuOpen(true);
    setSaveState("Unsaved");
  };

  const setSelectedDrawingColor = (color: string) => updateSelectedElements((item) =>
    isDrawingType(item.type) || item.type === "text" ? { ...item, color } : item
  );

  const setSelectedDrawingLineWidth = (lineWidth: number) => updateSelectedElements((item) =>
    isDrawingType(item.type) ? { ...item, lineWidth } : item
  );

  const setSelectedZoneShape = (shape: (typeof ZONE_SHAPE_OPTIONS)[number]["id"]) => updateSelectedElements((item) =>
    item.type === "zone" ? { ...item, drawShape: `zone-${shape}`, points: regularZoneVertices(Array.isArray(item.points) ? item.points as Array<{ x: number; y: number }> : [], shape) } : item
  );

  const setSelectedMeasureTextSize = (measureTextSize: number) => updateSelectedElements((item) =>
    String(item.drawShape ?? "") === "measure-line" ? { ...item, measureTextSize } : item
  );

  const updateSelectedTextStyle = (patch: Record<string, unknown>) => updateSelectedElements((item) =>
    item.type === "text" ? { ...item, ...patch } : item
  );

  const setSelectedMarkerColor = (markerColor: string) => updateSelectedElements((item) =>
    isPlayerType(item.type) ? { ...item, markerColor } : item
  );

  const updateSelectedTextContent = (value: string) => updateSelectedElements((item) =>
    item.type === "text" ? { ...item, label: value } : item
  );

  const resizeSelectedTextBox = (event: React.PointerEvent, axis: "x" | "y" | "both") => {
    if (selectedElementIndex === null || selectedElement?.type !== "text") return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = Number(selectedElement.textWidth ?? 260);
    const startHeight = Number(selectedElement.textHeight ?? 34);
    const targetIndex = selectedElementIndex;

    const clampSize = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    const handleMove = (ev: PointerEvent) => {
      const nextWidth = axis === "y" ? startWidth : clampSize(startWidth + (ev.clientX - startX) * 2, 120, 520);
      const nextHeight = axis === "x" ? startHeight : clampSize(startHeight + (ev.clientY - startY) * 2, 34, 180);
      setElements((prev) => prev.map((item, idx) => (
        idx === targetIndex && item.type === "text"
          ? { ...item, ...(axis !== "y" ? { textWidth: Math.round(nextWidth) } : {}), ...(axis !== "x" ? { textHeight: Math.round(nextHeight) } : {}) }
          : item
      )));
      setSaveState("Unsaved");
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const moveZoneVertex = (
    event: React.PointerEvent<HTMLElement>,
    index: number,
    pointIndex: number,
    vertices: Array<{ x: number; y: number }>
  ) => {
    const zone = elements[index];
    if (zone?.type !== "zone" || !vertices[pointIndex]) return;
    event.preventDefault();
    event.stopPropagation();
    selectElementAndOpenMenu(index, event);

    const handleMove = (ev: PointerEvent) => {
      const pitch = pitchRef.current;
      if (!pitch) return;
      const point = getPitchPoint(ev, pitch);
      setElements((prev) => prev.map((item, idx) => (
        idx === index && item.type === "zone"
          ? { ...item, points: vertices.map((p, pIdx) => pIdx === pointIndex ? point : p) }
          : item
      )));
      setSaveState("Unsaved");
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const moveDrawingPoint = (event: React.PointerEvent<HTMLElement>, index: number, pointIndex: number) => {
    const item = elements[index];
    const points = Array.isArray(item?.points) ? item.points as Array<{ x: number; y: number }> : [];
    if (!points[pointIndex]) return;
    event.preventDefault();
    event.stopPropagation();
    selectElementAndOpenMenu(index, event);

    const handleMove = (ev: PointerEvent) => {
      const pitch = pitchRef.current;
      if (!pitch) return;
      const point = getPitchPoint(ev, pitch);
      setElements((prev) => prev.map((el, idx) => {
        if (idx !== index) return el;
        const currentPoints = Array.isArray(el.points) ? el.points as Array<{ x: number; y: number }> : [];
        if (!currentPoints[pointIndex]) return el;
        return {
          ...el,
          points: currentPoints.map((p, pIdx) => pIdx === pointIndex ? point : p),
        };
      }));
      setSaveState("Unsaved");
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const setSelectedTextAlign = (textAlign: "left" | "center" | "right") => updateSelectedElements((item) =>
    item.type === "text" ? { ...item, textAlign } : item
  );

  const setSelectedTextVerticalAlign = (textVerticalAlign: "top" | "middle" | "bottom") => updateSelectedElements((item) =>
    item.type === "text" ? { ...item, textVerticalAlign } : item
  );

  const toggleMarkerPanel = (panel: FieldElementPanel) => {
    setMarkerPanel((current) => current === panel ? null : panel);
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
        const { playerId, name, displayName, number, playerNumber, ...rest } = item;
        return rest;
      })
    );
    setSaveState("Unsaved");
  };

  const updateSelectedPlayerText = (value: string) => {
    if (selectedElementIndex === null) return;
    const text = value.trim();
    setElements((prev) =>
      prev.map((item, idx) =>
        idx === selectedElementIndex
          ? {
              ...item,
              name: text || undefined,
              displayName: text || undefined,
            }
          : item
      )
    );
    setSaveState("Unsaved");
  };

  const updateSelectedPlayerNumber = (value: string) => {
    if (selectedElementIndex === null) return;
    const trimmed = value.trim();
    const parsed = trimmed ? Number(trimmed) : null;
    setElements((prev) =>
      prev.map((item, idx) => {
        if (idx !== selectedElementIndex) return item;
        if (!trimmed || !Number.isFinite(parsed)) {
          const { number, playerNumber, ...rest } = item;
          return rest;
        }
        return { ...item, number: parsed, playerNumber: parsed };
      })
    );
    setSaveState("Unsaved");
  };

  const dragElement = (e: React.PointerEvent<HTMLElement | SVGElement>, indexToDrag: number) => {
    e.preventDefault();
    e.stopPropagation();

    const pointerId = e.pointerId;
    selectElementAndOpenMenu(indexToDrag, e);
    skipNextPitchClickRef.current = true;
    let moved = false;

    const rect = pitchRef.current;
    const selectedGroup = selectedElementIndexes.includes(indexToDrag) && selectedElementIndexes.length > 1
      ? selectedElementIndexes
      : [indexToDrag];
    const startPoint = rect ? getPitchPoint(e, rect) : { x: 0, y: 0 };
    const startPositions = elements.map((item) => ({ x: Number(item.x ?? 50), y: Number(item.y ?? 50) }));
    const startPointLists = elements.map((item) => (
      Array.isArray(item.points)
        ? (item.points as Array<{ x: number; y: number }>).map((p) => ({ x: p.x, y: p.y }))
        : null
    ));

    const handleMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const pitch = pitchRef.current;
      if (!pitch) return;
      const { x, y } = getPitchPoint(ev, pitch);
      const dx = x - startPoint.x;
      const dy = y - startPoint.y;
      if (!moved && Math.hypot(dx, dy) < 0.65) return;
      if (!moved) {
        moved = true;
        setFieldElementMenuOpen(false);
        isDraggingRef.current = true;
        setSaveState("Unsaved");
      }
      const clamp = (value: number) => Math.max(0, Math.min(100, value));

      setElements((prev) =>
        prev.map((item: TacticalBoardElement, idx: number) => {
          if (!selectedGroup.includes(idx)) return item;
          const originalPoints = startPointLists[idx];
          if (originalPoints?.length) {
            return {
              ...item,
              points: originalPoints.map((p) => ({ x: clamp(p.x + dx), y: clamp(p.y + dy) })),
            };
          }
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
      <header className="h-16 border-b border-white/10 bg-[#0F172A]/90 backdrop-blur flex items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={goBackFromBoard}
            className="p-2 rounded-xl hover:bg-white/10 transition"
            aria-label={returnToMatchUrl ? "Torna alla scheda partita" : "Indietro"}
            title={returnToMatchUrl ? "Torna alla scheda partita" : "Indietro"}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
          <h1 className="text-lg font-semibold tracking-wide">Lavagna Tattica</h1>
          <p className="text-xs text-white/50">Allenamento / Match Plan</p>
          </div>
          {returnToMatchUrl && (
            <button
              type="button"
              onClick={goBackFromBoard}
              className="hidden items-center gap-2 rounded-xl border border-[#FACC15]/40 bg-[#FACC15]/10 px-3 py-2 text-xs font-semibold text-[#FACC15] transition hover:bg-[#FACC15]/20 sm:flex"
            >
              <ArrowLeft size={14} />
              Torna scheda partita
            </button>
          )}
        </div>

        <div className="hidden min-w-0 flex-1 flex-col items-center px-3 md:flex">
        <input
  value={boardTitle}
  onChange={(e) => setBoardTitle(e.target.value)}
  title={boardTitle}
  className="w-full max-w-[58rem] truncate bg-transparent text-center text-sm font-semibold outline-none md:text-base"
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
    setSelectedMatchId(null);
    matchPrepBindingCommittedRef.current = false;
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
      boardType,
      matchId: selectedMatchId,
      matchPeriodKey: selectedMatchId && (isMatchPreparationUi || isMatchPlanBoard) ? matchPeriodKey : null,
      preset: selectedPreset,
      activeTool,
      focusMode,
      arrowToolPreset,
      elements: elements,
      // Present already in backend blob usage and safe to keep:
      updatedAt: new Date().toISOString(),
      notes: boardNotes,
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
      await linkSavedBoardToMatchPeriod(savedBoardId, boardTitle);
      
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
                    const nextOpen = !freeMenuOpen;
                    closeToolPopovers();
                    setFreeMenuOpen(nextOpen);
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
              <div
                className="hidden lg:flex min-w-0 max-w-[18rem] items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70"
                title={moduleLabelFull}
              >
                <span className="shrink-0 font-semibold text-white">Modulo</span>
                <span className="min-w-0 truncate">{moduleLabel}</span>
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
              <div className="flex min-w-0 flex-1 flex-col gap-2">
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
              className="relative h-auto w-full rounded-[22px] sm:rounded-[26px] lg:rounded-[30px] overflow-hidden border border-white/10 shadow-2xl bg-gradient-to-b from-[#34A853] via-[#2B914A] to-[#23783F]"
              style={{
                aspectRatio: `${pitchMeasurement.canvasLength} / ${pitchMeasurement.canvasWidth}`,
                maxWidth: "100%",
              }}
              ref={pitchRef}
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => {
                if (e.target !== e.currentTarget) return;
                if (!["draw", "movement", "zones", "measure"].includes(activeTool)) return;

                const pitch = pitchRef.current;
                if (!pitch) return;
                e.preventDefault();

                const start = getPitchPoint(e, pitch);
                const nextType = activeTool === "movement" ? "arrow" : activeTool === "zones" ? "zone" : activeTool === "measure" ? "line" : "path";
                const draftIndex = elements.length;
                const ap = arrowToolPreset;
                const draftElement: TacticalBoardElement = {
                  type: nextType,
                  points: [start, start],
                  color:
                    activeTool === "movement"
                      ? (ap.color ?? DEFAULT_ARROW_PRESET.color)
                      : activeTool === "measure"
                        ? measureToolPreset.color
                        : activeTool === "zones"
                          ? zoneToolPreset.color
                          : drawToolPreset.color,
                  lineWidth: activeTool === "zones" ? 1.4 : activeTool === "draw" ? drawToolPreset.lineWidth : 1.8,
                  drawShape:
                    activeTool === "movement"
                      ? buildArrowDrawShape(ap)
                      : activeTool === "zones"
                        ? `zone-${zoneToolPreset.shape}`
                        : activeTool === "measure"
                          ? "measure-line"
                        : "freehand-solid",
                  ...(activeTool === "measure" ? { measureTextSize: measureToolPreset.textSize } : {}),
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
                setFieldElementMenuOpen(false);
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
                      if ((nextType === "arrow" && (ap.geometry === "straight" || ap.geometry === "conduzione")) || nextType === "line") {
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
                  return;
                }
                if (isDraggingRef.current) return;
                if (e.target !== e.currentTarget) return;

                setSelectedElementIndex(null);
                setSelectedElementIndexes([]);
                setFieldElementMenuOpen(false);

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
                const selectedEquipmentColor = equipmentColor === "default" ? undefined : equipmentColor;
                const newElement: TacticalBoardElement = {
                  type: nextType,
                  x,
                  y,
                  label: activeTool === "text" ? "T" : undefined,
                  ...(activeTool === "text"
                    ? {
                        color: textToolPreset.color,
                        fontFamily: textToolPreset.fontFamily,
                        fontSize: textToolPreset.fontSize,
                        fontWeight: textToolPreset.bold ? "700" : "400",
                        textAlign: "center",
                        textVerticalAlign: "middle",
                      }
                    : {}),
                  ...(isEquipmentType(nextType) && selectedEquipmentColor ? { equipColor: selectedEquipmentColor } : {}),
                  ...(isEquipmentType(nextType) && defaultEquipmentFormat(nextType) ? { equipFormat: defaultEquipmentFormat(nextType) } : {}),
                  ...(nextPlayer ? buildPlayerAssignment(nextPlayer) : {}),
                  ...(nextPlayer && selectedPreset && isFormationPresetId(selectedPreset) && usedPlayerCount >= FORMATIONS[selectedPreset].slots.length
                    ? { rosterStatus: "extra" }
                    : {}),
                };

                setElements((prev) => [...prev, newElement]);
                const newIndex = elements.length;
                setSelectedElementIndex(newIndex);
                setSelectedElementIndexes([]);
                setMarkerPanel(activeTool === "text" ? "text" : null);
                setFieldElementMenuOpen(activeTool === "text");
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
                  <marker
                    id="dynamicArrowYellow"
                    markerWidth="2"
                    markerHeight="2"
                    refX="1.85"
                    refY="1"
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    <path d="M0.2,0.2 L1.85,1 L0.2,1.8" fill="none" stroke="context-stroke" strokeWidth="0.24" strokeLinecap="round" strokeLinejoin="round" />
                  </marker>
                  <marker
                    id="dynamicArrowYellowStart"
                    markerWidth="2"
                    markerHeight="2"
                    refX="1.85"
                    refY="1"
                    orient="auto-start-reverse"
                    markerUnits="userSpaceOnUse"
                  >
                    <path d="M0.2,0.2 L1.85,1 L0.2,1.8" fill="none" stroke="context-stroke" strokeWidth="0.24" strokeLinecap="round" strokeLinejoin="round" />
                  </marker>
                </defs>
                {elements.map((el: TacticalBoardElement, i: number) => {
                  if (!isDrawingType(el.type)) return null;
                  const points = Array.isArray(el.points) ? el.points as Array<{ x: number; y: number }> : [];
                  if (points.length < 2) return null;
                  const color = String(el.color ?? "#FACC15");
                  const width = Math.max(0.75, Math.min(Number(el.lineWidth ?? 1.8), 2.2));
                  const renderedStroke = Math.max(0.16, Math.min(width * 0.16, 0.44));
                  const fineStroke = Math.max(0.1, renderedStroke * 0.58);
                  const selected = selectedElementIndex === i;

                  if (el.type === "zone") {
                    const shape = String(el.drawShape ?? "zone-square").replace("zone-", "");
                    if (shape === "circle" && points.length === 2) {
                      const [a, b] = points;
                      const x = Math.min(a.x, b.x);
                      const y = Math.min(a.y, b.y);
                      const w = Math.abs(a.x - b.x);
                      const h = Math.abs(a.y - b.y);
                      return (
                        <ellipse
                          key={`draw-${i}`}
                          cx={x + w / 2}
                          cy={y + h / 2}
                          rx={w / 2}
                          ry={h / 2}
                          fill="rgba(250,204,21,0.14)"
                          stroke={color}
                          strokeWidth={selected ? fineStroke * 1.1 : fineStroke}
                          strokeDasharray={String(el.drawShape ?? "").includes("dashed") ? "2 1.6" : undefined}
                        />
                      );
                    }
                    const vertices = regularZoneVertices(points, shape);
                    return (
                      <polygon
                        key={`draw-${i}`}
                        points={zonePolygonPoints(vertices)}
                        fill="rgba(250,204,21,0.14)"
                        stroke={color}
                        strokeWidth={selected ? fineStroke * 1.1 : fineStroke}
                        strokeLinejoin="round"
                      />
                    );
                  }

                  const heads = resolveArrowHeads(el);
                  const tipLen = polylineLength(points);
                  const showTips = tipLen > 4;
                  const isConduzioneArrow = String(el.drawShape ?? "").includes("conduzione");
                  const markerEndUrl =
                    !isConduzioneArrow && showTips && (heads === "end" || heads === "both") && (el.type === "arrow" || el.type === "bezierarrow")
                      ? "url(#dynamicArrowYellow)"
                      : undefined;
                  const markerStartUrl =
                    !isConduzioneArrow && showTips && (heads === "start" || heads === "both") && (el.type === "arrow" || el.type === "bezierarrow")
                      ? "url(#dynamicArrowYellowStart)"
                      : undefined;

                  if (String(el.drawShape ?? "") === "measure-line") {
                    const [a, b] = points;
                    const dxPct = b.x - a.x;
                    const dyPct = b.y - a.y;
                    const dxM = (dxPct / 100) * pitchMeasurement.canvasLength;
                    const dyM = (dyPct / 100) * pitchMeasurement.canvasWidth;
                    const meters = Math.hypot(dxM, dyM);
                    const len = Math.hypot(dxPct, dyPct) || 1;
                    const measureStroke = fineStroke;
                    const tickHalf = 0.82;
                    const nx = (-dyPct / len) * tickHalf;
                    const ny = (dxPct / len) * tickHalf;
                    const mx = (a.x + b.x) / 2;
                    const my = (a.y + b.y) / 2;
                    return (
                      <g key={`draw-${i}`} opacity={selected ? 0.98 : 0.88}>
                        {selected && (
                          <path
                            d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
                            fill="none"
                            stroke={color}
                            strokeWidth={measureStroke * 3.2}
                            strokeLinecap="round"
                            opacity="0.22"
                          />
                        )}
                        <path
                          d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
                          fill="none"
                          stroke="transparent"
                          strokeWidth={Math.max(measureStroke * 8, 0.9)}
                          strokeLinecap="round"
                          pointerEvents="stroke"
                          className="cursor-grab active:cursor-grabbing"
                          onPointerDown={(e) => dragElement(e, i)}
                        />
                        <path
                          d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
                          fill="none"
                          stroke={color}
                          strokeWidth={selected ? measureStroke * 1.1 : measureStroke}
                          strokeLinecap="round"
                        />
                        <path d={`M ${a.x - nx} ${a.y - ny} L ${a.x + nx} ${a.y + ny}`} stroke={color} strokeWidth={measureStroke * 1.05} strokeLinecap="round" />
                        <path d={`M ${b.x - nx} ${b.y - ny} L ${b.x + nx} ${b.y + ny}`} stroke={color} strokeWidth={measureStroke * 1.05} strokeLinecap="round" />
                        <text
                          x={mx}
                          y={my - 0.9}
                          textAnchor="middle"
                          fill={color}
                          fontSize={String(Number(el.measureTextSize ?? 2.1))}
                          fontWeight="500"
                        >
                          {`${meters.toFixed(meters >= 10 ? 0 : 1)}m`}
                        </text>
                      </g>
                    );
                  }

                  return (
                    <g key={`draw-${i}`}>
                      {selected && (
                        <path
                          d={drawingPathData(el, points)}
                          fill="none"
                          stroke={color}
                          strokeWidth={renderedStroke * 3.6}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeDasharray={strokeDashForDrawing(el)}
                          opacity="0.22"
                        />
                      )}
                      <path
                        d={drawingPathData(el, points)}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={Math.max(renderedStroke * 8, 1.2)}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        pointerEvents="stroke"
                        className="cursor-grab active:cursor-grabbing"
                        onPointerDown={(e) => dragElement(e, i)}
                      />
                      <path
                        d={drawingPathData(el, points)}
                        fill="none"
                        stroke={color}
                        strokeWidth={selected ? renderedStroke * 1.08 : renderedStroke}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray={strokeDashForDrawing(el)}
                        markerStart={markerStartUrl}
                        markerEnd={markerEndUrl}
                        opacity={selected ? 0.95 : 0.84}
                      />
                      {isConduzioneArrow && showTips && (heads === "end" || heads === "both") && (
                        <path
                          d={arrowHeadPath(points[points.length - 1], points[0], Math.max(1.9, renderedStroke * 6))}
                          fill="none"
                          stroke={color}
                          strokeWidth={renderedStroke}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                      {isConduzioneArrow && showTips && (heads === "start" || heads === "both") && (
                        <path
                          d={arrowHeadPath(points[0], points[points.length - 1], Math.max(1.9, renderedStroke * 6))}
                          fill="none"
                          stroke={color}
                          strokeWidth={renderedStroke}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                    </g>
                  );
                })}
              </svg>

              {elements.map((el: TacticalBoardElement, i: number) => {
                if (!isDrawingType(el.type)) return null;
                const isSelected = selectedElementIndex === i || selectedElementIndexes.includes(i);
                const points = Array.isArray(el.points) ? el.points as Array<{ x: number; y: number }> : [];
                const isMeasureHit = String(el.drawShape ?? "") === "measure-line";
                if (isMeasureHit) {
                  if (!isSelected || points.length < 2) return null;
                  return (
                    <React.Fragment key={`measure-handles-${String(el.id ?? i)}`}>
                      {[points[0], points[points.length - 1]].map((point, pointIndex) => (
                        <span
                          key={`measure-handle-${pointIndex}`}
                          className="absolute z-[6] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-[#FACC15] bg-[#0F172A] shadow active:cursor-grabbing"
                          style={{ left: `${point.x}%`, top: `${point.y}%` }}
                          title={pointIndex === 0 ? "Regola inizio misura" : "Regola fine misura"}
                          onPointerDown={(e) => moveDrawingPoint(e, i, pointIndex === 0 ? 0 : points.length - 1)}
                        />
                      ))}
                    </React.Fragment>
                  );
                }
                if (el.type !== "zone") return null;
                const bounds = drawingElementBounds(el);
                if (!bounds) return null;
                const pad = isMeasureHit ? 0.45 : 0;
                const zoneShape = String(el.drawShape ?? "zone-square").replace("zone-", "");
                const zoneVertices = regularZoneVertices(points, zoneShape);
                return (
                  <div
                    key={`drawing-hit-${String(el.id ?? i)}`}
                    className="absolute z-[4] cursor-grab touch-none select-none rounded-lg transition active:cursor-grabbing"
                    style={{
                      left: `${bounds.x - pad}%`,
                      top: `${bounds.y - pad}%`,
                      width: `${bounds.width + pad * 2}%`,
                      height: `${bounds.height + pad * 2}%`,
                      minWidth: isMeasureHit ? "34px" : "20px",
                      minHeight: isMeasureHit ? "10px" : "20px",
                    }}
                    title={activeToolLabelMap[el.type ?? ""] ?? String(el.type ?? "Disegno")}
                    onPointerDown={(e) => dragElement(e, i)}
                  >
                    {isSelected && el.type === "zone" && (
                      <>
                        {zoneVertices.map((point, pointIndex) => (
                          <span
                            key={`zone-vertex-${pointIndex}`}
                            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border border-[#FACC15] bg-red-500 shadow active:cursor-grabbing"
                            style={{
                              left: `${bounds.width ? ((point.x - bounds.x) / bounds.width) * 100 : 50}%`,
                              top: `${bounds.height ? ((point.y - bounds.y) / bounds.height) * 100 : 50}%`,
                            }}
                            title="Sposta punto forma"
                            onPointerDown={(e) => moveZoneVertex(e, i, pointIndex, zoneVertices)}
                          />
                        ))}
                      </>
                    )}
                  </div>
                );
              })}

              {/* Elements */}
              {hasRenderableElements ? (
                elements.map((el: TacticalBoardElement, i: number) => {
                  if (!isPlayerType(el?.type) && !isEquipmentType(el?.type)) return null;

                  if (
                    isMatchPreparationUi &&
                    boardMode === "assigned" &&
                    isPlayerType(el?.type) &&
                    el.type !== "opponent" &&
                    el.playerId &&
                    matchPlanPitchPlacement.reserveIds.has(String(el.playerId))
                  ) {
                    return null;
                  }

                  const commonStyle = {
                    left: `${el.x ?? 50}%`,
                    top: `${el.y ?? 50}%`,
                    transform: `translate(-50%, -50%) rotate(${Number(el.rotation ?? 0)}deg) scale(${Number(el.scale ?? 1)})`,
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
                  const rawNumber = el.number as unknown;
                  const rawPlayerNumber = el.playerNumber as unknown;
                  const nameCandidates = [
                    rawDisplayName,
                    rawName,
                    typeof rawNumber === "string" && !/^\d+$/.test(rawNumber.trim()) ? rawNumber.trim() : "",
                    typeof rawPlayerNumber === "string" && !/^\d+$/.test(rawPlayerNumber.trim()) ? rawPlayerNumber.trim() : "",
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
                  const markerColor =
                    typeof el.markerColor === "string"
                      ? el.markerColor
                      : defaultMarkerColor(el.type, el.rosterStatus);
                  const markerStyle = {
                    ...commonStyle,
                    backgroundColor: markerColor,
                    color: markerTextColor(markerColor),
                  } as const;

                  const playerClassName =
                    el.type === "player"
                      ? `absolute z-[5] flex h-8 w-8 cursor-grab touch-none select-none items-center justify-center rounded-full text-xs font-bold shadow-lg border-2 border-white/80 active:cursor-grabbing${isSelected ? " ring-2 ring-[#FACC15] z-10" : ""}`
                      : el.type === "opponent"
                      ? `absolute z-[5] flex h-8 w-8 cursor-grab touch-none select-none items-center justify-center rounded-full text-xs font-bold shadow-lg border-2 border-white/80 active:cursor-grabbing${isSelected ? " ring-2 ring-[#FACC15] z-10" : ""}`
                      : `absolute z-[5] flex h-8 w-8 cursor-grab touch-none select-none items-center justify-center rounded-full text-xs font-bold shadow-lg border-2 border-white/80 active:cursor-grabbing${isSelected ? " ring-2 ring-[#FACC15] z-10" : ""}`;

                  if (isEquipmentType(el.type)) {
                    const elEquipColor = typeof el.equipColor === "string" ? el.equipColor : undefined;
                    const elEquipFormat = typeof el.equipFormat === "string" ? el.equipFormat : defaultEquipmentFormat(el.type);
                    const goalVariant = goalVariantForType(el.type);
                    if (goalVariant) {
                      const fieldGoalStyle = {
                        ...commonStyle,
                        width: `${(goalVariant.depthMeters / pitchMeasurement.canvasLength) * 100}%`,
                        height: `${(goalVariant.widthMeters / pitchMeasurement.canvasWidth) * 100}%`,
                        minWidth: goalVariant.id === "goalMini" ? "8px" : "12px",
                        minHeight: goalVariant.id === "goalMini" ? "10px" : "18px",
                      } as const;
                      return (
                        <div
                          key={String(el.id ?? `el-${i}`)}
                          className={`absolute z-[4] cursor-grab touch-none select-none transition active:cursor-grabbing ${isSelected ? "ring-2 ring-[#FACC15] ring-offset-2 ring-offset-[#145f38]" : ""}`}
                          style={fieldGoalStyle}
                          onPointerDown={(e) => dragElement(e, i)}
                          title={goalVariant.label}
                        >
                          <FieldGoalEquipment type={el.type} color={elEquipColor} />
                        </div>
                      );
                    }
                    return (
                      <div
                        key={String(el.id ?? `el-${i}`)}
                        className={`absolute z-[4] flex cursor-grab touch-none select-none items-center justify-center rounded-2xl p-1 transition active:cursor-grabbing ${isSelected ? "ring-2 ring-[#FACC15] ring-offset-2 ring-offset-[#145f38]" : ""}`}
                        style={commonStyle}
                        onPointerDown={(e) => dragElement(e, i)}
                        title={String(el.type)}
                      >
                        <EquipmentGlyph
                          type={el.type}
                          color={el.type === "text" ? String(el.color ?? elEquipColor ?? "#F8FAFC") : elEquipColor}
                          format={el.type === "text" ? String(el.fontFamily ?? "Arial") : elEquipFormat}
                          fontSize={el.type === "text" ? Number(el.fontSize ?? 16) : undefined}
                        fontWeight={el.type === "text" ? String(el.fontWeight ?? "700") : undefined}
                        label={el.type === "text" ? String(el.label ?? "") : undefined}
                        textWidth={el.type === "text" ? Number(el.textWidth ?? 220) : undefined}
                        textHeight={el.type === "text" ? Number(el.textHeight ?? 34) : undefined}
                        textAlign={el.type === "text" && (el.textAlign === "left" || el.textAlign === "right" || el.textAlign === "center") ? el.textAlign : undefined}
                        textVerticalAlign={el.type === "text" && (el.textVerticalAlign === "top" || el.textVerticalAlign === "middle" || el.textVerticalAlign === "bottom") ? el.textVerticalAlign : undefined}
                      />
                        {el.type === "text" && isSelected && (
                          <>
                            <span
                              className="absolute -right-1.5 top-1/2 h-4 w-4 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-[#FACC15] bg-[#0F172A]"
                              title="Allarga testo"
                              onPointerDown={(e) => resizeSelectedTextBox(e, "x")}
                            />
                            <span
                              className="absolute bottom-[-6px] left-1/2 h-4 w-4 -translate-x-1/2 cursor-ns-resize rounded-full border-2 border-[#FACC15] bg-[#0F172A]"
                              title="Alza testo"
                              onPointerDown={(e) => resizeSelectedTextBox(e, "y")}
                            />
                            <span
                              className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-[#FACC15] bg-[#0F172A]"
                              title="Ridimensiona testo"
                              onPointerDown={(e) => resizeSelectedTextBox(e, "both")}
                            />
                          </>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={String(el.id ?? `el-${i}`)}>
                      <div
                        className={playerClassName}
                        style={markerStyle}
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

              {selectedElementIndex !== null && selectedElement && selectedElementMenuStyle && fieldElementMenuOpen && (
                <div
                  className={`absolute z-30 transition-[left,top,transform] duration-150 ease-out ${selectedElementMenuClass} ${
                    useCompactElementMenu
                      ? "w-auto rounded-xl border border-transparent bg-transparent p-0 shadow-none"
                      : "w-64 rounded-2xl border border-white/10 bg-[#0F172A]/95 p-3 shadow-2xl backdrop-blur"
                  }`}
                  style={selectedElementMenuStyle}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  {!useCompactElementMenu && (
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-white/90">{selectedElementLabel}</div>
                      {selectedElementMeta.length > 0 && (
                        <div className="truncate text-[10px] text-white/45">{selectedElementMeta.join(" · ")}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      className={`rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-600 ${useCompactElementMenu ? "hidden" : ""}`}
                      onClick={deleteSelectedElements}
                    >
                      Elimina
                    </button>
                  </div>
                  )}

                  {useCompactElementMenu && (
                    <div className={`flex items-start gap-1.5 ${markerMenuSide === "left" ? "flex-row-reverse" : ""}`}>
                      <div className="flex flex-col gap-0.5 rounded-lg border border-white/10 bg-[#0B1220]/45 p-1 shadow-lg backdrop-blur-md">
                        {compactElementToolItems.map((item) => {
                          const Icon = item.icon;
                          const active = markerPanel === item.id;
                          return (
                            <button
                              key={`marker-panel-${item.id}`}
                              type="button"
                              title={item.label}
                              aria-label={item.label}
                              onClick={() => toggleMarkerPanel(item.id)}
                              className={`flex h-8 w-8 items-center justify-center rounded-md border transition ${
                                active ? "border-[#FACC15] bg-[#FACC15] text-black" : "border-white/10 bg-white/5 text-white/80 hover:bg-white/15"
                              }`}
                            >
                              <Icon size={15} />
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          title="Elimina"
                          aria-label="Elimina"
                          onClick={deleteSelectedElements}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-red-400/40 bg-red-500/15 text-red-100 transition hover:bg-red-500 hover:text-white"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      {markerPanel && (
                      <div className={`min-w-0 ${markerPanelWidthClass} ${markerPanelOffsetClass}`}>
                      {markerPanel === "assign" && (
                        <div className="rounded-lg border border-white/10 bg-[#0B1220]/55 p-1.5 shadow-lg backdrop-blur-md">
{playerAssignmentOptions.length > 0 ? (
                        <div className="space-y-2">
                          {shouldChooseAssignmentTeam && (
                            <Select
                              value={activeAssignmentTeamId}
                              onValueChange={(value) => {
                                setAssignmentTeamId(value);
                                clearPlayerAssignmentForSelectedElement();
                              }}
                            >
                              <SelectTrigger className="h-8 bg-white/5 border-white/20 text-xs text-white">
                                <SelectValue placeholder="Scegli squadra" />
                              </SelectTrigger>
                              <SelectContent>
                                {freeAssignmentTeams.map((team) => (
                                  <SelectItem key={team.id} value={team.id}>
                                    {`${team.name} (${team.playerCount})`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}

                          {visiblePlayerAssignmentOptions.length > 0 ? (
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
                        <SelectTrigger className="h-8 bg-white/5 border-white/20 text-xs text-white">
                          <SelectValue placeholder="Seleziona giocatore" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Marker generico (nessun player)</SelectItem>
                          {visiblePlayerAssignmentOptions.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {[
                                p.jerseyNumber ?? "-",
                                `${p.firstName} ${p.lastName}`.trim(),
                                shouldChooseAssignmentTeam ? null : p.teamName,
                              ].filter(Boolean).join(" · ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                          ) : (
                            <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-xs text-white/50">
                              Nessun giocatore in questa squadra
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-xs text-white/50">
                          Nessuna rosa disponibile
                        </div>
                      )}
                        </div>
                      )}
                      {markerPanel === "text" && (
                        <div className="space-y-1.5 rounded-lg border border-white/10 bg-[#0B1220]/55 p-1.5 shadow-lg backdrop-blur-md">
                          <label className="min-w-0">
                            <textarea
                              value={String(isSelectedTextElement ? selectedElement.label ?? "" : selectedElement.displayName ?? selectedElement.name ?? "")}
                              onChange={(e) => isSelectedTextElement ? updateSelectedTextContent(e.target.value) : updateSelectedPlayerText(e.target.value)}
                              placeholder={isSelectedTextElement ? "Scrivi testo" : "Nome o etichetta"}
                              rows={isSelectedTextElement ? 3 : 1}
                              className="min-h-8 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs leading-tight text-white outline-none placeholder:text-white/35"
                            />
                          </label>
                          {isSelectedTextElement && (
                            <>
                              <div className="grid grid-cols-3 gap-1">
                                {["Arial", "Helvetica", "Verdana"].map((font) => (
                                  <button
                                    key={`compact-text-combined-font-${font}`}
                                    type="button"
                                    onClick={() => updateSelectedTextStyle({ fontFamily: font })}
                                    className={`h-8 rounded-lg px-2 text-left text-[10px] font-semibold ${String(selectedElement.fontFamily ?? "Arial") === font ? "bg-[#FACC15] text-black" : "text-white/90 hover:bg-white/10"}`}
                                  >
                                    {font.slice(0, 4)}
                                  </button>
                                ))}
                              </div>
                              <div className="grid grid-cols-5 gap-1">
                                {[14, 16, 20, 24].map((size) => (
                                  <button
                                    key={`compact-text-combined-size-${size}`}
                                    type="button"
                                    onClick={() => updateSelectedTextStyle({ fontSize: size })}
                                    className={`h-8 rounded-lg text-xs font-bold ${Number(selectedElement.fontSize ?? 16) === size ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"}`}
                                  >
                                    {size}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => updateSelectedTextStyle({ fontWeight: String(selectedElement.fontWeight ?? "700") === "700" ? "400" : "700" })}
                                  className={`h-8 rounded-lg text-xs font-black ${String(selectedElement.fontWeight ?? "700") === "700" ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"}`}
                                >
                                  B
                                </button>
                              </div>
                              <div className="grid grid-cols-3 gap-1">
                                {[
                                  { label: "Sx", value: "left" as const },
                                  { label: "C", value: "center" as const },
                                  { label: "Dx", value: "right" as const },
                                ].map((option) => {
                                  const active = String(selectedElement.textAlign ?? "center") === option.value;
                                  return (
                                    <button
                                      key={`compact-text-align-${option.value}`}
                                      type="button"
                                      title={`Allinea ${option.label}`}
                                      onClick={() => setSelectedTextAlign(option.value)}
                                      className={`h-8 rounded-lg text-xs font-black ${active ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"}`}
                                    >
                                      {option.label}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="grid grid-cols-3 gap-1">
                                {[
                                  { label: "Alto", value: "top" as const },
                                  { label: "Med", value: "middle" as const },
                                  { label: "Basso", value: "bottom" as const },
                                ].map((option) => {
                                  const active = String(selectedElement.textVerticalAlign ?? "middle") === option.value;
                                  return (
                                    <button
                                      key={`compact-text-valign-${option.value}`}
                                      type="button"
                                      title={`Allinea ${option.label}`}
                                      onClick={() => setSelectedTextVerticalAlign(option.value)}
                                      className={`h-8 rounded-lg text-xs font-black ${active ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"}`}
                                    >
                                      {option.label}
                                    </button>
                                  );
                                })}
                              </div>
                              <ColorSwatches
                                value={String(selectedElement.color ?? "#F8FAFC")}
                                onChange={setSelectedDrawingColor}
                                ariaPrefix="Colore testo"
                                className="flex gap-1 px-1"
                              />
                            </>
                          )}
                        </div>
                      )}
                      {markerPanel === "number" && (
                        <div className="rounded-lg border border-white/10 bg-[#0B1220]/55 p-1.5 shadow-lg backdrop-blur-md">
                        <label>
                          <input
                            value={selectedElement.number != null ? String(selectedElement.number) : selectedElement.playerNumber != null ? String(selectedElement.playerNumber) : ""}
                            onChange={(e) => updateSelectedPlayerNumber(e.target.value)}
                            inputMode="numeric"
                            placeholder="#"
                            className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white outline-none placeholder:text-white/35"
                          />
                        </label>
                        </div>
                      )}
                      {markerPanel === "color" && (
                      <div className="rounded-lg border border-white/10 bg-[#0B1220]/55 p-1.5 shadow-lg backdrop-blur-md">
                        {canEditPlayerMarker ? (
                          <ColorSwatches
                            value={String(selectedElement.markerColor ?? defaultMarkerColor(selectedElement.type, selectedElement.rosterStatus))}
                            onChange={setSelectedMarkerColor}
                            ariaPrefix="Colore marker"
                            options={MARKER_COLOR_OPTIONS}
                            className="flex gap-1 px-1"
                          />
                        ) : isEquipmentType(selectedElement.type) && selectedElement.type !== "text" ? (
                          <div className="flex gap-1 px-1">
                            {EQUIPMENT_COLOR_OPTIONS.map((c) => {
                              const current = typeof selectedElement.equipColor === "string" ? selectedElement.equipColor : "default";
                              const active = current === c.value;
                              return (
                                <button
                                  key={`compact-equipment-color-${c.value}`}
                                  type="button"
                                  onClick={() => setSelectedEquipmentColor(c.value)}
                                  className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                                    active ? "border-white bg-white/15" : "border-white/10 hover:bg-white/10"
                                  }`}
                                  title={c.label}
                                  aria-label={`Colore attrezzatura ${c.label}`}
                                >
                                  {c.value === "default" ? (
                                    <span className="text-[10px] font-black text-white/80">D</span>
                                  ) : (
                                    <span className="block h-4 w-4 rounded-full border border-white/40" style={{ backgroundColor: c.value }} />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <ColorSwatches
                            value={String(selectedElement.color ?? (selectedElement.type === "text" || isSelectedMeasure ? "#F8FAFC" : "#FACC15"))}
                            onChange={setSelectedDrawingColor}
                            ariaPrefix="Colore elemento"
                            className="flex gap-1 px-1"
                          />
                        )}
                      </div>
                      )}
                      {markerPanel === "line" && (
                        <div className="rounded-lg border border-white/10 bg-[#0B1220]/55 p-1.5 shadow-lg backdrop-blur-md">
                          <div className="grid grid-cols-4 gap-1">
                            {[1.4, 2, 2.8, 3.6].map((size) => (
                              <button
                                key={`compact-line-width-${size}`}
                                type="button"
                                onClick={() => setSelectedDrawingLineWidth(size)}
                                className={`h-8 rounded-lg text-xs font-bold ${
                                  Number(selectedElement.lineWidth ?? 1.8) === size ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"
                                }`}
                              >
                                {size}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {markerPanel === "arrow" && (
                        <div className="rounded-lg border border-white/10 bg-[#0B1220]/55 p-1.5 shadow-lg backdrop-blur-md">
                          <div className="grid grid-cols-4 gap-1">
                            {(["none", "start", "end", "both"] as const).map((heads) => (
                              <button
                                key={`compact-arrow-heads-${heads}`}
                                type="button"
                                onClick={() => updateSelectedElements((item) => item.type === "arrow" || item.type === "bezierarrow" ? { ...item, arrowHeads: heads, arrowEnd: heads === "end" || heads === "both" ? "end" : "none" } : item)}
                                className={`h-8 rounded-lg text-[10px] font-bold ${
                                  resolveArrowHeads(selectedElement) === heads ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"
                                }`}
                              >
                                {heads === "none" ? "No" : heads === "start" ? "In" : heads === "end" ? "Fine" : "2"}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {markerPanel === "shape" && (
                        <div className="rounded-lg border border-white/10 bg-[#0B1220]/55 p-1.5 shadow-lg backdrop-blur-md">
                          <div className="grid grid-cols-2 gap-1">
                            {ZONE_SHAPE_OPTIONS.map((shape) => {
                              const active = String(selectedElement.drawShape ?? "zone-square") === `zone-${shape.id}`;
                              return (
                                <button
                                  key={`compact-zone-shape-${shape.id}`}
                                  type="button"
                                  onClick={() => setSelectedZoneShape(shape.id)}
                                  className={`h-8 rounded-lg px-2 text-left text-xs font-semibold ${active ? "bg-[#FACC15] text-black" : "text-white/90 hover:bg-white/10"}`}
                                >
                                  {shape.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {markerPanel === "format" && (
                        <div className="rounded-lg border border-white/10 bg-[#0B1220]/55 p-1.5 shadow-lg backdrop-blur-md">
                          <div className="grid grid-cols-4 gap-1">
                            {selectedGoalVariant ? GOAL_TOOL_VARIANTS.filter((variant) => variant.showInMenu).map((variant) => {
                              const active = selectedElement.type === variant.id || ((selectedElement.type === "goal" || selectedElement.type === "goalLarge") && variant.id === "goal9");
                              return (
                                <button
                                  key={`compact-goal-size-${variant.id}`}
                                  type="button"
                                  title={variant.label}
                                  onClick={() => setSelectedGoalType(variant.id)}
                                  className={`h-8 rounded-lg text-xs font-black transition ${
                                    active ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"
                                  }`}
                                >
                                  {variant.shortLabel}
                                </button>
                              );
                            }) : selectedEquipmentFormats.length > 0 ? selectedEquipmentFormats.map((option) => {
                              const currentFormat = typeof selectedElement.equipFormat === "string"
                                ? selectedElement.equipFormat
                                : defaultEquipmentFormat(selectedElement.type);
                              const active = currentFormat === option.id;
                              return (
                                <button
                                  key={`compact-equipment-format-${String(option.id)}`}
                                  type="button"
                                  title={option.label}
                                  onClick={() => setSelectedEquipmentFormat(option.id)}
                                  className={`h-8 rounded-lg text-xs font-black transition ${
                                    active ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"
                                  }`}
                                >
                                  {option.shortLabel}
                                </button>
                              );
                            }) : isSelectedTextElement ? [14, 16, 20, 24].map((size) => (
                              <button
                                key={`compact-format-text-size-${size}`}
                                type="button"
                                onClick={() => updateSelectedTextStyle({ fontSize: size })}
                                className={`h-8 rounded-lg text-xs font-bold ${Number(selectedElement.fontSize ?? 16) === size ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"}`}
                              >
                                {size}
                              </button>
                            )) : selectedElement.type === "zone" ? ZONE_SHAPE_OPTIONS.map((shape) => {
                              const active = String(selectedElement.drawShape ?? "zone-square") === `zone-${shape.id}`;
                              return (
                                <button
                                  key={`compact-format-zone-shape-${shape.id}`}
                                  type="button"
                                  onClick={() => setSelectedZoneShape(shape.id)}
                                  className={`h-8 rounded-lg px-1 text-[10px] font-semibold ${active ? "bg-[#FACC15] text-black" : "text-white/90 hover:bg-white/10"}`}
                                >
                                  {shape.label.slice(0, 3)}
                                </button>
                              );
                            }) : isDrawingType(selectedElement.type) ? [1.4, 2, 2.8, 3.6].map((size) => (
                              <button
                                key={`compact-format-line-width-${size}`}
                                type="button"
                                onClick={() => setSelectedDrawingLineWidth(size)}
                                className={`h-8 rounded-lg text-xs font-bold ${
                                  Number(selectedElement.lineWidth ?? 1.8) === size ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"
                                }`}
                              >
                                {size}
                              </button>
                            )) : ELEMENT_SCALE_OPTIONS.map((option) => {
                              const active = Math.abs(Number(selectedElement.scale ?? 1) - option.value) < 0.01;
                              return (
                                <button
                                  key={`compact-element-scale-${option.id}`}
                                  type="button"
                                  onClick={() => setSelectedElementScale(option.value)}
                                  className={`h-8 rounded-lg text-xs font-black transition ${
                                    active ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"
                                  }`}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {markerPanel === "measure" && (
                        <div className="rounded-lg border border-white/10 bg-[#0B1220]/55 p-1.5 shadow-lg backdrop-blur-md">
                          <div className="grid grid-cols-4 gap-1">
                            {[1.8, 2.35, 3, 3.8].map((size) => (
                              <button
                                key={`compact-measure-text-${size}`}
                                type="button"
                                onClick={() => setSelectedMeasureTextSize(size)}
                                className={`h-8 rounded-lg text-xs font-bold ${
                                  Number(selectedElement.measureTextSize ?? 2.35) === size ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"
                                }`}
                              >
                                {size}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {markerPanel === "font" && (
                        <div className="rounded-lg border border-white/10 bg-[#0B1220]/55 p-1.5 shadow-lg backdrop-blur-md">
                          <div className="mb-1 grid grid-cols-3 gap-1">
                            {["Arial", "Helvetica", "Verdana"].map((font) => (
                              <button
                                key={`compact-text-font-${font}`}
                                type="button"
                                onClick={() => updateSelectedTextStyle({ fontFamily: font })}
                                className={`h-8 rounded-lg px-2 text-left text-[10px] font-semibold ${String(selectedElement.fontFamily ?? "Arial") === font ? "bg-[#FACC15] text-black" : "text-white/90 hover:bg-white/10"}`}
                              >
                                {font.slice(0, 4)}
                              </button>
                            ))}
                          </div>
                          <div className="grid grid-cols-5 gap-1">
                            {[14, 16, 20, 24].map((size) => (
                              <button
                                key={`compact-text-size-${size}`}
                                type="button"
                                onClick={() => updateSelectedTextStyle({ fontSize: size })}
                                className={`h-8 rounded-lg text-xs font-bold ${Number(selectedElement.fontSize ?? 16) === size ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"}`}
                              >
                                {size}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => updateSelectedTextStyle({ fontWeight: String(selectedElement.fontWeight ?? "700") === "700" ? "400" : "700" })}
                              className={`h-8 rounded-lg text-xs font-black ${String(selectedElement.fontWeight ?? "700") === "700" ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"}`}
                            >
                              B
                            </button>
                          </div>
                        </div>
                      )}
                      {markerPanel === "rotate" && (
                        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#0B1220]/55 p-1.5 shadow-lg backdrop-blur-md">
                          <input
                            type="range"
                            min="0"
                            max="360"
                            step="5"
                            value={selectedRotation}
                            onChange={(e) => setSelectedElementsRotation(Number(e.target.value))}
                            className="h-2 min-w-0 flex-1 cursor-pointer accent-[#FACC15]"
                            aria-label="Ruota marker"
                          />
                          <span className="w-9 shrink-0 text-right text-xs font-bold text-white/85">{selectedRotation}°</span>
                        </div>
                      )}
                      </div>
                      )}
                    </div>
                  )}

                  {!useCompactElementMenu && isDrawingType(selectedElement.type) && selectedElement.type !== "zone" && String(selectedElement.drawShape ?? "") !== "measure-line" && (
                    <div className="mb-3 rounded-xl border border-white/10 bg-white/5 p-2">
                      <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Disegno</div>
                      {(selectedElement.type === "arrow" || selectedElement.type === "bezierarrow") && (
                        <div className="mb-2 grid grid-cols-4 gap-1">
                          {(["none", "start", "end", "both"] as const).map((heads) => (
                            <button
                              key={`selected-arrow-heads-${heads}`}
                              type="button"
                              onClick={() => updateSelectedElements((item) => item.type === "arrow" || item.type === "bezierarrow" ? { ...item, arrowHeads: heads, arrowEnd: heads === "end" || heads === "both" ? "end" : "none" } : item)}
                              className={`h-8 rounded-lg text-[10px] font-bold ${
                                resolveArrowHeads(selectedElement) === heads ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"
                              }`}
                            >
                              {heads === "none" ? "No" : heads === "start" ? "In" : heads === "end" ? "Fine" : "2"}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="mb-2 grid grid-cols-4 gap-1">
                        {[1.4, 2, 2.8, 3.6].map((size) => (
                          <button
                            key={`selected-line-width-${size}`}
                            type="button"
                            onClick={() => setSelectedDrawingLineWidth(size)}
                            className={`h-8 rounded-lg text-xs font-bold ${
                              Number(selectedElement.lineWidth ?? 1.8) === size ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                      <ColorSwatches value={String(selectedElement.color ?? "#FACC15")} onChange={setSelectedDrawingColor} ariaPrefix="Colore disegno selezionato" />
                    </div>
                  )}

                  {!useCompactElementMenu && selectedElement.type === "zone" && (
                    <div className="mb-3 rounded-xl border border-white/10 bg-white/5 p-2">
                      <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Zona</div>
                      <div className="mb-2 grid grid-cols-2 gap-1">
                        {ZONE_SHAPE_OPTIONS.map((shape) => {
                          const active = String(selectedElement.drawShape ?? "zone-square") === `zone-${shape.id}`;
                          return (
                            <button
                              key={`selected-zone-shape-${shape.id}`}
                              type="button"
                              onClick={() => setSelectedZoneShape(shape.id)}
                              className={`rounded-lg px-2 py-2 text-left text-xs font-semibold ${active ? "bg-[#FACC15] text-black" : "text-white/90 hover:bg-white/10"}`}
                            >
                              {shape.label}
                            </button>
                          );
                        })}
                      </div>
                      <ColorSwatches value={String(selectedElement.color ?? "#FACC15")} onChange={setSelectedDrawingColor} ariaPrefix="Colore zona selezionata" />
                    </div>
                  )}

                  {!useCompactElementMenu && String(selectedElement.drawShape ?? "") === "measure-line" && (
                    <div className="mb-3 rounded-xl border border-white/10 bg-white/5 p-2">
                      <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Misura</div>
                      <div className="mb-2 grid grid-cols-4 gap-1">
                        {[1.8, 2.35, 3, 3.8].map((size) => (
                          <button
                            key={`selected-measure-text-${size}`}
                            type="button"
                            onClick={() => setSelectedMeasureTextSize(size)}
                            className={`h-8 rounded-lg text-xs font-bold ${
                              Number(selectedElement.measureTextSize ?? 2.35) === size ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                      <ColorSwatches value={String(selectedElement.color ?? "#F8FAFC")} onChange={setSelectedDrawingColor} ariaPrefix="Colore misura selezionata" />
                    </div>
                  )}

                  {!useCompactElementMenu && selectedElement.type === "text" && (
                    <div className="mb-3 rounded-xl border border-white/10 bg-white/5 p-2">
                      <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Testo</div>
                      <div className="mb-2 grid gap-1">
                        {["Helvetica", "Arial", "Verdana"].map((font) => (
                          <button
                            key={`selected-text-font-${font}`}
                            type="button"
                            onClick={() => updateSelectedTextStyle({ fontFamily: font })}
                            className={`rounded-lg px-3 py-2 text-left text-sm ${String(selectedElement.fontFamily ?? "Arial") === font ? "bg-[#FACC15] text-black" : "text-white/90 hover:bg-white/10"}`}
                          >
                            {font}
                          </button>
                        ))}
                      </div>
                      <div className="mb-2 grid grid-cols-4 gap-1">
                        {[14, 16, 20, 24].map((size) => (
                          <button
                            key={`selected-text-size-${size}`}
                            type="button"
                            onClick={() => updateSelectedTextStyle({ fontSize: size })}
                            className={`h-8 rounded-lg text-xs font-bold ${Number(selectedElement.fontSize ?? 16) === size ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"}`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => updateSelectedTextStyle({ fontWeight: String(selectedElement.fontWeight ?? "700") === "700" ? "400" : "700" })}
                        className={`mb-2 h-8 w-full rounded-lg text-xs font-bold ${String(selectedElement.fontWeight ?? "700") === "700" ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"}`}
                      >
                        Grassetto
                      </button>
                      <ColorSwatches value={String(selectedElement.color ?? "#F8FAFC")} onChange={setSelectedDrawingColor} ariaPrefix="Colore testo selezionato" />
                    </div>
                  )}

                  {!useCompactElementMenu && goalVariantForType(selectedElement.type) && (
                    <div className="mb-3 rounded-xl border border-white/10 bg-white/5 p-2">
                      <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Formato porta</div>
                      <div className="grid grid-cols-4 gap-1">
                        {GOAL_TOOL_VARIANTS.filter((variant) => variant.showInMenu).map((variant) => {
                          const active = selectedElement.type === variant.id || ((selectedElement.type === "goal" || selectedElement.type === "goalLarge") && variant.id === "goal9");
                          return (
                            <button
                              key={`field-goal-size-${variant.id}`}
                              type="button"
                              title={variant.label}
                              onClick={() => setSelectedGoalType(variant.id)}
                              className={`h-8 rounded-lg text-xs font-black transition ${
                                active ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"
                              }`}
                            >
                              {variant.shortLabel}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {!useCompactElementMenu && equipmentFormatOptions(selectedElement.type).length > 0 && (
                    <div className="mb-3 rounded-xl border border-white/10 bg-white/5 p-2">
                      <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Formato</div>
                      <div className="grid grid-cols-3 gap-1">
                        {equipmentFormatOptions(selectedElement.type).map((option) => {
                          const currentFormat = typeof selectedElement.equipFormat === "string"
                            ? selectedElement.equipFormat
                            : defaultEquipmentFormat(selectedElement.type);
                          const active = currentFormat === option.id;
                          return (
                            <button
                              key={`field-equipment-format-${String(option.id)}`}
                              type="button"
                              title={option.label}
                              onClick={() => setSelectedEquipmentFormat(option.id)}
                              className={`h-8 rounded-lg text-xs font-black transition ${
                                active ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"
                              }`}
                            >
                              {option.shortLabel}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {!useCompactElementMenu && isEquipmentType(selectedElement.type) && selectedElement.type !== "text" && (
                    <div className="mb-3 rounded-xl border border-white/10 bg-white/5 p-2">
                      <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Colore</div>
                      <div className="grid grid-cols-8 gap-1">
                        {EQUIPMENT_COLOR_OPTIONS.map((c) => {
                          const current = typeof selectedElement.equipColor === "string" ? selectedElement.equipColor : "default";
                          const active = current === c.value;
                          return (
                            <button
                              key={`field-equipment-color-${c.value}`}
                              type="button"
                              onClick={() => setSelectedEquipmentColor(c.value)}
                              className={`flex h-8 items-center justify-center rounded-lg border transition ${
                                active ? "border-white bg-white/15" : "border-white/10 hover:bg-white/10"
                              }`}
                              title={c.label}
                              aria-label={`Colore attrezzatura ${c.label}`}
                            >
                              {c.value === "default" ? (
                                <span className="text-[10px] font-black text-white/80">D</span>
                              ) : (
                                <span className="block h-4 w-4 rounded-full border border-white/40" style={{ backgroundColor: c.value }} />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {!useCompactElementMenu && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                    <div className="mb-2 flex items-center justify-between gap-2 px-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Ruota</span>
                      <span className="text-xs font-bold text-white/80">{selectedRotation}°</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="5"
                      value={selectedRotation}
                      onChange={(e) => setSelectedElementsRotation(Number(e.target.value))}
                      className="h-2 w-full cursor-pointer accent-[#FACC15]"
                      aria-label="Ruota elemento"
                    />
                    <div className="mt-2 grid grid-cols-4 text-center text-[10px] text-white/40">
                      <span>0°</span>
                      <span>90°</span>
                      <span>180°</span>
                      <span>270°</span>
                    </div>
                    <div className="hidden">
                      <button
                        type="button"
                        onClick={() => rotateSelectedElements(-15)}
                        className="rounded-lg bg-white/5 px-3 py-2 text-sm font-bold text-white/90 transition hover:bg-white/10"
                      >
                        -15°
                      </button>
                      <button
                        type="button"
                        onClick={() => rotateSelectedElements(15)}
                        className="rounded-lg bg-white/5 px-3 py-2 text-sm font-bold text-white/90 transition hover:bg-white/10"
                      >
                        +15°
                      </button>
                    </div>
                  </div>
                  )}
                </div>
              )}

            </div>

            {isMatchPreparationUi && boardMode === "assigned" && matchPlanPitchPlacement.ordered.some((o) => o.isReserve) ? (
              <div className="relative w-full rounded-xl border border-white/10 bg-[#0F172A]/70 px-2 py-1.5 shadow-lg backdrop-blur-sm">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Panchina</div>
                <div className="relative min-h-[48px] w-full">
                  {matchPlanPitchPlacement.ordered
                    .filter((o) => o.isReserve)
                    .map((row) => {
                      const i = row.index;
                      const el = elements[i];
                      if (!el || !isPlayerType(el.type) || el.type === "opponent") return null;

                      const linkedPlayer = el.playerId
                        ? teamPlayers.find((p) => String(p.id) === String(el.playerId))
                        : null;
                      const rawLabel = typeof el.label === "string" ? el.label.trim() : "";
                      const rawName = typeof el.name === "string" ? el.name.trim() : "";
                      const rawDisplayName =
                        typeof (el as { displayName?: unknown }).displayName === "string"
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
                      const rawNumber = el.number as unknown;
                      const rawPlayerNumber = el.playerNumber as unknown;
                      const nameCandidates = [
                        rawDisplayName,
                        rawName,
                        typeof rawNumber === "string" && !/^\d+$/.test(rawNumber.trim()) ? rawNumber.trim() : "",
                        typeof rawPlayerNumber === "string" && !/^\d+$/.test(rawPlayerNumber.trim())
                          ? rawPlayerNumber.trim()
                          : "",
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
                      const markerColor = MATCH_PLAN_RESERVE_MARKER_HEX;
                      const markerStyle = {
                        backgroundColor: markerColor,
                        color: markerTextColor(markerColor),
                      } as const;
                      const benchMarkerClass =
                        el.type === "player" || el.type === "goalkeeper"
                          ? `relative z-[5] flex h-8 w-8 touch-none select-none items-center justify-center rounded-full text-xs font-bold shadow-lg border-2 border-white/80${isSelected ? " ring-2 ring-[#FACC15] z-10" : ""}`
                          : `relative z-[5] flex h-8 w-8 touch-none select-none items-center justify-center rounded-full text-xs font-bold shadow-lg border-2 border-white/80${isSelected ? " ring-2 ring-[#FACC15] z-10" : ""}`;

                      return (
                        <div
                          key={`bench-${String(el.id ?? i)}`}
                          className="absolute flex flex-col items-center"
                          style={{
                            left: `${Number(el.x ?? 50)}%`,
                            top: "50%",
                            transform: "translate(-50%, -50%)",
                          }}
                        >
                          <div
                            className={benchMarkerClass}
                            style={markerStyle}
                            title="Riserva"
                          >
                            {content}
                          </div>
                          {playerSurname ? (
                            <div className="pointer-events-none mt-0.5 max-w-[5.5rem] truncate px-0.5 text-center text-[11px] font-semibold leading-none text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]">
                              {playerSurname}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : null}

              </div>
              <aside className="w-full shrink-0 rounded-2xl border border-white/10 bg-[#08142b]/90 px-3 py-3 shadow-xl backdrop-blur-md sm:px-4 xl:sticky xl:top-4">
                <div className="mb-4 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                  {boardActionTools.map((tool) => {
                    const Icon = tool.icon;
                    const active = activeBoardAction === tool.id;
                    return (
                    <button
                      key={`board-action-${tool.id}`}
                      type="button"
                      onClick={() => {
                        if (activeBoardAction === tool.id && tool.id === "match") {
                          setActiveBoardAction("none");
                          return;
                        }
                        if (tool.id === "match") {
                          if (!currentBoardId && !isMatchPlanBoard && !matchPrepBindingCommittedRef.current) {
                            setSelectedMatchId(null);
                          }
                          setActiveBoardAction(tool.id);
                          return;
                        }
                        setActiveBoardAction(tool.id);
                      }}
                      className={`min-h-10 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                        active
                          ? "border-[#FACC15] bg-[#FACC15] text-black"
                          : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Icon size={14} />
                        {tool.label}
                      </span>
                    </button>
                    );
                  })}
                  </div>

                  <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-2">
                    {activeBoardAction === "none" && (
                      <div className="px-1 py-2 text-[11px] text-white/50">
                        Seleziona un&apos;azione qui sopra. «Prepara partita» si richiude con un secondo clic.
                      </div>
                    )}
                    {activeBoardAction === "create" && (
                      <div className="grid gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentBoardId(null);
                            setBoardIdInUrl(null);
                            setBoardType("Training");
                            setBoardTitle("Nuova sessione lavagna");
                            setSelectedMatchId(null);
                            matchPrepBindingCommittedRef.current = false;
                            setElements([]);
                            setSelectedElementIndex(null);
                            setSelectedElementIndexes([]);
                            setSaveState("New");
                          }}
                          className="rounded-lg bg-white/10 px-2 py-2 text-left text-[11px] font-semibold text-white/85 transition hover:bg-white/15"
                        >
                          Nuova sessione vuota
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBoardType("Training");
                            setBoardTitle(boardTitle === "Nuova lavagna" ? "Sessione da lavagna" : boardTitle);
                            setSaveState("Unsaved");
                          }}
                          className="rounded-lg bg-white/10 px-2 py-2 text-left text-[11px] font-semibold text-white/85 transition hover:bg-white/15"
                        >
                          Crea sessione da questa lavagna
                        </button>
                      </div>
                    )}

                    {activeBoardAction === "exercise" && (
                      <div className="grid gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setBoardType("Exercise");
                            setBoardTitle(boardTitle === "Nuova lavagna" ? "Esercitazione libera" : boardTitle);
                            setSaveState("Unsaved");
                          }}
                          className="rounded-lg bg-white/10 px-2 py-2 text-left text-[11px] font-semibold text-white/85 transition hover:bg-white/15"
                        >
                          Esercitazione libera
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBoardType("Exercise");
                            setActiveBoardAction("load");
                          }}
                          className="rounded-lg bg-white/10 px-2 py-2 text-left text-[11px] font-semibold text-white/85 transition hover:bg-white/15"
                        >
                          Associa a sessione esistente
                        </button>
                      </div>
                    )}

                    {activeBoardAction === "tactics" && (
                      <label className="block space-y-1">
                        <span className="text-[11px] font-semibold text-white/55">Info tattiche</span>
                        <textarea
                          value={boardNotes}
                          onChange={(e) => {
                            setBoardNotes(e.target.value);
                            setSaveState("Unsaved");
                          }}
                          rows={4}
                          className="w-full resize-none rounded-lg border border-white/10 bg-[#0F172A] px-2 py-2 text-xs leading-tight text-white outline-none placeholder:text-white/35"
                          placeholder="Principi, obiettivi, indicazioni tattiche..."
                        />
                      </label>
                    )}

                    {activeBoardAction === "match" && (
                      <div className="grid min-w-0 gap-2">
                        <label className="grid min-w-0 gap-1">
                          <span className="text-[11px] font-semibold text-white/55">Partita</span>
                          <select
                            value={selectedMatchId ? String(selectedMatchId) : ""}
                            onChange={(e) => selectMatchForBoard(e.target.value)}
                            className="h-8 w-full min-w-0 rounded-lg border border-white/10 bg-[#0F172A] px-2 text-xs text-white outline-none"
                          >
                            <option value="">Seleziona partita</option>
                            {[
                              ["autunnale", "Fase autunnale"],
                              ["primaverile", "Fase primaverile"],
                              ["tornei", "Tornei"],
                              ["amichevoli", "Amichevoli"],
                            ].map(([phase, label]) => {
                              const items = matchOptions.filter((match) => matchOptionPhase(match) === phase);
                              if (!items.length) return null;
                              return (
                                <optgroup
                                  key={`match-phase-${phase}`}
                                  label={formatMatchPhaseGroupLabel(label, items)}
                                >
                                  {items.map((match) => (
                                    <option key={`match-option-${match.id}`} value={String(match.id)}>
                                      {formatMatchOptionLabel(match)}
                                    </option>
                                  ))}
                                </optgroup>
                              );
                            })}
                          </select>
                        </label>
                        <label className="grid min-w-0 gap-1">
                          <span className="text-[11px] font-semibold text-white/55">Modulo di partenza</span>
                          <div
                            className="flex h-8 min-h-8 w-full min-w-0 items-center rounded-lg border border-white/10 bg-[#0F172A] px-2 text-xs text-white/90"
                            title={detectedModule ? `Modulo rilevato: ${detectedModule}` : "Nessun modulo rilevato sul campo"}
                          >
                            <span className="min-w-0 truncate font-medium">{detectedModule || "—"}</span>
                          </div>
                        </label>
                        <label className="grid min-w-0 gap-1">
                          <span className="text-[11px] font-semibold text-white/55">Preset tattico</span>
                          <select
                            value={selectedPreset && isFormationPresetId(selectedPreset) ? selectedPreset : ""}
                            onChange={(e) => applyMatchPlanFormation(e.target.value)}
                            className="h-8 w-full min-w-0 rounded-lg border border-white/10 bg-[#0F172A] px-2 text-xs text-white outline-none"
                          >
                            <option value="">Seleziona modulo</option>
                            {formationPresetOptions.map((formation) => (
                              <option key={`match-plan-module-${formation}`} value={formation}>
                                {formation}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid min-w-0 gap-1">
                          <span className="text-[11px] font-semibold text-white/55">Tempo lavagna</span>
                          <select
                            value={matchPeriodKey}
                            onChange={(e) => setMatchPeriodKey(e.target.value as "t1" | "t2" | "t3" | "t4")}
                            className="h-8 w-full min-w-0 rounded-lg border border-white/10 bg-[#0F172A] px-2 text-xs text-white outline-none"
                          >
                            <option value="t1">1° tempo</option>
                            <option value="t2">2° tempo</option>
                            <option value="t3">3° tempo</option>
                            <option value="t4">4° tempo</option>
                          </select>
                        </label>
                        <label className="grid min-w-0 gap-1">
                          <span className="text-[11px] font-semibold text-white/55">{replacingElementIndex !== null ? "Sostituisci con" : "Aggiungi titolare"}</span>
                          <select
                            value={matchPlanPlayerId}
                            onChange={(e) => {
                              setMatchPlanPlayerId(e.target.value);
                              addMatchPlanPlayerToPitch(e.target.value);
                            }}
                            className="h-8 w-full min-w-0 rounded-lg border border-white/10 bg-[#0F172A] px-2 text-xs text-white outline-none"
                            disabled={!teamPlayers.length || !selectedMatchId}
                          >
                            <option value="">Seleziona giocatore</option>
                            {(["GK", "DEF", "MID", "FWD"] as const).map((macro) => {
                              const players = matchPlanSelectableGrouped[macro];
                              if (!players.length) return null;
                              return (
                                <optgroup key={`match-plan-group-${macro}`} label={macro}>
                                  {players.map((player) => (
                                    <option key={`match-plan-player-${player.id}`} value={String(player.id)}>
                                      {player.jerseyNumber ? `${player.jerseyNumber} · ` : ""}{fullPlayerName(player)}
                                    </option>
                                  ))}
                                </optgroup>
                              );
                            })}
                          </select>
                        </label>
                        <div className="rounded-lg border border-white/10 bg-[#0F172A] p-2">
                          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold text-white/55">
                            <span>Convocati da lavagna</span>
                            <span className="shrink-0 text-right">
                              {matchPlanPitchPlacement.ordered.filter((r) => !r.isReserve).length}/{matchPlanPitchPlacement.limit} · {matchPlanCalledPlayers.length}
                            </span>
                          </div>
                          <div className="grid max-h-40 min-h-24 content-start gap-1 overflow-x-hidden overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {matchPlanPitchPlacement.ordered.map(({ player, index, isReserve }) => {
                              const isGk = roleMacroKey(player.position) === "GK";
                              const starterBadgeClass = isGk ? "bg-[#FACC15] text-black" : "bg-[#2f9cf4] text-white";
                              const reserveBadgeClass = isGk ? "bg-[#FACC15] text-black" : "bg-amber-500 text-black";
                              return (
                              <div
                                key={`match-plan-field-player-${player.id}`}
                                className={`flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-[11px] ${
                                  isReserve ? "bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/35" : "bg-white/5 text-white/80"
                                }`}
                              >
                                <span
                                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                    isReserve ? reserveBadgeClass : starterBadgeClass
                                  }`}
                                >
                                  {isGk ? "GK" : player.jerseyNumber ?? "-"}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{fullPlayerName(player)}</span>
                                {isReserve && (
                                  <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase text-amber-200/90">Riserva</span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setReplacingElementIndex(index)}
                                  className="ml-auto rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white"
                                  title="Sostituisci"
                                >
                                  <RotateCcw size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeMatchPlanPlayer(index)}
                                  className="rounded-md p-1 text-white/60 hover:bg-red-500/70 hover:text-white"
                                  title="Rimuovi"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            );
                            })}
                            {!matchPlanPitchPlacement.ordered.length && (
                              <span className="self-center text-[11px] text-white/40">Nessun giocatore schierato</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void saveMatchSheetFromBoard()}
                          disabled={!selectedMatchId || !boardTeamId}
                          className="rounded-lg bg-emerald-600 px-2 py-2 text-left text-[11px] font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Salva partita (convocati e formazione)
                        </button>
                        {matchSheetSaveHint && (
                          <p className="text-[10px] leading-snug text-white/70">{matchSheetSaveHint}</p>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (returnToMatchUrl) {
                              goBackFromBoard();
                              return;
                            }
                            window.location.href = selectedMatchSheetUrl ?? (boardTeamId ? `/calendari/${boardTeamId}` : "/matches");
                          }}
                          className="rounded-lg bg-[#FACC15] px-2 py-2 text-left text-[11px] font-bold text-black transition hover:opacity-90"
                        >
                          {returnToMatchUrl ? "Torna alla scheda partita" : selectedMatchSheetUrl ? "Apri scheda partita" : "Apri partite in programma"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBoardType("Match Plan");
                            setBottomMenu("players");
                            setSaveState("Unsaved");
                          }}
                          className="rounded-lg bg-white/10 px-2 py-2 text-left text-[11px] font-semibold text-white/85 transition hover:bg-white/15"
                        >
                          Prepara partita da questa lavagna
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-white/60">
                    <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                    Modifica lavagna live
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      closeToolPopovers();
                      setFieldElementMenuOpen(false);
                      setActiveTool("select");
                    }}
                    className={`flex h-9 w-full items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition ${
                      activeTool === "select"
                        ? "border-[#FACC15] bg-[#FACC15] text-black"
                        : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                    }`}
                  >
                    <MousePointer2 size={14} />
                    Seleziona
                  </button>
                  <div className="grid w-full grid-cols-4 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        closeToolPopovers();
                        setFieldElementMenuOpen(false);
                        setBottomMenu("players");
                      }}
                      className={`flex min-h-10 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium transition ${
                        bottomMenu === "players" ? "bg-[#FACC15] text-black" : "bg-white/10 text-white/80 hover:bg-white/15"
                      }`}
                    >
                      <Users size={14} />
                      Giocatori
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closeToolPopovers();
                        setFieldElementMenuOpen(false);
                        setBottomMenu("equipment");
                      }}
                      className={`flex min-h-10 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium transition ${
                        bottomMenu === "equipment" ? "bg-[#FACC15] text-black" : "bg-white/10 text-white/80 hover:bg-white/15"
                      }`}
                    >
                      <Package size={14} />
                      Attrezzatura
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closeToolPopovers();
                        setFieldElementMenuOpen(false);
                        setBottomMenu("drawing");
                      }}
                      className={`flex min-h-10 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium transition ${
                        bottomMenu === "drawing" ? "bg-[#FACC15] text-black" : "bg-white/10 text-white/80 hover:bg-white/15"
                      }`}
                    >
                      <PencilLine size={14} />
                      Disegno
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closeToolPopovers();
                        setFieldElementMenuOpen(false);
                        setBottomMenu("library");
                      }}
                      className={`flex min-h-10 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium transition ${
                        bottomMenu === "library" ? "bg-[#FACC15] text-black" : "bg-white/10 text-white/80 hover:bg-white/15"
                      }`}
                    >
                      <Library size={14} />
                      Libreria
                    </button>
                  </div>
                </div>

                {bottomMenu === "players" && (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      {playerTools.map((tool) => (
                        <button
                          key={`bottom-player-${tool.id}`}
                          type="button"
                          title={tool.label}
                          onClick={() => {
                            closeToolPopovers();
                            setActiveTool(tool.id);
                          }}
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
                          <span>{isMatchPreparationUi ? "Rosa convocazioni" : "Rosa caricata"}</span>
                          <span>
                            {isMatchPreparationUi
                              ? `${matchPlanPitchPlacement.ordered.filter((r) => !r.isReserve).length}/${matchPlanPitchPlacement.limit} · ${matchPlanCalledPlayers.length}`
                              : `${elements.filter((item) => item.playerId).length}/${teamPlayers.length}`}
                          </span>
                        </div>
                        <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          {isMatchPreparationUi ? (
                            <>
                              {!selectedMatchId ? (
                                <div className="rounded-xl border border-dashed border-white/15 px-2 py-3 text-center text-[11px] text-white/45">
                                  Seleziona una partita per gestire le convocazioni.
                                </div>
                              ) : !matchPlanCalledPlayers.length ? (
                                <div className="rounded-xl border border-dashed border-white/15 px-2 py-3 text-center text-[11px] text-white/45">
                                  Nessun convocato. Aggiungi titolari dal menu «Prepara partita».
                                </div>
                              ) : (
                                matchPlanCalledPlayers.map((player) => {
                                  const isGk = roleMacroKey(player.position) === "GK";
                                  const inBoard = usedMatchPlanPlayerIds.has(String(player.id));
                                  const isReserve = matchPlanPitchPlacement.reserveIds.has(String(player.id));
                                  let rowClass: string;
                                  let badgeClass: string;
                                  let status: string;
                                  if (!inBoard) {
                                    rowClass = "rounded-xl border border-white/10 bg-[#0F172A] px-2 py-2 text-left text-white/80";
                                    badgeClass = isGk ? "bg-[#FACC15] text-black" : "bg-[#2f9cf4] text-white";
                                    status = "Convocato · da schierare";
                                  } else if (isReserve) {
                                    rowClass =
                                      "rounded-xl border border-amber-400/40 bg-amber-500/15 px-2 py-2 text-left text-amber-100";
                                    badgeClass = isGk ? "bg-[#FACC15] text-black" : "bg-amber-500 text-black";
                                    status = "Riserva";
                                  } else {
                                    rowClass =
                                      "rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-2 py-2 text-left text-emerald-100";
                                    badgeClass = isGk ? "bg-[#FACC15] text-black" : "bg-emerald-500 text-white";
                                    status = "In campo";
                                  }
                                  return (
                                    <div key={`match-prep-roster-${player.id}`} className={rowClass}>
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${badgeClass}`}
                                        >
                                          {isGk ? "GK" : player.jerseyNumber ?? "-"}
                                        </span>
                                        <span className="min-w-0 truncate text-[11px] font-semibold">
                                          {formatRosterLastName(player)}
                                        </span>
                                      </div>
                                      <div className="mt-1 text-[10px] opacity-70">{status}</div>
                                    </div>
                                  );
                                })
                              )}
                            </>
                          ) : (
                            teamPlayers.map((player) => {
                                const isGk = roleMacroKey(player.position) === "GK";
                                const inBoard = usedPlayerIds.has(String(player.id));
                                const isPending = pendingRosterPlayerId === player.id;
                                const isUnavailable = !isPlayerAvailable(player);
                                const rosterBadgeClass = isUnavailable
                                  ? "bg-red-500 text-white"
                                  : inBoard
                                    ? isGk
                                      ? "bg-[#FACC15] text-black"
                                      : "bg-emerald-500 text-white"
                                    : isGk
                                      ? "bg-[#FACC15] text-black"
                                      : "bg-[#2f9cf4] text-white";
                                return (
                                  <button
                                    key={player.id}
                                    type="button"
                                    disabled={isUnavailable}
                                    onClick={() => {
                                      closeToolPopovers();
                                      setPendingRosterPlayerId(player.id);
                                      setActiveTool(isGoalkeeperPlayer(player) ? "goalkeeper" : "player");
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
                                      <span
                                        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${rosterBadgeClass}`}
                                      >
                                        {isGk ? "GK" : player.jerseyNumber ?? "-"}
                                      </span>
                                      <span className="min-w-0 truncate text-[11px] font-semibold">{formatRosterLastName(player)}</span>
                                    </div>
                                    <div className="mt-1 text-[10px] opacity-70">
                                      {isUnavailable ? "Non disponibile" : inBoard ? "In campo" : "Da schierare"}
                                    </div>
                                  </button>
                                );
                              })
                          )}
                        </div>
                        {isMatchPreparationUi && (
                          <button
                            type="button"
                            onClick={focusPlayersOnPitch}
                            disabled={!elements.some((item) => item.playerId)}
                            className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-[#FACC15]/35 bg-[#FACC15]/10 text-[11px] font-semibold text-[#FACC15] transition hover:bg-[#FACC15]/20 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <MousePointer2 size={13} />
                            Richiama schieramento in campo
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {bottomMenu === "drawing" && (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-5 gap-2">
                      {drawingTools.map((tool) => {
                        return tool.id === "movement" ? (
                          <div key="drawing-tool-movement" ref={movementToolShellRef} className="relative z-[60]">
                            <button
                              type="button"
                              title={tool.label}
                              aria-label={tool.label}
                              className={`flex h-12 w-full items-center justify-center rounded-2xl border transition ${
                                activeTool === "movement" || arrowMenuOpen
                                  ? "border-[#FACC15] bg-[#FACC15]/20"
                                  : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                const nextOpen = !arrowMenuOpen;
                                closeToolPopovers();
                                setActiveTool("movement");
                                setArrowMenuOpen(nextOpen);
                              }}
                            >
                              <DrawingToolGlyph type="movement" />
                            </button>
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
                        ) : tool.id === "draw" ? (
                          <div key="drawing-tool-draw" ref={drawToolShellRef} className="relative z-[60]">
                            <button
                              type="button"
                              title="Disegno"
                              aria-label="Disegno"
                              onClick={(e) => {
                                e.stopPropagation();
                                const nextOpen = !drawMenuOpen;
                                closeToolPopovers();
                                setActiveTool("draw");
                                setDrawMenuOpen(nextOpen);
                              }}
                              className={`flex h-12 w-full items-center justify-center rounded-2xl border transition ${
                                activeTool === "draw" || drawMenuOpen ? "border-[#FACC15] bg-[#FACC15]/20" : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                              }`}
                            >
                              <DrawingToolGlyph type="draw" />
                            </button>
                            {drawMenuOpen && drawMenuViewport && createPortal(
                              <div className="fixed z-[10000] rounded-xl border border-white/10 bg-[#0F172A] p-2 shadow-2xl" style={drawMenuViewport} onClick={(e) => e.stopPropagation()}>
                                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Spessore</div>
                                <div className="mb-2 grid grid-cols-4 gap-1">
                                  {[1.4, 2, 2.8, 3.6].map((size) => (
                                    <button key={size} type="button" onClick={() => setDrawToolPreset((p) => ({ ...p, lineWidth: size }))} className={`h-8 rounded-lg text-xs font-bold ${drawToolPreset.lineWidth === size ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"}`}>{size}</button>
                                  ))}
                                </div>
                                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Colore</div>
                                <ColorSwatches value={drawToolPreset.color} onChange={(color) => setDrawToolPreset((p) => ({ ...p, color }))} ariaPrefix="Colore disegno" />
                              </div>,
                              document.body
                            )}
                          </div>
                        ) : tool.id === "zones" ? (
                          <div key="drawing-tool-zone" ref={zoneToolShellRef} className="relative z-[60]">
                            <button
                              type="button"
                              title="Zona"
                              aria-label="Zona"
                              onClick={(e) => {
                                e.stopPropagation();
                                const nextOpen = !zoneMenuOpen;
                                closeToolPopovers();
                                setActiveTool("zones");
                                setZoneMenuOpen(nextOpen);
                              }}
                              className={`flex h-12 w-full items-center justify-center rounded-2xl border transition ${
                                activeTool === "zones" || zoneMenuOpen ? "border-[#FACC15] bg-[#FACC15]/20" : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                              }`}
                            >
                              <DrawingToolGlyph type="zones" />
                            </button>
                            {zoneMenuOpen && zoneMenuViewport && createPortal(
                              <div className="fixed z-[10000] rounded-xl border border-white/10 bg-[#0F172A] p-2 shadow-2xl" style={zoneMenuViewport} onClick={(e) => e.stopPropagation()}>
                                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Forma</div>
                                <div className="mb-2 grid grid-cols-2 gap-1">
                                  {ZONE_SHAPE_OPTIONS.map((shape) => (
                                    <button key={shape.id} type="button" onClick={() => setZoneToolPreset((p) => ({ ...p, shape: shape.id }))} className={`rounded-lg px-2 py-2 text-left text-xs font-semibold ${zoneToolPreset.shape === shape.id ? "bg-[#FACC15] text-black" : "text-white/90 hover:bg-white/10"}`}>{shape.label}</button>
                                  ))}
                                </div>
                                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Colore</div>
                                <ColorSwatches value={zoneToolPreset.color} onChange={(color) => setZoneToolPreset((p) => ({ ...p, color }))} ariaPrefix="Colore zona" />
                              </div>,
                              document.body
                            )}
                          </div>
                        ) : tool.id === "text" ? (
                          <div key="drawing-tool-text" ref={textToolShellRef} className="relative z-[60]">
                            <button
                              type="button"
                              title="Testo"
                              aria-label="Testo"
                              onClick={(e) => {
                                e.stopPropagation();
                                const nextOpen = !textMenuOpen;
                                closeToolPopovers();
                                setActiveTool("text");
                                setTextMenuOpen(nextOpen);
                              }}
                              className={`flex h-12 w-full items-center justify-center rounded-2xl border transition ${
                                activeTool === "text" || textMenuOpen ? "border-[#FACC15] bg-[#FACC15]/20" : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                              }`}
                            >
                              <DrawingToolGlyph type="text" />
                            </button>
                            {textMenuOpen && textMenuViewport && createPortal(
                              <div className="fixed z-[10000] rounded-xl border border-white/10 bg-[#0F172A] p-2 shadow-2xl" style={textMenuViewport} onClick={(e) => e.stopPropagation()}>
                                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Carattere</div>
                                <div className="mb-2 grid gap-1">
                                  {["Helvetica", "Arial", "Verdana"].map((font) => (
                                    <button key={font} type="button" onClick={() => setTextToolPreset((p) => ({ ...p, fontFamily: font }))} className={`rounded-lg px-3 py-2 text-left text-sm ${textToolPreset.fontFamily === font ? "bg-[#FACC15] text-black" : "text-white/90 hover:bg-white/10"}`}>{font}</button>
                                  ))}
                                </div>
                                <div className="mb-2 grid grid-cols-4 gap-1">
                                  {[14, 16, 20, 24].map((size) => (
                                    <button key={size} type="button" onClick={() => setTextToolPreset((p) => ({ ...p, fontSize: size }))} className={`h-8 rounded-lg text-xs font-bold ${textToolPreset.fontSize === size ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"}`}>{size}</button>
                                  ))}
                                </div>
                                <button type="button" onClick={() => setTextToolPreset((p) => ({ ...p, bold: !p.bold }))} className={`mb-2 h-8 w-full rounded-lg text-xs font-bold ${textToolPreset.bold ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"}`}>Grassetto</button>
                                <ColorSwatches value={textToolPreset.color} onChange={(color) => setTextToolPreset((p) => ({ ...p, color }))} ariaPrefix="Colore testo" />
                              </div>,
                              document.body
                            )}
                          </div>
                        ) : tool.id === "measure" ? (
                          <div key="drawing-tool-measure" ref={measureToolShellRef} className="relative z-[60]">
                            <button
                              type="button"
                              title="Misura"
                              aria-label="Misura"
                              onClick={(e) => {
                                e.stopPropagation();
                                const nextOpen = !measureMenuOpen;
                                closeToolPopovers();
                                setActiveTool("measure");
                                setMeasureMenuOpen(nextOpen);
                              }}
                              className={`flex h-12 w-full items-center justify-center rounded-2xl border transition ${
                                activeTool === "measure" || measureMenuOpen ? "border-[#FACC15] bg-[#FACC15]/20" : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                              }`}
                            >
                              <DrawingToolGlyph type="measure" />
                            </button>
                            {measureMenuOpen && measureMenuViewport && createPortal(
                              <div className="fixed z-[10000] rounded-xl border border-white/10 bg-[#0F172A] p-2 shadow-2xl" style={measureMenuViewport} onClick={(e) => e.stopPropagation()}>
                                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Testo misura</div>
                                <div className="mb-2 grid grid-cols-4 gap-1">
                                  {[1.8, 2.35, 3, 3.8].map((size) => (
                                    <button key={size} type="button" onClick={() => setMeasureToolPreset((p) => ({ ...p, textSize: size }))} className={`h-8 rounded-lg text-xs font-bold ${measureToolPreset.textSize === size ? "bg-[#FACC15] text-black" : "bg-white/5 text-white/80 hover:bg-white/10"}`}>{size}</button>
                                  ))}
                                </div>
                                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Colore</div>
                                <ColorSwatches value={measureToolPreset.color} onChange={(color) => setMeasureToolPreset((p) => ({ ...p, color }))} ariaPrefix="Colore misura" />
                              </div>,
                              document.body
                            )}
                          </div>
                        ) : (
                          <button
                            key={`drawing-tool-${tool.id}`}
                            type="button"
                            title={tool.label}
                            aria-label={tool.label}
                            onClick={() => {
                              closeToolPopovers();
                              setActiveTool(tool.id);
                            }}
                            className={`flex h-12 items-center justify-center rounded-2xl border transition ${
                              activeTool === tool.id
                                ? "border-[#FACC15] bg-[#FACC15]/20"
                                : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                            }`}
                          >
                            <DrawingToolGlyph type={tool.id} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {bottomMenu === "equipment" && (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-5 gap-2">
                      {equipmentTools.map((tool) =>
                      tool.id === "goalMenu" ? (
                        <div key="bottom-equipment-goal-menu" ref={goalToolShellRef} className="relative w-full">
                          <button
                            type="button"
                            title={`${tool.label}: ${GOAL_TOOL_VARIANTS.find((g) => g.id === selectedGoalTool)?.label ?? "Porta"}`}
                            className={`flex h-12 w-full overflow-hidden rounded-2xl border transition ${
                              goalVariantForType(activeTool) || goalMenuOpen
                                ? "border-[#FACC15] bg-[#FACC15]/20"
                                : "border-white/10 bg-white/5 hover:bg-white/10"
                            }`}
                            aria-label="Scegli dimensione porta"
                            onClick={(e) => {
                              e.stopPropagation();
                              const nextOpen = !goalMenuOpen;
                              closeToolPopovers();
                              setActiveTool(selectedGoalTool);
                              setGoalMenuOpen(nextOpen);
                            }}
                          >
                            <span className="flex min-w-0 flex-1 items-center justify-center">
                              <EquipmentGlyph type="goal9" color={equipmentColor === "default" ? undefined : equipmentColor} />
                            </span>
                          </button>
                          {goalMenuOpen &&
                            goalMenuViewport &&
                            createPortal(
                              <div
                                className="fixed z-[10000] max-h-[min(70vh,360px)] overflow-y-auto rounded-xl border border-white/10 bg-[#0F172A] p-2 shadow-2xl"
                                style={{
                                  top: goalMenuViewport.top,
                                  left: goalMenuViewport.left,
                                  width: goalMenuViewport.width,
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="grid gap-1">
                                  {GOAL_TOOL_VARIANTS.filter((variant) => variant.showInMenu).map((variant) => (
                                    <button
                                      key={variant.id}
                                      type="button"
                                      title={variant.label}
                                      onClick={() => {
                                        closeToolPopovers();
                                        setSelectedGoalTool(variant.id);
                                        setActiveTool(variant.id);
                                      }}
                                      className={`flex h-10 items-center gap-2 rounded-lg px-2 text-left text-xs font-semibold transition ${
                                        activeTool === variant.id
                                          ? "bg-[#FACC15] text-black"
                                          : "text-white/90 hover:bg-white/10"
                                      }`}
                                    >
                                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/5">
                                        <EquipmentGlyph type={variant.id} color={equipmentColor === "default" ? undefined : equipmentColor} />
                                      </span>
                                      <span className="min-w-0 text-sm font-black">{variant.shortLabel}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>,
                              document.body
                            )}
                        </div>
                      ) : (
                        <button
                          key={`bottom-equipment-${tool.id}`}
                          type="button"
                          title={tool.label}
                          onClick={() => {
                            closeToolPopovers();
                            setActiveTool(tool.id);
                          }}
                          className={`flex h-12 items-center justify-center rounded-2xl border transition ${
                            activeTool === tool.id
                              ? "border-[#FACC15] bg-[#FACC15]/20"
                              : "border-white/10 bg-white/5 hover:bg-white/10"
                          }`}
                        >
                          <EquipmentGlyph type={tool.id} color={equipmentColor === "default" ? undefined : equipmentColor} />
                        </button>
                      )
                      )}
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-2">
                      <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Colore</div>
                      <div className="grid grid-cols-8 gap-1">
                        {EQUIPMENT_COLOR_OPTIONS.map((c) => {
                          const active = equipmentColor === c.value;
                          return (
                            <button
                              key={c.value}
                              type="button"
                              onClick={() => setEquipmentColor(c.value)}
                              className={`flex h-8 items-center justify-center rounded-lg border transition ${
                                active ? "border-white bg-white/15" : "border-white/10 hover:bg-white/10"
                              }`}
                              title={c.label}
                              aria-label={`Colore attrezzatura ${c.label}`}
                            >
                              {c.value === "default" ? (
                                <span className="text-[10px] font-black text-white/80">D</span>
                              ) : (
                                <span
                                  className="block h-4 w-4 rounded-full border border-white/40"
                                  style={{ backgroundColor: c.value }}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
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
                    {canEditPlayerMarker && (
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
