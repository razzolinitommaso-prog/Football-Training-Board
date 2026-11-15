import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { withApi } from "@/lib/api-base";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { MatchAttendanceComparison, type AttendancePeriod } from "./MatchAttendanceComparison";
import { managerComparisonRows, type ManagerComparison } from "@/lib/team-manager-comparison";
import type { ManagerTrainingCalendar } from "@/lib/team-manager-training-calendar";

export function TeamManagerComparison({ teamId, matchId, date }: { teamId: number; matchId: number; date: string | null }) {
  const { club, user, section } = useAuth();
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<AttendancePeriod>("week");
  const { data, isLoading, error, refetch } = useQuery<{ comparison: ManagerComparison; trainingCalendar: ManagerTrainingCalendar | null }>({
    queryKey: ["/api/dirigenti/overview", "comparison", club?.id, user?.id, section, teamId, matchId],
    enabled: open && Boolean(date),
    queryFn: async () => {
      const response = await fetch(withApi(`/api/dirigenti/overview?teamId=${teamId}&comparisonMatchId=${matchId}`), { credentials: "include" });
      if (!response.ok) throw new Error("Confronto presenze non disponibile.");
      return response.json();
    },
  });
  const model = data && date ? managerComparisonRows(data.comparison, data.trainingCalendar, date, period) : null;
  return <div className="space-y-3 border-t pt-3">
    <Button type="button" variant="outline" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      {open ? "Chiudi confronto" : "Confronta presenze"}
    </Button>
    <div hidden={!open}>
      {date ? <MatchAttendanceComparison period={period} onPeriodChange={setPeriod} matchDate={date}
        events={model?.events ?? []} players={model?.players ?? []} loading={isLoading}
        error={error?.message} onRetry={() => void refetch()} />
        : <p>Il confronto è disponibile quando viene definita la data della gara.</p>}
    </div>
  </div>;
}
