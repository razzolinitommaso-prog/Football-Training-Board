import type { TacticalBoardElement } from "./board-types";

export type AnimationFrame = { elements: TacticalBoardElement[]; durationMs: number };
export type BoardAnimation = { version: 1; frames: AnimationFrame[]; activeFrame: number; speed: number; loop: boolean };
export const MAX_ANIMATION_FRAMES = 60;
export const cloneElements = (elements: TacticalBoardElement[]): TacticalBoardElement[] => JSON.parse(JSON.stringify(elements));
export function identifyElements(elements: TacticalBoardElement[]): TacticalBoardElement[] {
  return cloneElements(elements).map(element => ({ ...element, animationId: typeof element.animationId === "string" ? element.animationId : element.playerId ? `player:${element.playerId}` : typeof element.id === "string" ? `element:${element.id}` : crypto.randomUUID() }));
}
export function readAnimation(value: unknown): BoardAnimation | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<BoardAnimation>;
  if (data.version !== 1 || !Array.isArray(data.frames) || !data.frames.length) return null;
  if (data.frames.length > MAX_ANIMATION_FRAMES || data.frames.some(frame => !frame || !Array.isArray(frame.elements) || frame.elements.some(element => !element || typeof element !== "object" || Array.isArray(element)))) return null;
  return { version: 1, frames: data.frames.map(frame => ({ elements: cloneElements(frame.elements), durationMs: Math.max(200, Math.min(30000, Number(frame.durationMs) || 2000)) })), activeFrame: Math.max(0, Math.min(data.frames.length - 1, Number.isInteger(data.activeFrame) ? data.activeFrame! : 0)), speed: [0.5, 1, 1.5, 2].includes(data.speed!) ? data.speed! : 1, loop: data.loop === true };
}
export function interpolateElements(from: TacticalBoardElement[], to: TacticalBoardElement[], progress: number): TacticalBoardElement[] {
  if (progress >= 1) return cloneElements(to);
  const nextById = new Map(to.filter(element => typeof element.animationId === "string").map(element => [element.animationId, element]));
  const t = Math.max(0, progress);
  const mix = (a: number, b: number) => a + (b - a) * t;
  return from.map(element => {
    const next = nextById.get(element.animationId);
    if (!next || next.type !== element.type) return { ...element };
    const result = { ...element };
    for (const key of ["x", "y", "scale", "scaleX", "scaleY"] as const) {
      if (typeof element[key] === "number" && typeof next[key] === "number") result[key] = mix(element[key] as number, next[key] as number);
    }
    if (typeof element.rotation === "number" && typeof next.rotation === "number") {
      const delta = ((next.rotation - element.rotation + 540) % 360) - 180;
      result.rotation = element.rotation + delta * t;
    }
    if (Array.isArray(element.points) && Array.isArray(next.points) && element.points.length === next.points.length) {
      result.points = element.points.map((point, index) => {
        const a = point as {x:number;y:number}, b = (next.points as Array<{x:number;y:number}>)[index];
        return typeof a?.x === "number" && typeof a?.y === "number" && typeof b?.x === "number" && typeof b?.y === "number" ? { ...a, x: mix(a.x,b.x), y: mix(a.y,b.y) } : point;
      });
    }
    return result;
  });
}
export function animationDuration(frames: AnimationFrame[]): number {
  return frames.slice(0, -1).reduce((total, frame) => total + frame.durationMs, 0);
}
export function sampleAnimation(frames: AnimationFrame[], elapsed: number): TacticalBoardElement[] {
  let remaining = Math.max(0, elapsed);
  for (let index = 0; index < frames.length - 1; index++) {
    if (remaining < frames[index].durationMs) return interpolateElements(frames[index].elements, frames[index + 1].elements, remaining / frames[index].durationMs);
    remaining -= frames[index].durationMs;
  }
  return cloneElements(frames.at(-1)?.elements ?? []);
}
