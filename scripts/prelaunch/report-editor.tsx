import { useState } from "react";
import { MatchReportEditor } from "../../artifacts/football-training-board/src/pages/calendari/MatchReportEditor";
import type { MatchReport } from "@workspace/api-zod";
export function ReportEditorFixture() {
  const [report, setReport] = useState<MatchReport>({
    version: 1,
    periods: Array.from({ length: 4 }, () => ({
      minutes: 12,
      starters: [101, 102],
      goalsFor: 0,
      goalsAgainst: 0,
    })),
    goals: [],
    substitutions: [],
  });
  return (
    <main className="mx-auto max-w-5xl p-4">
      <h1 className="mb-4 text-xl font-bold">
        Resoconto partita · dati di collaudo
      </h1>
      <MatchReportEditor
        value={report}
        onChange={setReport}
        players={[
          { id: 101, name: "Giocatore con nome e cognome molto lungo" },
          { id: 102, name: "Secondo giocatore" },
          { id: 103, name: "Giocatore in panchina" },
        ]}
        limit={5}
        planned={null}
        boundaries={[]}
        onPendingLineupChange={() => {}}
      />
    </main>
  );
}
