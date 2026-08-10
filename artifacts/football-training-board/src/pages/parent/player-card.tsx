import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, HeartPulse, ShieldCheck, User, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { withApi } from "@/lib/api-base";

async function apiFetch(path: string) {
  const res = await fetch(withApi(`/api${path}`), { credentials: "include" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
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
