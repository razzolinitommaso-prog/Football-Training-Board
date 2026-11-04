import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { withApi } from "@/lib/api-base";
import { useToast } from "@/hooks/use-toast";
import { sessionTeamIds } from "@workspace/api-zod";
import { DisclosureSummary } from "@/components/ui/disclosure-summary";

export const reviewCriteria = {
  coherence: "Coerenza con obiettivo e principio",
  organization: "Gruppi, tempi e recuperi",
  suitability: "Adeguatezza all’annata e ai giocatori",
  progression: "Progressione fra le fasi",
} as const;
type Scores = Record<keyof typeof reviewCriteria, number | null>;
export type SessionReview = {
  scores: Scores;
  note: string;
  updatedAt: string;
  reviewerName: string | null;
  stale: boolean;
};
export type SupervisionData = {
  staff: {
    userId: number;
    name: string;
    teamId: number;
    teamName: string;
    role: string;
    staffRole: string | null;
    primary: boolean;
  }[];
  facts: Record<
    string,
    { recorded: number; adoptions: number; review: SessionReview | null }
  >;
};
type Session = {
  id: number;
  title: string;
  scheduledAt: string;
  durationMinutes?: number | null;
  objectives?: string | null;
  description?: string | null;
  status: string;
  sessionKind: string;
  teamId: number | null;
  notes?: string | null;
  createdByUserId: number | null;
  preparation?: { exerciseCount: number; phases: string[]; complete: boolean };
};
type Directive = { createdAt: string; sentToUserIds: number[] };
export const supervisionState = (s: Session) =>
  !s.preparation
    ? "unknown"
    : s.preparation.complete
      ? "complete"
      : s.preparation.exerciseCount === 0 &&
          s.title === "Allenamento da preparare" &&
          !s.objectives?.trim() &&
          !s.description?.trim()
        ? "unstarted"
        : "pending";
