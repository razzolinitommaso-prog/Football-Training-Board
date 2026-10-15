import { useEffect, useState } from "react";
import { CalendarDays, ChevronDown, Clock, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { withApi } from "@/lib/api-base";

async function apiFetch(path: string) {
  const res = await fetch(withApi(`/api${path}`), {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function statusLabel(status: string) {
  if (status === "called") return "Convocato";
  if (status === "available") return "Disponibile";
  if (status === "unavailable") return "Non disponibile";
  return "In attesa";
}

function formatDate(value?: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "Non indicato";
  return new Date(value).toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function CallupDetail({ label, children }: { label: string; children?: string | null }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{children?.trim() || "Non indicato"}</dd></div>;
}

export default function ParentCallups() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch("/parent/callups")
      .then(setItems)
      .catch((error) => { setError(true); if (import.meta.env.DEV) console.error(error); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>;
  if (error) return <p role="alert">Non è stato possibile caricare le convocazioni. Riprova aggiornando la pagina.</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Convocazioni</h1>
        <p className="mt-1 text-sm text-muted-foreground">Convocazioni inserite dal mister. La disponibilità si comunica nel Calendario generale.</p>
      </div>

      {items.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <Trophy className="mx-auto mb-4 h-14 w-14 opacity-25" />
          <p className="font-semibold">Nessuna convocazione</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <details key={item.id} className="group rounded-2xl border bg-card p-4">
              <summary className="cursor-pointer list-none rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">vs {item.match?.opponent ?? "Avversario"}</p>
                  <p className="text-xs text-muted-foreground">{item.teamName ?? "Squadra"}</p>
                  {item.match?.date && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-primary">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDate(item.match.date)}
                    </p>
                  )}
                </div>
                <Badge variant={item.status === "called" || item.status === "available" ? "default" : item.status === "unavailable" ? "destructive" : "secondary"}>
                  {statusLabel(item.status)}
                </Badge>
              </div>
              <span className="mt-3 flex items-center gap-2 text-xs text-primary"><ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />Dettagli convocazione</span>
              </summary>
              <dl className="mt-4 grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2">
                <CallupDetail label="Squadra">{item.teamName}</CallupDetail>
                <CallupDetail label="Avversario">{item.match?.opponent}</CallupDetail>
                <CallupDetail label="Casa / trasferta">{item.match?.homeAway === "home" ? "Casa" : item.match?.homeAway === "away" ? "Trasferta" : null}</CallupDetail>
                <CallupDetail label="Competizione">{item.match?.competition}</CallupDetail>
                <CallupDetail label="Giorno e orario partita">{formatDate(item.match?.date)}</CallupDetail>
                <CallupDetail label="Luogo e indirizzo campo">{item.match?.location}</CallupDetail>
                <CallupDetail label="Giorno e orario ritrovo">{formatDate(item.match?.convocationAt)}</CallupDetail>
                <CallupDetail label="Luogo di ritrovo">{item.match?.convocationPlace}</CallupDetail>
                {item.match?.isPostponed && <div className="sm:col-span-2"><CallupDetail label="Partita rinviata">{item.match.rescheduleTbd ? "Nuova data da definire" : formatDate(item.match.rescheduleDate)}</CallupDetail></div>}
                <div className="sm:col-span-2"><CallupDetail label="Indicazioni pre-partita">{item.match?.preMatchNotes}</CallupDetail></div>
                {item.match?.notes && <div className="sm:col-span-2"><CallupDetail label="Altre indicazioni">{item.match.notes}</CallupDetail></div>}
              </dl>
              {item.status === "pending" && (
                <p className="mt-2 flex items-center gap-1 text-xs text-amber-600"><Clock className="h-3.5 w-3.5" /> Conferma richiesta.</p>
              )}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
