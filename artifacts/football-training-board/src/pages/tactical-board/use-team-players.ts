import { useMemo } from "react";
import { useListPlayers } from "@workspace/api-client-react";

export type TeamPlayer = {
  id: number;
  firstName: string;
  lastName: string;
  jerseyNumber?: number | null;
  position?: string | null;
};

export function useTeamPlayers(teamId: number | null) {
  const params = useMemo(() => (teamId ? { teamId } : undefined), [teamId]);
  const { data, isLoading } = useListPlayers(params);
  const players = useMemo(() => ((data as TeamPlayer[] | undefined) ?? []), [data]);

  return {
    players,
    isLoading,
  };
}

