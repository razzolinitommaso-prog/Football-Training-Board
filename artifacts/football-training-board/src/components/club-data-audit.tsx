import {useMutation} from "@tanstack/react-query";
import {customFetch} from "@workspace/api-client-react/custom-fetch";
import type {ClubDataAudit} from "@workspace/api-zod";
import {Button} from "@/components/ui/button";

const money=(cents:number)=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(cents/100);
export function ClubDataAuditPanel(){
  const audit=useMutation({mutationFn:()=>customFetch<ClubDataAudit>("/api/club-backup/audit")});
  const report=audit.data;
  const issues=report?[...report.income.issues,...report.members.issues,...report.senior.issues,...(report.warehouse?.issues??[]),...report.references.issues]:[];
  return <section aria-label="Verifica completa dati società" className="space-y-3 rounded-xl border bg-card p-4">
    <h2 className="font-semibold">Verifica completa dei dati società</h2>
    <p className="text-sm text-muted-foreground">Controlla sul server tutte le stagioni, i conteggi dello snapshot, le quadrature e i riferimenti tra registri. Non modifica i dati e non richiede il download.</p>
    <Button variant="outline" disabled={audit.isPending} onClick={()=>{audit.reset();audit.mutate();}}>{audit.isPending?"Verifica in corso…":"Verifica dati completi"}</Button>
    {audit.isPending&&<p role="status" className="text-sm">Lettura dello snapshot completo in sola lettura…</p>}
    {audit.isError&&<p role="alert" className="break-words text-sm text-destructive">Verifica non disponibile. Riprova; nessuna registrazione è stata modificata.</p>}
    {report&&<div className="space-y-3 text-sm" role="status">
      <p className="font-medium">Snapshot verificato sul server · {report.tables} tabelle · {report.rows} record · {report.asOf}</p>
      <p className="text-xs text-muted-foreground">{report.scope}</p>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-1 rounded-lg border p-3"><h3 className="font-semibold">Entrate · {report.income.records} movimenti</h3>{!report.income.available?<p className="text-amber-700">Registro non disponibile: verifica incompleta.</p>:<><p>Registrato: {money(report.income.registered)}</p><p>Incassato: {money(report.income.paid)}</p><p>Residuo: {money(report.income.residual)}</p><p>Non scaduto: {money(report.income.pending)} · Scaduto: {money(report.income.overdue)}</p><p>{report.income.balanced?"Quadratura corretta":"Scarto da verificare"}</p></>}</div>
        {[{label:"Membri",data:report.members},{label:"Prima Squadra",data:report.senior},...(report.warehouse?[{label:"Fornitori KIT",data:report.warehouse}]:[])].map(({label,data})=><div key={label} className="space-y-1 rounded-lg border p-3"><h3 className="font-semibold">{label} · {data.records} {data.records===1?"rata":"rate"}</h3>{!data.available?<p className="text-amber-700">Registro non disponibile: verifica incompleta.</p>:<><p>Dovuto: {money(data.due)}</p><p>Pagato: {money(data.paid)}</p><p>Residuo: {money(data.residual)}</p><p>{data.receipts} {data.receipts===1?"ricevuta":"ricevute"} · {data.balanced?"Quadratura corretta":"Scarto da verificare"}</p></>}</div>)}
      </div>
      <p>{report.references.checked} riferimenti controllati tra tabelle incluse · {report.references.missing} non risolti.</p>
      {report.income.missingPlayers>0&&<p className="text-amber-700">{report.income.missingPlayers} movimenti senza giocatore nello snapshot.</p>}
      <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Segnalazioni · {report.income.issues.length+report.members.issues.length+report.senior.issues.length+(report.warehouse?.issues.length??0)+report.references.missing}</summary>{issues.length?<ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">{issues.slice(0,100).map((issue,index)=><li className="break-words" key={index}>{issue.source} · #{issue.record}: {issue.message}</li>)}</ul>:<p className="mt-2">Nessuna anomalia rilevata dai controlli disponibili.</p>}<p className="mt-2 text-xs text-muted-foreground">Le segnalazioni richiedono verifica; non eliminano o correggono registrazioni. Mostrati fino a 100 dettagli.</p></details>
      <p className="text-xs text-muted-foreground">File scaricato sul dispositivo: integrità non verificata da questo controllo. {report.externalReferences} riferimenti a file esterni da conservare separatamente.</p>
      {report.warnings.map(warning=><p className="text-xs text-muted-foreground" key={warning}>{warning}</p>)}
    </div>}
  </section>;
}
