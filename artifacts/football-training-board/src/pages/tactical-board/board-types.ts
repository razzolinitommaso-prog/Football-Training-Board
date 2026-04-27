export type TacticalBoardFormat = "3v3" | "5v5" | "7v7" | "9v9" | "11v11";

export type TacticalBoardPitchType = "mini" | "small" | "medium" | "large" | "full";

export type FootballCategoryId =
  | "Piccoli Amici"
  | "Primi Calci"
  | "Pulcini"
  | "Esordienti"
  | "Giovanissimi"
  | "Allievi"
  | "Juniores"
  | "Prima Squadra";

export type TacticalBoardElement = {
  type?: string;
  x?: number;
  y?: number;
  label?: string;
  playerNumber?: number;
  playerId?: string;
  name?: string;
  number?: number;
  [key: string]: unknown;
};

export type BoardPoint = {
  x: number;
  y: number;
};

export type BoardElementType =
  | "player"
  | "opponent"
  | "goalkeeper"
  | "ball"
  | "cone"
  | "goal"
  | "text"
  | "path"
  | "line"
  | "arrow"
  | "bezier"
  | "bezierarrow"
  | "goalLarge"
  | "disc"
  | "cinesino"
  | "sagoma"
  | "flag"
  | "ladder"
  | "hurdle"
  | "pole"
  | "vest"
  | "draw";

export type BoardElement = {
  id: string;
  type: BoardElementType;
  x?: number;
  y?: number;
  points?: BoardPoint[];
  shape?: string;
  label?: string;
  color?: string;
  lineWidth?: number;
  drawShape?: string;
  arrowEnd?: string;
  playerNumber?: number;
  playerName?: string;
  playerRole?: string;
  playerPhoto?: string;
  rotation?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  equipColor?: string;
};

export type SavedTactic = {
  name: string;
  elements: BoardElement[];
};

export type SerializedDrawingElement = {
  id: string;
  type: string;
  points: BoardPoint[];
  color: string;
  lineWidth: number;
  canvasW: number;
  canvasH: number;
};

/**
 * Tactical board "data" blob saved in the backend.
 *
 * Intentionally permissive: the backend blob already contains extra keys
 * (e.g. `updatedAt`, `notes`) and we must remain compatible.
 */
export type TacticalBoardData = {
  clubId?: string | number | null;
  format?: TacticalBoardFormat;
  pitchType?: TacticalBoardPitchType;
  preset?: string | null;
  activeTool?: string;
  focusMode?: boolean;
  teamId?: string | number | null;
  category?: FootballCategoryId | string | null;
  elements: TacticalBoardElement[];
  [key: string]: unknown;
};

