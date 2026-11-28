import { useState } from "react";
import {downloadExport} from "@/lib/export-download";
import { buildMotorTestPdf } from "@/lib/motor-test-pdf";
import { motorTestCatalog, motorTestCycles, motorTestCompletion, motorCompletionLabels, summarizeMotorTests, motorResultLines, tgmdLongJumpScore, type MotorTestSession } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { exportMultiSheet } from "@/lib/excel-export";

type ExportPlayer = { id: number; name: string; family: string | null; coach: string | null };
const dayLabel = (value: string) => value.split("-").reverse().join("/");
const familyLabels: Record<string, string> = { available: "Disponibile", unavailable: "Non disponibile", pending: "In attesa" };
const coachLabels: Record<string, string> = { present: "Presente", absent: "Assente", requested: "Richiesto", injured: "Infortunato" };

export function motorReportSheets(draft: MotorTestSession, roster: ExportPlayer[], team: string) {
  const items = draft.tests.map(test => ({ ...test, info: motorTestCatalog.find(item => item.id === test.id)! }));
  const players = [...roster];
  const registered = new Set(players.map(player => player.id));
  for (const id of Object.keys(draft.results).map(Number)) {
    if (!registered.has(id)) players.push({ id, name: "Giocatore " + id, family: null, coach: null });
  }
  return [
    { name: "Sessione", rows: [{
      Annata: team, Giorno: dayLabel(draft.date), Ciclo: motorTestCycles[draft.cycle],
      "Numero prove": items.length, "Durata totale (min)": items.reduce((total, item) => total + item.minutes, 0),
    }] },
    { name: "Programma delle prove", rows: items.map(item => ({
      Prova: item.info.title, Minuti: item.minutes, Obiettivo: item.info.principle,
      Materiali: item.info.materials, "Allestimento ed esecuzione": item.info.instructions,
    })) },
    { name: "Presenze", rows: players.map(player => ({
      "Giornata appello": draft.workingDate??draft.date,
      Giocatore: player.name, "Disponibilità famiglia": (player.family && familyLabels[player.family]) || "",
      "Appello del mister": (player.coach && coachLabels[player.coach]) || "",
    })) },
    { name: "Risultati", rows: players.flatMap(player => {
      const results = draft.results[player.id];
      const index = results ? summarizeMotorTests([{ id: draft.id, date: draft.date, cycle: draft.cycle, result: results }]).index : null;
      const completion = motorTestCompletion(draft.tests, results);
      return items.map(item => {
        const value = results?.tests[item.id];
        const jump = item.id === "high-jump" || item.id === "long-jump";
        return {
          Giocatore: player.name, "Stato test": motorCompletionLabels[completion.status], "Prove eseguite": completion.completed + "/" + completion.total, "Valutazioni complete": completion.assessed + "/" + completion.total, Prova: item.info.title,
          "Statura (cm)": item.id === "anthropometry" ? results?.height ?? "" : "",
          "Peso (kg)": item.id === "anthropometry" ? results?.weight ?? "" : "",
          "Data rilevazione": value?.recordedOn ?? draft.date, "Data statura": results?.heightDate ?? draft.date, "Data peso": results?.weightDate ?? draft.date, Misura: value?.measurement ?? "", "Unità": item.info.unit,
          "% statura": jump && results?.height && value?.measurement != null ? Math.round(1000 * value.measurement / results.height) / 10 : "",
          "Voto storico (1–10)": value?.score ?? "", "Indice storico (%)": index ?? "", Note: value?.notes ?? "",
          "Tentativi, condizioni e osservazioni": motorResultLines(item.id,value).join("\n"),
          "TGMD-3 salto in lungo (grezzo /8)": item.id==="long-jump" ? tgmdLongJumpScore(value?.assessment?.tgmd) ?? "" : "",
        };
      });
    }) },
  ];
}

export function MotorTestExport({ session, roster, team }: { session: MotorTestSession; roster: ExportPlayer[]; team: string }) {
  const [error, setError] = useState("");
  const filename = "test-motori-" + session.date;
  function exportPdf() {
    setError("");
    try {
      void downloadExport(buildMotorTestPdf(session, roster, team),filename+".pdf");
    } catch { setError("PDF non generato. Riprova con Esporta PDF."); }
  }
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => {setError("");try{exportMultiSheet(motorReportSheets(session, roster, team), filename + ".xlsx")}catch{setError("Excel non generato. Riprova con Esporta Excel.")}}}>Esporta Excel</Button>
      <Button type="button" size="sm" variant="outline" onClick={exportPdf}>Scarica PDF</Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
