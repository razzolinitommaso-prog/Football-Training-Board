import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import type { BoardAnimationControls } from "./use-board-animation";
import { MAX_ANIMATION_FRAMES } from "./board-animation";

export function AnimationPanel({ animation }: { animation: BoardAnimationControls }) {
  const previewing = animation.mode !== "stopped";
  const button = "min-h-11 min-w-11 rounded-xl border border-white/20 px-3 py-2 text-sm disabled:opacity-40";
  return <section data-board-animation className="border-b border-white/10 px-3 py-3" aria-label="Animazione lavagna">
    <button type="button" className={button} aria-expanded={animation.open} onClick={animation.toggle}>{animation.open ? "Chiudi animazione" : "Animazione"}{animation.frames.length ? ` · ${animation.frames.length} ${animation.frames.length === 1 ? "fotogramma" : "fotogrammi"}` : ""}</button>
    {animation.open && <div className="mt-3 min-w-0 space-y-3">
      <p className="text-xs text-white/65">Prepara il campo, aggiungi un fotogramma e sposta gli elementi per costruire il movimento. Salva con «Salva lavagna».</p>
      <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto" role="group" aria-label="Fotogrammi">
        {animation.frames.map((_,index) => <button key={index} type="button" disabled={previewing} aria-label={`Fotogramma ${index+1}`} aria-pressed={index === animation.activeFrame} onClick={() => animation.select(index)} className={`${button} ${index === animation.activeFrame ? "bg-[#FACC15] text-black" : "bg-white/5"}`}>{index+1}</button>)}
        <button type="button" className={button} disabled={previewing || animation.frames.length >= MAX_ANIMATION_FRAMES} onClick={animation.add}>+ Fotogramma</button>
      </div>
      {animation.frames.length > 0 && <details><DisclosureSummary className="min-h-11 cursor-pointer py-3 text-sm text-white/75">Impostazioni animazione</DisclosureSummary><div className="flex flex-wrap items-center gap-3 text-sm">
        {animation.activeFrame < animation.frames.length - 1 && <label className="flex items-center gap-2">Passaggio al prossimo (s)<input aria-label="Durata passaggio in secondi" type="number" min="0.2" max="30" step="0.2" disabled={previewing} value={animation.frames[animation.activeFrame].durationMs / 1000} onChange={event => { const n=event.target.valueAsNumber; if(Number.isFinite(n)) animation.setDuration(n*1000); }} className="w-20 rounded-lg border border-white/20 bg-[#111827] p-2" /></label>}
        <button type="button" className={button} disabled={previewing || animation.frames.length < 2} onClick={animation.remove}>Elimina fotogramma</button>
        <button type="button" className={button} disabled={previewing} onClick={animation.clear}>Rimuovi animazione</button>
        <label className="flex items-center gap-2">Velocità<select disabled={previewing} value={animation.speed} onChange={event => animation.setSpeed(Number(event.target.value))} className="rounded-lg border border-white/20 bg-[#111827] p-2">{[0.5,1,1.5,2].map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select></label>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={previewing} checked={animation.loop} onChange={event => animation.setLoop(event.target.checked)} />Ripeti</label>
      </div></details>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={`${button} bg-[#FACC15] text-black`} disabled={animation.frames.length < 2} onClick={animation.start}>{animation.mode === "playing" ? "Pausa" : animation.mode === "paused" ? "Riprendi" : "Riproduci"}</button>
        <button type="button" className={button} disabled={!previewing} onClick={animation.stop}>Stop · torna alla modifica</button>
        {previewing && <span aria-live="off" className="text-xs text-white/70">Anteprima · {Math.round(animation.progress*100)}%</span>}
      </div>
      {!animation.frames.length && <p className="text-xs text-white/65">Aggiungi il primo fotogramma per iniziare.</p>}
    </div>}
  </section>;
}
