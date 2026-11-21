import { useState } from "react";
import axe from "axe-core";
export function AccessibilityAudit() {
  const [result, setResult] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  return (
    <aside
      data-prelaunch-tools
      className="fixed bottom-2 right-2 z-[100] max-w-[calc(100vw-1rem)] rounded-lg border bg-background p-2 text-xs"
    >
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await document.fonts.ready;
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => resolve()),
            );
            await Promise.all(
              document
                .getAnimations()
                .filter(
                  (animation) =>
                    animation.effect?.getComputedTiming().iterations !==
                    Infinity,
                )
                .map((animation) => animation.finished.catch(() => {})),
            );
            const report = await axe.run(
              { exclude: ["[data-prelaunch-tools]"] },
              {
                runOnly: {
                  type: "tag",
                  values: ["wcag2a", "wcag2aa", "wcag21aa"],
                },
              },
            );
            setResult({
              violations: report.violations.map((v) => ({
                id: v.id,
                impact: v.impact,
                description: v.description,
                nodes: v.nodes.map((n) => ({
                  target: n.target,
                  summary: n.failureSummary,
                })),
              })),
              passes: report.passes.length,
            });
          } catch (error) {
            setResult({ error: String(error) });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Analisi…" : "Analizza accessibilità"}
      </button>
      {result !== null && (
        <pre
          data-testid="a11y-result"
          className="mt-2 max-h-48 max-w-xl overflow-auto whitespace-pre-wrap break-words"
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </aside>
  );
}
