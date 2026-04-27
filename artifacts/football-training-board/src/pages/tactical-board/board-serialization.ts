import type {
  BoardElement,
  BoardPoint,
  SavedTactic,
  SerializedDrawingElement,
} from "./board-types";

const DEFAULT_SOURCE_CANVAS_WIDTH = 420;
const DEFAULT_SOURCE_CANVAS_HEIGHT = 280;

type CanvasSize = { w: number; h: number };

export function loadSavedTacticsFromStorage(storageKey = "ftb-tactics"): SavedTactic[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "[]") as SavedTactic[];
  } catch {
    return [];
  }
}

export function persistSavedTacticsToStorage(
  tactics: SavedTactic[],
  storageKey = "ftb-tactics",
): void {
  localStorage.setItem(storageKey, JSON.stringify(tactics));
}

export function serializeElementsForExercise(
  elements: BoardElement[],
  canvasSize: CanvasSize,
): string | null {
  if (elements.length === 0) {
    return null;
  }

  return JSON.stringify(
    elements.map((el) => ({
      id: el.id,
      type: el.type,
      points: el.points ?? [],
      color: el.color ?? "#facc15",
      lineWidth: el.lineWidth ?? 2,
      canvasW: canvasSize.w,
      canvasH: canvasSize.h,
    })),
  );
}

export function deserializeExerciseElements(
  drawingElementsJson: string,
  canvasSize: CanvasSize,
  createId: () => string,
): BoardElement[] {
  const raw = JSON.parse(drawingElementsJson) as SerializedDrawingElement[];

  return raw.map((el) => {
    const elementScaleX = canvasSize.w / (el.canvasW ?? DEFAULT_SOURCE_CANVAS_WIDTH);
    const elementScaleY = canvasSize.h / (el.canvasH ?? DEFAULT_SOURCE_CANVAS_HEIGHT);

    if (el.type === "circle" && el.points.length >= 2) {
      const [center, edge] = el.points;
      const radius = Math.sqrt((edge.x - center.x) ** 2 + (edge.y - center.y) ** 2);
      const circlePoints: BoardPoint[] = [];

      for (let i = 0; i <= 32; i++) {
        const angle = (i / 32) * Math.PI * 2;
        circlePoints.push({
          x: (center.x + Math.cos(angle) * radius) * elementScaleX,
          y: (center.y + Math.sin(angle) * radius) * elementScaleY,
        });
      }

      return {
        id: createId(),
        type: "path",
        points: circlePoints,
        color: el.color,
        lineWidth: el.lineWidth,
      };
    }

    const scaledPoints = (el.points ?? []).map((point) => ({
      x: point.x * elementScaleX,
      y: point.y * elementScaleY,
    }));
    const normalizedType: BoardElement["type"] =
      el.type === "path" ? "path" : el.type === "line" ? "line" : "arrow";

    return {
      id: createId(),
      type: normalizedType,
      points: scaledPoints,
      color: el.color,
      lineWidth: el.lineWidth,
    };
  });
}
