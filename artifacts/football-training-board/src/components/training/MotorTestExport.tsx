import { useEffect, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { motorTestCatalog, motorTestCycles, summarizeMotorTests, type MotorTestSession } from "@workspace/api-zod";
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
      return items.map(item => {
        const value = results?.tests[item.id];
        const jump = item.id === "high-jump" || item.id === "long-jump";
        return {
          Giocatore: player.name, Prova: item.info.title,
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
  const [printedSheets, setPrintedSheets] = useState<ReturnType<typeof reportSheets>>();
  useEffect(() => {
    const close = () => setPrintedSheets(undefined);
    window.addEventListener("afterprint", close);
    return () => window.removeEventListener("afterprint", close);
  }, []);
  return <>
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => exportMultiSheet(reportSheets(session, roster, team), "test-motori-" + session.date + ".xlsx")}>Esporta Excel</Button>
      <Button type="button" size="sm" variant="outline" onClick={() => {
        const sheets = reportSheets(session, roster, team);
        flushSync(() => setPrintedSheets(sheets));
        window.print();
      }}>Stampa / PDF</Button>
    </div>
    {printedSheets && createPortal(
      <div id="motor-test-print">
        <style>{`
          #motor-test-print { display: none; }
          @media print {
            @page { size: A4 landscape; margin: 12mm; }
            body > :not(#motor-test-print) { display: none !important; }
            html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
            body #motor-test-print { display: block; color: #18242f; font: 10pt/1.4 system-ui, sans-serif; }
            #motor-test-print h1 { font-size: 18pt; margin: 0 0 3mm; }
            #motor-test-print h2 { font-size: 12pt; margin: 5mm 0 2mm; break-after: avoid; }
            #motor-test-print table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
            #motor-test-print thead { display: table-header-group; }
            #motor-test-print tr { break-inside: avoid; }
            #motor-test-print :is(th, td) { text-align: left; vertical-align: top; padding: 1.5mm 2mm; border: .2mm solid #b9c3cd; overflow-wrap: anywhere; }
            #motor-test-print th { font-weight: 700; }
          }
        `}</style>
        <h1>Test motori · {team}</h1>
        <p>{dayLabel(session.date)} · {motorTestCycles[session.cycle]}</p>
        {printedSheets.map(sheet => {
          const columns = Object.keys(sheet.rows[0] ?? {});
          return <section key={sheet.name}>
            <h2>{sheet.name}</h2>
            {columns.length ? <table>
              <thead><tr>{columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
              <tbody>{sheet.rows.map((row, index) => <tr key={index}>
                {columns.map(column => <td key={column}>{String((row as Record<string, string | number>)[column] ?? "") || "—"}</td>)}
              </tr>)}</tbody>
            </table> : <p>Nessun dato.</p>}
          </section>;
        })}
      </div>, document.body,
    )}
  </>;
}
