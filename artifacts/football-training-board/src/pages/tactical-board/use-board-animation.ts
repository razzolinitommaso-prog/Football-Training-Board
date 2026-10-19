import { useCallback, useEffect, useRef, useState } from "react";
import type { TacticalBoardElement } from "./board-types";
import { animationDuration, cloneElements, identifyElements, MAX_ANIMATION_FRAMES, readAnimation, sampleAnimation, type AnimationFrame, type BoardAnimation } from "./board-animation";

export function useBoardAnimation(elements: TacticalBoardElement[], setElements: (elements: TacticalBoardElement[]) => void, onChange: () => void) {
  const [frames, setFrames] = useState<AnimationFrame[]>([]);
  const [activeFrame, setActiveFrame] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"stopped" | "playing" | "paused">("stopped");
  const [preview, setPreview] = useState<TacticalBoardElement[] | null>(null);
  const [progress, setProgress] = useState(0);
  const request = useRef<number | null>(null);
  const playback = useRef<{frames:AnimationFrame[];elapsed:number;last:number;speed:number;loop:boolean} | null>(null);
  const cancel = useCallback(() => { if (request.current !== null) cancelAnimationFrame(request.current); request.current = null; }, []);
  const stop = useCallback(() => { cancel(); playback.current = null; setMode("stopped"); setPreview(null); setProgress(0); }, [cancel]);
  useEffect(() => () => cancel(), [cancel]);
  const load = useCallback((value: unknown) => {
    stop(); const data = readAnimation(value); setFrames(data?.frames ?? []); setActiveFrame(data?.activeFrame ?? 0); setSpeed(data?.speed ?? 1); setLoop(data?.loop ?? false); setOpen(Boolean(data));
  }, [stop]);
  const snapshot = (): BoardAnimation | undefined => frames.length ? { version: 1, frames: frames.map((frame,index) => index === activeFrame ? { ...frame, elements: identifyElements(elements) } : frame), activeFrame, speed, loop } : undefined;
  const commit = () => {
    const data = snapshot(); if (!data) return [];
    setFrames(data.frames); return data.frames;
  };
  const start = () => {
    if (mode === "playing") { cancel(); setMode("paused"); return; }
    if (mode !== "paused" || !playback.current) {
      const next = commit(); if (next.length < 2) return;
      playback.current = { frames: next, elapsed: 0, last: 0, speed, loop };
    }
    playback.current.last = 0; setMode("playing");
    const tick = (now:number) => {
      const run = playback.current; if (!run) return;
      if (run.last) run.elapsed += (now - run.last) * run.speed;
      run.last = now;
      const duration = animationDuration(run.frames);
      if (run.elapsed >= duration && !run.loop) {
        setPreview(sampleAnimation(run.frames, duration)); setProgress(1); setMode("paused"); cancel(); run.elapsed = 0; return;
      }
      if (run.loop) run.elapsed %= duration;
      setPreview(sampleAnimation(run.frames,run.elapsed)); setProgress(run.elapsed / duration);
      request.current = requestAnimationFrame(tick);
    };
    request.current = requestAnimationFrame(tick);
  };
  const add = () => {
    if (frames.length >= MAX_ANIMATION_FRAMES) return;
    const next = commit(); const captured = next.length ? next[activeFrame].elements : identifyElements(elements);
    const frame = { elements: captured, durationMs: 2000 };
    const index = next.length ? activeFrame + 1 : 0;
    next.splice(index,0,frame); setFrames([...next]); setActiveFrame(index); setElements(cloneElements(captured)); onChange();
  };
  const select = (index:number) => {
    if (index === activeFrame) return;
    const next = commit(); setActiveFrame(index); setElements(cloneElements(next[index].elements)); onChange();
  };
  const remove = () => {
    if (frames.length < 2) return;
    const next = commit().filter((_,index) => index !== activeFrame); const index = Math.min(activeFrame,next.length-1);
    setFrames(next); setActiveFrame(index); setElements(cloneElements(next[index].elements)); onChange();
  };
  return { frames, activeFrame, speed, loop, open, mode, preview, progress, snapshot, load, stop, start, add, select, remove,
    toggle: () => { stop(); setOpen(value => !value); },
    clear: () => { load(null); onChange(); },
    setSpeed: (value:number) => { setSpeed(value); onChange(); }, setLoop: (value:boolean) => { setLoop(value); onChange(); },
    setDuration: (value:number) => { setFrames(current => current.map((frame,index) => index === activeFrame ? { ...frame, durationMs: Math.max(200,Math.min(30000,value)) } : frame)); onChange(); },
  };
}
export type BoardAnimationControls = ReturnType<typeof useBoardAnimation>;