const stateLabel = {
  unknown: "Preparazione non rilevabile",
  complete: "Preparazione completa",
  unstarted: "Da impostare",
  pending: "Da completare",
};
const stateTone = {
  unknown: "text-muted-foreground",
  complete: "text-emerald-700 dark:text-emerald-400",
  unstarted: "text-muted-foreground",
  pending: "text-orange-700 dark:text-orange-400",
};
export function supervisionStaffRole(person: SupervisionData["staff"][number]) {
  if (person.primary) return "Allenatore responsabile";
  let raw = person.staffRole ?? "";
  try {
    const map = JSON.parse(raw).bySection;
    raw = map ? Object.values(map).filter(Boolean).join(" / ") : raw;
  } catch {}
  const roles: Record<string, string> = {
    primo_allenatore: "Primo allenatore",
    secondo_allenatore: "Secondo allenatore",
    collaboratore: "Collaboratore",
    preparatore_atletico: "Preparatore",
    preparatore_portieri: "Preparatore portieri",
    coach: "Allenatore",
    fitness_coach: "Preparatore",
    athletic_director: "Responsabile atletico",
  };
  return roles[raw] ?? roles[person.role] ?? "Staff tecnico";
}
export function SupervisionOverview({
  sessions,
  directives,
  data,
  from,
  to,
  setFrom,
  setTo,
  loading,
  error,
}: {
  sessions: Session[];
  directives: Directive[];
  data?: SupervisionData;
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  loading: boolean;
  error: boolean;
}) {
  const inPeriod = (at: string) => {
    const date = new Date(at);
    return (
      Number.isFinite(date.getTime()) &&
      format(date, "yyyy-MM-dd") >= from &&
      format(date, "yyyy-MM-dd") <= to
    );
  };
  const selected = sessions.filter((s) => inPeriod(s.scheduledAt));
  const regular = selected.filter(
    (s) =>
      s.sessionKind === "regular" &&
      !["cancelled", "canceled"].includes(s.status),
  );
  const past = regular.filter(
    (s) =>
      Date.parse(s.scheduledAt) + (s.durationMinutes ?? 90) * 60000 <
      Date.now(),
  );
  const complete = regular.filter(
    (s) => supervisionState(s) === "complete",
  ).length;
  const pastComplete = past.filter(
    (s) => supervisionState(s) === "complete",
  ).length;
  const emptyAttendance = past.filter(
    (s) =>
      s.preparation?.exerciseCount === 0 &&
      (data?.facts[s.id]?.recorded ?? 0) > 0,
  ).length;
  const proposals = selected.filter((s) => s.sessionKind === "tipo");
  const staff = data?.staff ?? [];
  const users = new Set(staff.map((p) => p.userId));
  const relevantDirectives = directives.filter(
    (d) => inPeriod(d.createdAt) && d.sentToUserIds.some((id) => users.has(id)),
  );
  const reviewed = regular.filter(
    (s) => data?.facts[s.id]?.review && !data.facts[s.id].review!.stale,
  ).length;
  const metrics = [
    {
      title: "Sedute registrate",
      value: regular.length,
      detail: "Annullate escluse",
    },
    {
      title: "Complete",
      value: complete,
      detail: "Tutte e tre le fasi compilate",
    },
    {
      title: "Da completare",
      value: regular.filter((s) => supervisionState(s) === "pending").length,
      detail: "Preparazione avviata",
    },
    {
      title: "Da impostare",
      value: regular.filter((s) => supervisionState(s) === "unstarted").length,
      detail: "Schede ancora vuote",
    },
  ];
  return (
    <section
      aria-label="Quadro annata e staff"
      className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-semibold">Quadro annata e staff</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Dati della selezione corrente · lo staff indicato è quello assegnato
            oggi
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="supervision-from" className="text-xs">
              Dal
            </Label>
            <Input
              id="supervision-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supervision-to" className="text-xs">
              Al
            </Label>
            <Input
              id="supervision-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
      </div>
      {from > to ? (
        <p role="alert" className="text-sm text-destructive">
          La data iniziale deve precedere quella finale.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.title} className="rounded-lg border bg-muted/15 p-3">
                <p className="text-xs text-muted-foreground">{m.title}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {m.value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{m.detail}</p>
              </div>
            ))}
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">
              Caricamento staff e valutazioni…
            </p>
          ) : error ? (
            <p role="alert" className="text-sm text-destructive">
              Staff e valutazioni non disponibili. Riprova ricaricando la
              pagina.
            </p>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Staff assegnato</h3>
                  {staff.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nessun incarico tecnico assegnato alle annate selezionate.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {staff.map((p) => (
                        <div
                          key={`${p.userId}-${p.teamId}`}
                          className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b pb-2 text-sm"
                        >
                          <span className="font-medium">
                            {p.name}
                            <span className="block text-xs font-normal text-muted-foreground">
                              {p.teamName}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {supervisionStaffRole(p)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-3 rounded-lg bg-muted/20 p-3">
                  <h3 className="text-sm font-semibold">
                    Continuità di compilazione
                  </h3>
                  <p className="text-sm">
                    <strong>
                      {pastComplete} / {past.length}
                    </strong>{" "}
                    sedute trascorse oggi complete{" "}
                    {past.length > 0 && (
                      <span className="text-muted-foreground">
                        · {Math.round((100 * pastComplete) / past.length)}%
                      </span>
                    )}
                  </p>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    role="img"
                    aria-label={`${pastComplete} sedute complete su ${past.length} trascorse`}
                  >
                    <div
                      className="h-full bg-emerald-500"
                      style={{
                        width: `${past.length ? (100 * pastComplete) / past.length : 0}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {emptyAttendance} con appello registrato e nessuna stazione.
                    Le sedute future non incidono sull’indicatore.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Preparazione prima dell’inizio:{" "}
                    <strong>non rilevabile</strong> con lo storico attuale.
                    Questo dato descrive la compilazione attuale, non
                    attribuisce un voto al mister.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3 text-sm">
                  <strong>{proposals.length}</strong> linee guida
                  <p className="mt-1 text-xs text-muted-foreground">
                    {
                      proposals.filter(
                        (s) => (data?.facts[s.id]?.adoptions ?? 0) > 0,
                      ).length
                    }{" "}
                    con stazioni riprese in sedute operative
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <strong>{relevantDirectives.length}</strong> direttive allo
                  staff
                  <p className="mt-1 text-xs text-muted-foreground">
                    Lettura e seguito non tracciati
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <strong>
                    {reviewed} / {regular.length}
                  </strong>{" "}
                  sedute valutate
                  <p className="mt-1 text-xs text-muted-foreground">
                    Valutazioni del direttore · escluse quelle da riverificare
                  </p>
                </div>
              </div>
              <details>
                <DisclosureSummary className="text-xs text-muted-foreground">
                  Come leggere questi indicatori
                </DisclosureSummary>
                <p className="mt-2 text-xs text-muted-foreground">
                  I conteggi riguardano le schede registrate nel periodo, non
                  certificano che tutti gli appuntamenti previsti siano stati
                  creati. Complete significa che le tre fasi contengono
                  stazioni, non che la qualità sia approvata. L’assenza di
                  stazioni con appello è un caso da verificare. Le linee guida
                  sono facoltative: non adottarle non penalizza lo staff. Gli
                  incarichi attuali non ricostruiscono i responsabili delle
                  sedute passate.
                </p>
              </details>
            </>
          )}
          {regular.some((s) => !s.preparation) && (
            <p className="text-xs text-muted-foreground">
              Per alcune sedute la preparazione non è rilevabile.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function SessionSupervision({
  session,
  data,
  onReview,
}: {
  session: Session;
  data?: SupervisionData;
  onReview: () => void;
}) {
  const state = supervisionState(session),
    fact = data?.facts[session.id],
    review = fact?.review;
  const responsible = (data?.staff ?? []).filter((p) =>
    sessionTeamIds(session.teamId, session.notes).includes(p.teamId),
  );
  return (
    <div className="space-y-2 border-t pt-3 text-xs">
      <p className={`font-medium ${stateTone[state]}`}>{stateLabel[state]}</p>
      <p className="text-muted-foreground">
        {session.preparation
          ? `${session.preparation.phases.length}/3 fasi · ${session.preparation.exerciseCount} stazioni`
          : "Fasi e stazioni non rilevabili"}
      </p>
      <p className="text-muted-foreground">
        Staff attuale:{" "}
        {responsible.length
          ? Array.from(new Set(responsible.map((p) => p.name))).join(", ")
          : "non assegnato"}
      </p>
      {session.sessionKind === "tipo" ? (
        <p className="text-muted-foreground">
          {fact
            ? `${fact.adoptions} sedute con stazioni riprese`
            : "Verifica adozioni in corso"}
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground">
            {!fact
              ? "Valutazioni non disponibili"
              : review
                ? review.stale
                  ? "Valutazione da riverificare"
                  : "Valutazione del direttore salvata"
                : "Non ancora valutata"}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={!fact}
            onClick={onReview}
          >
            {review ? "Vedi valutazione" : "Valuta seduta"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function SessionReviewDialog({
  session,
  review,
  onClose,
}: {
  session: Session;
  review: SessionReview | null;
  onClose: () => void;
}) {
  const [scores, setScores] = useState<Scores>(
    review?.scores ?? {
      coherence: null,
      organization: null,
      suitability: null,
      progression: null,
    },
  );
  const [note, setNote] = useState(review?.note ?? "");
  const qc = useQueryClient();
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        withApi(`/api/training-sessions/${session.id}/review`),
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scores,
            note,
            expectedUpdatedAt: review
              ? new Date(review.updatedAt).toISOString()
              : null,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? "Salvataggio non riuscito");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/training-supervision"] });
      toast({ title: "Valutazione salvata" });
      onClose();
    },
    onError: (error: Error) =>
      toast({ title: error.message, variant: "destructive" }),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Valutazione tecnica della seduta</DialogTitle>
        </DialogHeader>
        <p className="text-sm font-medium">{session.title}</p>
        <p className="text-xs text-muted-foreground">
          Giudizio del direttore tecnico. Ogni criterio può restare non
          valutato; nessun voto viene generato automaticamente.
        </p>
        {review && (
          <p className="text-xs text-muted-foreground">
            Ultima valutazione: {review.reviewerName ?? "Direttore tecnico"} ·{" "}
            {format(new Date(review.updatedAt), "dd/MM/yyyy HH:mm")}
            {review.stale && " · La preparazione è cambiata: riverificare."}
          </p>
        )}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          {Object.entries(reviewCriteria).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`review-${key}`}>{label}</Label>
              <Select
                value={String(scores[key as keyof Scores] ?? "none")}
                onValueChange={(value) =>
                  setScores((previous) => ({
                    ...previous,
                    [key]: value === "none" ? null : Number(value),
                  }))
                }
              >
                <SelectTrigger id={`review-${key}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Non valutato</SelectItem>
                  <SelectItem value="1">1 · Da rivedere</SelectItem>
                  <SelectItem value="2">2 · Da migliorare</SelectItem>
                  <SelectItem value="3">3 · Adeguato</SelectItem>
                  <SelectItem value="4">4 · Ben strutturato</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="review-note">
              Osservazioni e indicazioni di miglioramento
            </Label>
            <Textarea
              id="review-note"
              maxLength={2000}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={onClose}
            >
              Chiudi
            </Button>
            <Button
              type="submit"
              disabled={
                mutation.isPending ||
                (!note.trim() &&
                  Object.values(scores).every((value) => value === null))
              }
            >
              {mutation.isPending ? "Salvataggio…" : "Salva valutazione"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
