import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { withApi } from "@/lib/api-base";
import type { BeforeAppello, SessionParticipants } from "@/hooks/use-session-participants";

export type TrainingAvailability = {
  records: { playerId: number; status: string }[];
  available: number;
  unavailable: number;
  pending: number;
  total: number;
  beforeAppello?: BeforeAppello;
};
export function useTrainingAvailability(teamId:number|null|undefined,date:string|null|undefined,start:string|null|undefined,teamIds:number[]=[],durationMinutes?:number|null) {
  const {club,user}=useAuth();
  return useQuery<TrainingAvailability>({queryKey:["training-availability",club?.id,user?.id,teamId,date,start,teamIds.join(","),durationMinutes],enabled:Boolean(teamId&&date&&start),staleTime:0,refetchOnWindowFocus:true,refetchInterval:30000,
    queryFn:async()=>{const response=await fetch(withApi(`/api/training-availability?teamId=${teamId}&date=${encodeURIComponent(date!)}&start=${encodeURIComponent(start!)}&teamIds=${encodeURIComponent((teamIds.length?teamIds:[teamId]).join(","))}${durationMinutes?`&duration=${durationMinutes}`:""}`),{credentials:"include"});if(!response.ok)throw new Error("Disponibilità non disponibili");return response.json();}});
}
function BeforeAppelloCounts({ counts }: { counts: BeforeAppello }) {
  return (
    <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 tabular-nums">
      <dt>Disponibili dichiarati</dt><dd className="font-semibold">{counts.available}</dd>
      <dt>Indisponibili da segreteria</dt><dd className="font-semibold">{counts.secretaryUnavailable}</dd>
      <dt>Indisponibili dichiarati dai genitori</dt><dd className="font-semibold">{counts.parentUnavailable}</dd>
      <dt>Senza risposta e senza blocchi</dt><dd className="font-semibold">{counts.pending}</dd>
    </dl>
  );
}

export function TrainingAvailabilityPanel({ teamId, date, start, teamIds = [], durationMinutes, preview = false }: {
  teamId: number | null;
  date: string | null;
  start: string | null;
  teamIds?: number[];
  durationMinutes?: number | null;
  preview?: boolean;
}) {
  const { data, isLoading, error } = useTrainingAvailability(teamId, date, start, teamIds, durationMinutes);
  if (!teamId || !date || !start) return <p className="text-xs text-muted-foreground">Scegli squadra, data e orario per vedere le disponibilità.</p>;
  return (
    <section className="rounded-xl border bg-muted/20 p-3 text-sm" aria-live="polite">
      <h3 className="font-semibold">{preview ? "Prima dell’appello · anteprima delle modifiche" : "Prima dell’appello · disponibilità"}</h3>
      {isLoading ? <p>Caricamento…</p> : error ? <p role="alert">{error.message}</p> :
        data?.beforeAppello ? <BeforeAppelloCounts counts={data.beforeAppello} /> :
        data && <p className="mt-1">Risposte dei genitori: {data.available} disponibili · {data.unavailable} indisponibili · {data.pending} senza risposta</p>}
    </section>
  );
}

export function TrainingAttendanceComparison({ data, loading, error }: {
  data?: SessionParticipants;
  loading: boolean;
  error: boolean;
}) {
  if (!data || loading || error) {
    return <p className="rounded-xl border p-3 text-sm" role={error ? "alert" : "status"}>{error ? "Disponibilità e appello della seduta non disponibili." : "Caricamento disponibilità e appello…"}</p>;
  }
  const present = data.presentPlayerIds.length;
  const recorded = data.recordedPlayerIds.length;
  return (
    <section className="space-y-3 rounded-xl border bg-muted/20 p-3 text-sm" aria-label="Confronto disponibilità e appello">
      <h3 className="font-semibold">Disponibilità e appello · {data.total} in rosa</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 rounded-lg border bg-background p-3">
          <h4 className="font-semibold">Prima dell’appello</h4>
          {data.beforeAppello ? <BeforeAppelloCounts counts={data.beforeAppello} /> : <p className="mt-2 text-muted-foreground">Disponibilità non disponibili.</p>}
        </div>
        <div className="min-w-0 rounded-lg border bg-background p-3">
          <h4 className="font-semibold">Dopo l’appello</h4>
          <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 tabular-nums">
            <dt>Presenti</dt><dd className="font-semibold">{data.afterAppello?.present ?? present}</dd>
            {data.afterAppello ? <>
              <dt>Assenti</dt><dd className="font-semibold">{data.afterAppello.absent}</dd>
              <dt>Infortunati</dt><dd className="font-semibold">{data.afterAppello.injured}</dd>
            </> : <>
              <dt>Assenti o infortunati</dt><dd className="font-semibold">{recorded - present}</dd>
            </>}
            <dt>Appello da registrare</dt><dd className="font-semibold">{data.afterAppello?.pending ?? data.total - recorded}</dd>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">{recorded} su {data.total} registrati</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Per la rosa delle stazioni prevale l’appello registrato. Fino ad allora valgono le indisponibilità di segreteria e le risposte dei genitori.</p>
    </section>
  );
}

export function ParentAvailabilityBadge({status}:{status:string|undefined}) {
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs ${status==='available'?'bg-emerald-50 text-emerald-800':status==='unavailable'?'bg-red-50 text-red-800':'bg-muted text-muted-foreground'}`}>Genitore: {status==='available'?'disponibile':status==='unavailable'?'indisponibile':'nessuna risposta'}</span>;
}
