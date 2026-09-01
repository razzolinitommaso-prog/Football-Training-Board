import { useEffect, useState } from "react";
import { Activity, CalendarDays, CheckCircle2, ClipboardCheck, HeartPulse, ShieldAlert, ShieldCheck, Trophy, User, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { withApi } from "@/lib/api-base";

async function apiFetch(path: string) {
  const res = await fetch(withApi(`/api${path}`), { credentials: "include" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function percentLabel(value: number | null | undefined): string {
  return value == null ? "N/D" : `${value}%`;
}

function ParentActivitySummary({ data, isYouthSection }: { data: any; isYouthSection: boolean }) {
  if (!data) return null;

  return (
    <details className="rounded-xl border bg-card p-4" open>
      <summary className="cursor-pointer text-sm font-semibold">Andamento automatico</summary>
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              Presenze allenamenti
            </div>
            <div className="mt-2 text-2xl font-bold">{percentLabel(data.trainingAttendance?.percentage)}</div>
            <p className="text-xs text-muted-foreground">
              {data.trainingAttendance?.present ?? 0}/{data.trainingAttendance?.totalPastSessions ?? 0} presenti
              {(data.trainingAttendance?.unrecorded ?? 0) > 0 ? ` - ${data.trainingAttendance.unrecorded} non registrati` : ""}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Trophy className="h-4 w-4 text-primary" />
              Presenze partite
            </div>
            <div className="mt-2 text-2xl font-bold">{percentLabel(data.matchAttendance?.percentage)}</div>
            <p className="text-xs text-muted-foreground">
              {data.matchAttendance?.appearances ?? 0}/{data.matchAttendance?.totalPastMatches ?? 0} partite - {data.matchAttendance?.callups ?? 0} convocazioni
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-primary" />
            Risultati test
          </div>
          {Array.isArray(data.fitnessTests) && data.fitnessTests.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {data.fitnessTests.map((test: any) => (
                <div key={test.id} className="rounded border bg-background px-2 py-1.5 text-xs">
                  <div className="font-medium">{test.date ? new Date(`${test.date}T00:00:00`).toLocaleDateString("it-IT") : "-"}</div>
                  <div className="text-muted-foreground">
                    Resistenza {test.endurance ?? "-"} - Forza {test.strength ?? "-"} - Velocita {test.speed ?? "-"}
                  </div>
                  {test.notes ? <div className="mt-0.5 text-muted-foreground">{test.notes}</div> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Nessun test registrato.</p>
          )}
        </div>

        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="h-4 w-4 text-primary" />
            Condotta
          </div>
          <p className="mt-2 text-sm">{data.conduct?.status ?? "Regolare"}</p>
          {data.conduct?.reason ? <p className="text-xs text-muted-foreground">Motivo: {data.conduct.reason}</p> : null}
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <span className="rounded border bg-background px-2 py-0.5">Ottima: {data.conduct?.training?.ottima ?? 0}</span>
            <span className="rounded border bg-background px-2 py-0.5">Buona: {data.conduct?.training?.buona ?? 0}</span>
            <span className="rounded border bg-background px-2 py-0.5">Insufficiente: {data.conduct?.training?.insufficiente ?? 0}</span>
          </div>
        </div>

        {isYouthSection && (
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              Cartellini settore giovanile
            </div>
            {Array.isArray(data.discipline?.cards) && data.discipline.cards.length > 0 ? (
              <div className="mt-2 space-y-1">
                {data.discipline.cards.map((card: any, index: number) => (
                  <div key={`${card.matchId ?? index}`} className="rounded border bg-background px-2 py-1 text-xs">
                    {card.date ? new Date(card.date).toLocaleDateString("it-IT") : "-"} - {card.type ?? "Cartellino"} - {card.reason ?? "altro"}
                    {card.opponent ? ` - vs ${card.opponent}` : ""}
                    {card.notes ? ` - ${card.notes}` : ""}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Nessun cartellino registrato.</p>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

export default function ParentPlayerCard() {
  const [player, setPlayer] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/parent/player-card")
      .then(setPlayer)
      .catch((error) => { if (import.meta.env.DEV) console.error(error); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>;
  if (!player) return <div className="mx-auto max-w-2xl py-20 text-center text-muted-foreground">Nessun atleta collegato.</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">{player.firstName} {player.lastName}</h1>
            <p className="text-sm text-muted-foreground">{player.team?.name ?? "Senza squadra"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant={player.available ? "default" : "destructive"}>
                {player.available ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <XCircle className="mr-1 h-3.5 w-3.5" />}
                {player.available ? "Disponibile" : "Non disponibile"}
              </Badge>
              <Badge variant={player.registered ? "default" : "secondary"}>Tesseramento {player.registered ? "ok" : "da verificare"}</Badge>
            </div>
          </div>
        </div>
      </div>

      <ParentActivitySummary data={player.activitySummary} isYouthSection={player.team?.clubSection === "settore_giovanile"} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dati sportivi</p>
          <div className="mt-3 space-y-2 text-sm">
            <p>Ruolo: <strong>{player.position ?? "-"}</strong></p>
            <p>Numero maglia: <strong>{player.jerseyNumber ?? "-"}</strong></p>
            <p>Altezza/Peso: <strong>{player.height ?? "-"} cm / {player.weight ?? "-"} kg</strong></p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documenti e servizi</p>
          <div className="mt-3 space-y-2 text-sm">
            <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Nato il: <strong>{player.dateOfBirth ? new Date(player.dateOfBirth).toLocaleDateString("it-IT") : "-"}</strong></p>
            <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Certificato: <strong>{player.medicalCertificateExpiry ? new Date(player.medicalCertificateExpiry).toLocaleDateString("it-IT") : "Da verificare"}</strong></p>
            <p className="flex items-center gap-2"><HeartPulse className="h-4 w-4 text-primary" /> Pulmino: <strong>{player.shuttleService ? "Si" : "No"}</strong></p>
          </div>
        </div>
      </div>
    </div>
  );
}
