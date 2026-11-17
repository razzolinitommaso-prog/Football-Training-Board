import { useEffect, useState } from "react";
import { buildTextPdfBlob } from "@/lib/callup-pdf";
import { motorTestCatalog, motorTestCycles, motorTestCompletion, motorCompletionLabels, summarizeMotorTests, type MotorTestSession } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { exportMultiSheet } from "@/lib/excel-export";

type ExportPlayer = { id: number; name: string; family: string | null; coach: string | null };
const dayLabel = (value: string) => value.split("-").reverse().join("/");
const familyLabels: Record<string, string> = { available: "Disponibile", unavailable: "Non disponibile", pending: "In attesa" };
const coachLabels: Record<string, string> = { present: "Presente", absent: "Assente", requested: "Richiesto", injured: "Infortunato" };

function reportSheets(draft: MotorTestSession, roster: ExportPlayer[], team: string) {
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
          Misura: value?.measurement ?? "", "Unità": item.info.unit,
          "% statura": jump && results?.height && value?.measurement != null ? Math.round(1000 * value.measurement / results.height) / 10 : "",
          "Voto (1–10)": value?.score ?? "", "Indice (%)": index ?? "", Note: value?.notes ?? "",
        };
      });
    }) },
  ];
}

export function MotorTestExport({ session, roster, team }: { session: MotorTestSession; roster: ExportPlayer[]; team: string }) {
  const [pdfUrl, setPdfUrl] = useState<string>();
  const [error, setError] = useState("");
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
  const filename = "test-motori-" + session.date;
  function exportPdf() {
    setError("");
    try {
      const sheets = reportSheets(session, roster, team);
      const report = [{ heading: "TEST MOTORI - " + team, lines: [
        dayLabel(session.date) + " - " + motorTestCycles[session.cycle],
        session.tests.length + " prove - " + session.tests.reduce((sum, test) => sum + test.minutes, 0) + " minuti complessivi",
      ] }];
      for (const row of sheets[1].rows) {
        const item = row as Record<string, string | number>;
        report.push({ heading: String(item.Prova), lines: [
          "Durata: " + item.Minuti + " min - Obiettivo: " + item.Obiettivo,
          "Materiali: " + item.Materiali,
          "Esecuzione: " + item["Allestimento ed esecuzione"],
        ] });
      }
      report.push({ heading: "Presenze", lines: sheets[2].rows.map(row => {
        const item = row as Record<string, string | number>;
        return item.Giocatore + " - Famiglia: " + (item["Disponibilità famiglia"] || "In attesa") + " - Appello: " + (item["Appello del mister"] || "Da registrare");
      }) });
      const byPlayer = new Map<string, Record<string, string | number>[]>();
      for (const row of sheets[3].rows) {
        const item = row as Record<string, string | number>;
        const name = String(item.Giocatore);
        const rows = byPlayer.get(name) ?? [];
        rows.push(item); byPlayer.set(name, rows);
      }
      for (const [name, rows] of byPlayer) {
        const anthropometry = rows.find(row => row["Statura (cm)"] !== "" || row["Peso (kg)"] !== "");
        const lines = [rows[0]["Stato test"] + " - " + rows[0]["Prove eseguite"] + " prove eseguite", "Valutazioni complete: " + rows[0]["Valutazioni complete"]];
        if (rows[0]["Indice (%)"] !== "") lines.push("Indice attuale: " + rows[0]["Indice (%)"] + "%");
        if (anthropometry) lines.push("Statura: " + (anthropometry["Statura (cm)"] || "-") + " cm - Peso: " + (anthropometry["Peso (kg)"] || "-") + " kg");
        for (const row of rows) {
          if (row.Prova !== "Antropometria") lines.push(String(row.Prova) + " - " + (row.Misura !== "" ? row.Misura + " " + row["Unità"] : "Misura da rilevare") +
            " - Voto: " + (row["Voto (1–10)"] !== "" ? row["Voto (1–10)"] + "/10" : "-"));
          if (row["% statura"] !== "") lines.push("Misura relativa: " + row["% statura"] + "% della statura");
          if (row.Note) lines.push("Note " + row.Prova + ": " + row.Note);
        }
        report.push({ heading: "Risultati - " + name, lines });
      }
      const url = URL.createObjectURL(buildTextPdfBlob(report));
      setPdfUrl(url);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename + ".pdf";
      link.style.display = "none";
      document.body.append(link);
      link.click();
      link.remove();
    } catch { setError("PDF non generato. Riprova con Esporta PDF."); }
  }
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => exportMultiSheet(reportSheets(session, roster, team), filename + ".xlsx")}>Esporta Excel</Button>
      <Button type="button" size="sm" variant="outline" onClick={exportPdf}>Esporta PDF</Button>
      {pdfUrl && <a className="inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-medium text-primary" href={pdfUrl} target="_blank" rel="noopener noreferrer">Apri PDF e stampa</a>}
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
