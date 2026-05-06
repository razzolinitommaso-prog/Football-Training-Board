import { useEffect, useState } from "react";
import { withApi } from "@/lib/api-base";

export type TeamPlayer = {
  id: number;
  firstName: string;
  lastName: string;
  jerseyNumber?: number | null;
  position?: string | null;
  available?: boolean | null;
};

type TeamMembersApiPlayer = {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  role?: string | null;
  jerseyNumber?: number | null;
};

function normalizePlayer(raw: any): TeamPlayer | null {
  const id = Number(raw?.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    firstName: String(raw?.firstName ?? raw?.first_name ?? "").trim(),
    lastName: String(raw?.lastName ?? raw?.last_name ?? "").trim(),
    jerseyNumber:
      typeof raw?.jerseyNumber === "number" ? raw.jerseyNumber : raw?.jerseyNumber == null ? null : Number(raw.jerseyNumber),
    position: (raw?.position ?? raw?.role ?? null) as string | null,
    available: typeof raw?.available === "boolean" ? raw.available : null,
  };
}

export function useTeamPlayers(teamId: number | null) {
  const [players, setPlayers] = useState<TeamPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!teamId) {
      setPlayers([]);
      setIsLoading(false);
      return;
    }

    const loadPlayers = async () => {
      setIsLoading(true);
      try {
        const [playersRes, membersRes] = await Promise.all([
          fetch(withApi(`/api/players?teamId=${teamId}`), { credentials: "include" }),
          fetch(withApi(`/api/teams/${teamId}/members`), { credentials: "include" }),
        ]);

        const playersData = playersRes.ok ? ((await playersRes.json()) as unknown[]) : [];
        const membersData = membersRes.ok ? ((await membersRes.json()) as TeamMembersApiPlayer[]) : [];

        const merged = new Map<number, TeamPlayer>();
        (Array.isArray(playersData) ? playersData : []).forEach((entry) => {
          const normalized = normalizePlayer(entry);
          if (normalized) merged.set(normalized.id, normalized);
        });
        (Array.isArray(membersData) ? membersData : []).forEach((entry) => {
          const normalized = normalizePlayer(entry);
          if (!normalized) return;
          const existing = merged.get(normalized.id);
          merged.set(normalized.id, {
            ...normalized,
            ...existing,
            // Prefer richer data from /players, but never lose team-member roster presence.
            firstName: existing?.firstName || normalized.firstName,
            lastName: existing?.lastName || normalized.lastName,
            position: existing?.position ?? normalized.position,
            jerseyNumber: existing?.jerseyNumber ?? normalized.jerseyNumber ?? null,
            available: existing?.available ?? normalized.available ?? null,
          });
        });

        const data = Array.from(merged.values());
        if (!cancelled) {
          setPlayers(data);
        }
      } catch (error) {
        console.error("Errore caricamento giocatori team", error);
        if (!cancelled) {
          setPlayers([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadPlayers();

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  return {
    players,
    isLoading,
  };
}

