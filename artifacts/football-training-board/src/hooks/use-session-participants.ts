import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { withApi } from "@/lib/api-base";
export type BeforeAppello = {
  available: number;
  parentUnavailable: number;
  secretaryUnavailable: number;
  guests?: number;
  pending: number;
  total: number;
};

export type SessionParticipants = {
  blockedPlayerIds: number[];
  presentPlayerIds: number[];
  recordedPlayerIds: number[];
  total: number;
  beforeAppello?: BeforeAppello | null;
  afterAppello?: { present: number; absent: number; injured: number; pending: number };
};
export function useSessionParticipants(sessionId:number,enabled=true){
 const {club,user}=useAuth();
 return useQuery<SessionParticipants>({queryKey:["training-session-participants",club?.id,user?.id,sessionId],enabled:enabled&&sessionId>0,staleTime:0,refetchOnWindowFocus:true,refetchInterval:15000,queryFn:async()=>{const response=await fetch(withApi(`/api/training-sessions/${sessionId}/participants`),{credentials:"include"});if(!response.ok)throw Error("Appello della seduta non disponibile");return response.json();}});
}
