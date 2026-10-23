import { useState } from "react";
import { managerPlayerStatus, type ManagerPlayer } from "@/lib/team-manager-player-status";
const grid="sm:grid sm:grid-cols-[minmax(0,1.25fr)_minmax(0,.9fr)_minmax(0,.85fr)_minmax(0,1.2fr)] sm:gap-3";
const tones:Record<string,string>={green:"bg-emerald-50 text-emerald-800",amber:"bg-amber-50 text-amber-800",red:"bg-red-50 text-red-800",muted:"bg-muted text-muted-foreground"};
export function TeamManagerPlayers({players}:{players:ManagerPlayer[]}) {
  const [reviewOnly,setReviewOnly]=useState(false);
  const rows=players.map(player=>({player,...managerPlayerStatus(player)}));
  const visible=reviewOnly?rows.filter(row=>row.needsReview):rows;
  return <div className="space-y-3">
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={reviewOnly} onChange={event=>setReviewOnly(event.target.checked)} className="h-4 w-4 accent-primary"/>Solo situazioni da verificare</label>
    <p className="text-xs text-muted-foreground" aria-live="polite">{visible.length} di {players.length} giocatori · Sola consultazione</p>
    <div className="overflow-hidden rounded-2xl border bg-card px-3 sm:px-4">
      <div className={`hidden border-b py-3 text-xs font-medium text-muted-foreground ${grid}`}><span>Giocatore</span><span>Tesseramento</span><span>Matricola</span><span>Certificato medico</span></div>
      <ul className="divide-y">{visible.map(({player,certificate,registration,number})=><li key={player.id} className={`space-y-2 py-3 text-sm sm:space-y-0 ${grid}`}>
        <div className="min-w-0"><p className="break-words font-medium">{player.lastName} {player.firstName}</p><p className="mt-0.5 text-xs text-muted-foreground">{player.jerseyNumber!=null?`n. ${player.jerseyNumber}`:""}{player.jerseyNumber!=null&&player.position?" · ":""}{player.position??""}</p></div>
        <div className="grid grid-cols-2 gap-2 sm:contents">
          <div className="min-w-0"><p className="mb-1 text-[11px] text-muted-foreground sm:sr-only">Tesseramento</p><span className={`inline-block rounded-md px-2 py-1 text-xs ${player.registered===true?tones.green:tones.amber}`}>{registration}</span></div>
          <div className="min-w-0"><p className="mb-1 text-[11px] text-muted-foreground sm:sr-only">Matricola</p><p className={`break-words text-xs ${number?"font-medium":"text-muted-foreground"}`}>{number??"Non inserita"}</p></div>
          <div className="col-span-2 min-w-0 sm:col-span-1"><p className="mb-1 text-[11px] text-muted-foreground sm:sr-only">Certificato medico</p><div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:block"><span className={`inline-block rounded-md px-2 py-1 text-xs ${tones[certificate.tone]}`}>{certificate.label}</span>{certificate.expiry&&<p className="text-xs text-muted-foreground sm:mt-1">Scadenza {certificate.expiry}</p>}</div></div>
        </div>
      </li>)}</ul>
      {!visible.length&&<p className="py-4 text-sm text-muted-foreground">{reviewOnly?"Nessuna situazione da verificare.":"Nessun giocatore nella rosa principale."}</p>}
    </div>
  </div>;
}
