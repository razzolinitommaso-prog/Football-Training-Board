import { useEffect, useState, type CSSProperties } from "react";

/** Keep dialogs inside the visible area when a mobile keyboard reduces it. */
export function useDialogViewport(open: boolean, tall = false): CSSProperties | undefined {
  const [viewport, setViewport] = useState<{ top: number; height: number }>();
  useEffect(() => {
    if (!open) return;
    const current = window.visualViewport;
    const update = () => setViewport({ top: current?.offsetTop ?? 0, height: current?.height ?? window.innerHeight });
    update();
    current?.addEventListener("resize", update);
    current?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => { current?.removeEventListener("resize", update); current?.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [open]);
  if (!viewport) return undefined;
  return { top: viewport.top + viewport.height / 2, maxHeight: Math.max(120, viewport.height - 24), ...(tall ? { height: Math.max(120, viewport.height * 0.9) } : {}) };
}
