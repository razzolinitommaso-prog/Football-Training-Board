import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Dumbbell, BarChart3, Zap, Heart, Timer } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { customFetch } from "@workspace/api-client-react/custom-fetch";
import { format } from "date-fns";

interface FitnessData {
  id: number;
  playerId: number;
  playerName: string | null;
  date: string;
  endurance: number | null;
  strength: number | null;
  speed: number | null;
  notes: string | null;
}

interface FitnessProgram {
  id: number;
  title: string;
  intensityLevel: string;
  teamName: string | null;
}

export default function FitnessDashboard() {
  const { t } = useLanguage();
  const [programs, setPrograms] = useState<FitnessProgram[]>([]);
  const [fitnessData, setFitnessData] = useState<FitnessData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      customFetch<FitnessProgram[]>("/api/fitness-programs", { method: "GET" }),
      customFetch<FitnessData[]>("/api/player-fitness-data", { method: "GET" }),
    ]).then(([progs, data]) => {
      setPrograms(progs);
      setFitnessData(data);
    }).finally(() => setLoading(false));
  }, []);

  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  const testsThisMonth = fitnessData.filter(d => {
    const date = new Date(d.date);
    return date.getMonth() === thisMonth && date.getFullYear() === thisYear;
  });

  const avg = (vals: (number | null)[]) => {
    const valid = vals.filter((v): v is number => v !== null);
    if (!valid.length) return null;
    return (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1);
  };

  const avgEndurance = avg(fitnessData.map(d => d.endurance));
  const avgStrength = avg(fitnessData.map(d => d.strength));
  const avgSpeed = avg(fitnessData.map(d => d.speed));

  const stats = [
    { label: t.activePrograms, value: programs.length, icon: Dumbbell, color: "text-blue-600" },
    { label: t.testsThisMonth, value: testsThisMonth.length, icon: Activity, color: "text-green-600" },
    { label: t.avgEndurance, value: avgEndurance !== null ? `${avgEndurance}/100` : "—", icon: Heart, color: "text-red-500" },
    { label: t.avgStrength, value: avgStrength !== null ? `${avgStrength}/100` : "—", icon: Zap, color: "text-yellow-500" },
    { label: t.avgSpeed, value: avgSpeed !== null ? `${avgSpeed}/100` : "—", icon: Timer, color: "text-purple-500" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t.fitnessDashboard}</h1>
        <p className="text-muted-foreground mt-1">{t.fitnessDashboardDesc}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
          : stats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="pt-5 pb-4">
                <stat.icon className={`w-6 h-6 mb-2 ${stat.color}`} />
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/fitness-programs">
          <Card className="cursor-pointer hover:border-primary transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Dumbbell className="w-5 h-5 text-blue-600" />
                {t.fitnessPrograms}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {t.fitnessProgramsDesc}
            </CardContent>
          </Card>
        </Link>
        <Link href="/player-performance">
          <Card className="cursor-pointer hover:border-primary transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-green-600" />
                {t.playerPerformance}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {t.playerPerformanceDesc}
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-5 h-5 text-purple-600" />
              {t.latestTests}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-20" />
            ) : fitnessData.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.noLatestTests}</p>
            ) : (
              <div className="space-y-2">
                {fitnessData.slice(0, 4).map(d => (
                  <div key={d.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate max-w-[120px]">{d.playerName ?? `#${d.playerId}`}</span>
                    <span className="text-muted-foreground text-xs">{format(new Date(d.date), "dd/MM/yyyy")}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
