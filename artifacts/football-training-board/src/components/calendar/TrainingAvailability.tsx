import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { withApi } from "@/lib/api-base";
export type TrainingAvailability = {records:{playerId:number;status:string}[];available:number;unavailable:number;pending:number;total:number};
export function useTrainingAvailability(teamId:number|null|undefined,date:string|null|undefined,start:string|null|undefined,teamIds:number[]=[],durationMinutes?:number|null) {
  const {club,user}=useAuth();
  return useQuery<TrainingAvailability>({queryKey:["training-availability",club?.id,user?.id,teamId,date,start,teamIds.join(","),durationMinutes],enabled:Boolean(teamId&&date&&start),staleTime:0,refetchOnWindowFocus:true,refetchInterval:30000,
    queryFn:async()=>{const response=await fetch(withApi(`/api/training-availability?teamId=${teamId}&date=${encodeURIComponent(date!)}&start=${encodeURIComponent(start!)}&teamIds=${encodeURIComponent((teamIds.length?teamIds:[teamId]).join(","))}${durationMinutes?`&duration=${durationMinutes}`:""}`),{credentials:"include"});if(!response.ok)throw new Error("Disponibilità non disponibili");return response.json();}});
}
export function TrainingAvailabilityPanel({teamId,date,start,teamIds=[],durationMinutes}:{teamId:number|null;date:string|null;start:string|null;teamIds?:number[];durationMinutes?:number|null}) {
  const {data,isLoading,error}=useTrainingAvailability(teamId,date,start,teamIds,durationMinutes);
  if(!teamId||!date||!start)return <p className="text-xs text-muted-foreground">Scegli squadra, data e orario per vedere le disponibilità dei genitori.</p>;
  return <div className="rounded-xl border bg-muted/20 p-3 text-sm" aria-live="polite"><p className="font-medium">Disponibilità dichiarate dai genitori</p>{isLoading?<p>Caricamento...</p>:error?<p role="alert">{error.message}</p>:data&&<><p className="mt-1">{data.available} disponibili · {data.unavailable} indisponibili · {data.pending} senza risposta</p><p className="mt-1 text-xs text-muted-foreground">Su {data.total} giocatori della rosa della seduta, incluse le annate unite selezionate e i supplementari. Il numero atteso non è una presenza registrata.</p></>}</div>;
}
export function ParentAvailabilityBadge({status}:{status:string|undefined}) {
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs ${status==='available'?'bg-emerald-50 text-emerald-800':status==='unavailable'?'bg-red-50 text-red-800':'bg-muted text-muted-foreground'}`}>Genitore: {status==='available'?'disponibile':status==='unavailable'?'indisponibile':'nessuna risposta'}</span>;
}
