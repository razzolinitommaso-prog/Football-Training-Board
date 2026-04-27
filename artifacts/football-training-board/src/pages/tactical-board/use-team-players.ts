import { useListPlayers } from "@workspace/api-client-react";

export type TeamPlayer = {
  id: number;
  firstName: string;
  lastName: string;
  jerseyNumber?: number | null;
  position?: string | null;
};

export function useTeamPlayers(teamId: number | null) {
  const { data, isLoading } = useListPlayers(teamId ? { teamId } : undefined);

  return {
    players: ((data as TeamPlayer[] | undefined) ?? []),
    isLoading,
  };
}

