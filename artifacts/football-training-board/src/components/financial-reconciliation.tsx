import { useEffect, useState } from "react";
import {
  financialExportSheets,
  reconcileExpenses,
  reconcileIncome,
  type AuditIncome,
} from "@/lib/financial-reconciliation";
import { createExcelFile } from "@/lib/excel-export";
import { useAuth } from "@/hooks/use-auth";
import { useDownloadArtifact } from "@/hooks/use-download-artifact";
import type { MemberExpenses } from "@/lib/member-services";
import { Button } from "@/components/ui/button";
const money = (cents: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
export function FinancialReconciliation({
  payments,
  members,
  senior,
  warehouse,
  today,
  complete,
}: {
  payments: AuditIncome[];
  members?: MemberExpenses;
  senior?: MemberExpenses;
  warehouse?: MemberExpenses;
  today: string;
  complete: boolean;
}) {
  const [exportState, setExportState] = useState("");
  const {club,user,role,profileKey,section}=useAuth();
  const {artifact,prepare,clear}=useDownloadArtifact(JSON.stringify([club?.id,user?.id,role,profileKey,section,today]));
  useEffect(()=>{clear();setExportState("");},[payments,members,senior,warehouse,today,clear]);
  const [exporting, setExporting] = useState(false);
  const income = reconcileIncome(payments, today);
  const expenses = [
    members && reconcileExpenses(members, "Uscite membri"),
    senior && reconcileExpenses(senior, "Uscite Prima Squadra"),
    warehouse && reconcileExpenses(warehouse,"Fornitori KIT"),
  ].filter((row): row is NonNullable<typeof row> => !!row);
  const issues = [...income.issues, ...expenses.flatMap((row) => row.issues)];
  return (
    <details className="rounded-xl border bg-card p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Controllo quadrature e dati mancanti{" "}
        {complete ? `· ${issues.length} segnalazioni` : "· dati incompleti"}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-muted-foreground">
          Tutti i periodi e i record caricati nell’ambito autorizzato,
          indipendentemente dai filtri sopra. Controllo interno: non sostituisce
          il confronto con cassa, banca e ricevute.
        </p>
        {!complete ? (
          <p role="alert">
            Attendi il caricamento completo o riprova le sorgenti non
            disponibili. Il controllo completo e l’export non sono ancora
            disponibili.
          </p>
        ) : (
          <>
            <p>
              Entrate: {money(income.registered)} = incassato{" "}
              {money(income.paid)} + residuo {money(income.residual)}.{" "}
              {income.balanced
                ? "Quadratura corretta."
                : "Scarto da verificare."}
            </p>
            {expenses.map((row, index) => (
              <p key={index}>
                {[members&&"Membri",senior&&"Prima Squadra",warehouse&&"Fornitori KIT"].filter(Boolean)[index]}: dovuto{" "}
                {money(row.due)} = pagato {money(row.paid)} + residuo{" "}
                {money(row.residual)}.{" "}
                {row.balanced
                  ? "Quadratura corretta."
                  : "Scarto da verificare."}
              </p>
            ))}
            <div className="flex flex-wrap gap-2"><Button
              type="button"
              size="sm"
              variant="outline"
              disabled={exporting}
              onClick={async () => {
                clear();
                setExporting(true);
                setExportState("");
                try {
                  const file=createExcelFile(
                    financialExportSheets(payments, members, senior, today, warehouse),
                    `controllo-contabile-${today}`,
                  );
                  prepare(file.blob,file.filename);
                  setExportState(
                    "Esportazione Excel avviata. Controlla i download del dispositivo.",
                  );
                } catch {
                  setExportState("Esportazione non riuscita. Riprova.");
                } finally {
                  setExporting(false);
                }
              }}
            >
              Esporta controllo Excel
            </Button>
            {artifact&&<a className="inline-flex min-h-9 items-center rounded-md border px-3 py-2 text-sm font-medium text-primary" href={artifact.url} download={artifact.filename}>Scarica Excel generato</a>}
            </div>
            {exportState && (
              <p
                role={exportState.includes("non riuscita") ? "alert" : "status"}
              >
                {exportState}
              </p>
            )}
            {issues.length > 0 ? (
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {issues.map((row, index) => (
                  <li key={index} className="break-words">
                    {row.source} · #{row.record}: {row.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nessuna anomalia rilevata dai controlli disponibili.</p>
            )}
          </>
        )}
      </div>
    </details>
  );
}
