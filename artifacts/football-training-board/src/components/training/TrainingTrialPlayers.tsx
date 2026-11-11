import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trainingLocalDate } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import { withApi } from "@/lib/api-base";

type Trial = {
  playerId: number;
  firstName: string;
  lastName: string;
  birthYear: number | null;
  medicalCertificate: boolean | null;
  trialWaiver: boolean | null;
  startsOn: string;
  endsOn: string;
  score: number | null;
  decision: "approved" | "rejected" | null;
};

function documentStatus(value: boolean | null | undefined) {
  return value === true ? "Sì" : value === false ? "No" : "Da indicare";
}

async function request<T>(path: string, method = "GET", body?: object): Promise<T> {
  const response = await fetch(withApi(path), {
    method,
    credentials: "include",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Operazione non riuscita.");
  return data;
}

function TrialReview({ trial, endpoint, onSaved }: {
  trial: Trial;
  endpoint: string;
  onSaved: () => void;
}) {
  const [score, setScore] = useState(trial.score?.toString() ?? "");
  const [decision, setDecision] = useState(trial.decision ?? "");
  const review = useMutation({
    mutationFn: () => request(endpoint + "/" + trial.playerId, "PATCH", { score: Number(score), decision }),
    onSuccess: onSaved,
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    review.mutate();
  }
  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2">
      <label className="w-24 text-xs">Punteggio
        <Input type="number" required min={1} max={10} step={1} value={score} onChange={event => setScore(event.target.value)} />
      </label>
      <label className="min-w-36 text-xs">Esito
        <ScrollableSelect aria-label="Esito della prova" value={decision} onValueChange={setDecision}>
          <option value="">Scegli l’esito</option>
          <option value="approved">Approvato</option>
          <option value="rejected">Non approvato</option>
        </ScrollableSelect>
      </label>
      <Button type="submit" variant="outline" disabled={review.isPending || !score || !decision}>Salva valutazione</Button>
      {review.error && <p role="alert" className="w-full text-xs text-destructive">{review.error.message}</p>}
    </form>
  );
}

export function TrainingTrialPlayers({ sessionId, scheduledAt, teamName, canEvaluate, canAdd }: {
  sessionId: number;
  scheduledAt: string;
  teamName?: string | null;
  canEvaluate: boolean;
  canAdd: boolean;
}) {
  const sessionDay = trainingLocalDate(new Date(scheduledAt));
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [medicalCertificate, setMedicalCertificate] = useState(false);
  const [trialWaiver, setTrialWaiver] = useState(false);
  const [startsOn, setStartsOn] = useState(sessionDay);
  const [endsOn, setEndsOn] = useState(sessionDay);
  const [message, setMessage] = useState("");
  const client = useQueryClient();
  const endpoint = "/api/training-sessions/" + sessionId + "/trial-players";
  const trials = useQuery({ queryKey: [endpoint], queryFn: () => request<Trial[]>(endpoint), enabled: open });
  const refresh = () => { void client.invalidateQueries({ queryKey: [endpoint] }); };
  const create = useMutation({
    mutationFn: () => request(endpoint, "POST", {
      firstName, lastName, startsOn, endsOn, birthYear: Number(birthYear), medicalCertificate, trialWaiver,
    }),
    onSuccess: () => {
      setFirstName("");
      setLastName("");
      setBirthYear("");
      setMedicalCertificate(false);
      setTrialWaiver(false);
      setMessage("Ospite aggiunto alle sedute del periodo.");
      refresh();
      for (const key of ["training-session-participants", "training-rosters", "station-organization-roster", "training-availability", "/api/players", "/api/training-sessions", "training-trial-attendance", "/api/attendance-summary"]) {
        void client.invalidateQueries({ queryKey: [key] });
      }
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    create.mutate();
  }
  return (
    <details className="rounded-xl border bg-background p-3" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <DisclosureSummary className="text-sm font-semibold">Ospiti in prova</DisclosureSummary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-muted-foreground">Gli ospiti entrano nell’appello e nelle stazioni delle sedute di {teamName || "questa squadra"} per tutto il periodo indicato.</p>
        {canAdd && <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">Nome<Input required maxLength={80} value={firstName} onChange={event => setFirstName(event.target.value)} /></label>
            <label className="text-sm">Cognome<Input required maxLength={80} value={lastName} onChange={event => setLastName(event.target.value)} /></label>
            <label className="text-sm">Anno di nascita<Input required type="number" min={1900} max={Number(sessionDay.slice(0, 4))} step={1} value={birthYear} onChange={event => setBirthYear(event.target.value)} /></label>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2 pb-1 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={medicalCertificate} onChange={event => setMedicalCertificate(event.target.checked)} />
                Certificato medico presente
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={trialWaiver} onChange={event => setTrialWaiver(event.target.checked)} />
                Foglio di manleva per la prova gratuita presente
              </label>
            </div>
            <label className="text-sm">Inizio prova<Input required type="date" max={sessionDay} value={startsOn} onChange={event => setStartsOn(event.target.value)} /></label>
            <label className="text-sm">Fine prova<Input required type="date" min={sessionDay} value={endsOn} onChange={event => setEndsOn(event.target.value)} /></label>
          </div>
          <Button type="submit" disabled={create.isPending}>Aggiungi ospite</Button>
          {create.error && <p role="alert" className="text-sm text-destructive">{create.error.message}</p>}
        </form>}
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
        {trials.isLoading && <p role="status" className="text-sm">Caricamento ospiti…</p>}
        {trials.error && <p role="alert" className="text-sm text-destructive">{trials.error.message}</p>}
        {trials.data?.length === 0 && <p className="text-sm text-muted-foreground">Nessun ospite in prova.</p>}
        {trials.data?.map(trial => {
          const active = trial.startsOn <= sessionDay && sessionDay <= trial.endsOn;
          const outcome = trial.decision === "approved" ? "Approvato" : trial.decision === "rejected" ? "Non approvato" : "Da valutare";
          return (
            <article className="rounded-lg border p-3" key={trial.playerId}>
              <p className="font-medium">{trial.firstName} {trial.lastName}</p>
              <p className="text-xs text-muted-foreground">Anno di nascita {trial.birthYear ?? "da indicare"} · Certificato medico {documentStatus(trial.medicalCertificate)} · Manleva {documentStatus(trial.trialWaiver)}</p>
              <p className="text-xs text-muted-foreground">{trial.startsOn.split("-").reverse().join("/")} – {trial.endsOn.split("-").reverse().join("/")} · {active ? "Nella rosa di questa seduta" : "Fuori periodo per questa seduta"}</p>
              <p className="mt-1 text-sm">{outcome}{trial.score != null && " · " + trial.score + "/10"}</p>
              {canEvaluate && (trainingLocalDate() >= trial.endsOn
                ? <TrialReview key={String(trial.score) + trial.decision} trial={trial} endpoint={endpoint} onSaved={refresh} />
                : <p className="text-xs text-muted-foreground">Valutabile dall’ultimo giorno della prova.</p>)}
            </article>
          );
        })}
      </div>
    </details>
  );
}
