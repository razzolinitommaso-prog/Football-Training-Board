import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CalendarDays, ClipboardCheck, Eye, Pencil, UsersRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { normalizeSessionRole } from "@/lib/session-role";
import { withApi } from "@/lib/api-base";

type TrainingOperationKind = "callups" | "attendance" | "calendar";
type ClubSection = "scuola_calcio" | "settore_giovanile" | "prima_squadra";

type TrainingSession = {
  id: number;
  title?: string | null;
  teamName?: string | null;
  scheduledAt?: string | null;
  location?: string | null;
  status?: string | null;
};

const SECTION_LABELS: Record<ClubSection, string> = {
  scuola_calcio: "Scuola Calcio",
  settore_giovanile: "Settore Giovanile",
  prima_squadra: "Prima Squadra",
};

const CONFIG = {
  callups: {
    title: "Convocazioni",
    description: "Prepara e controlla gli atleti convocati per le prossime sedute.",
    icon: UsersRound,
    action: "Gestisci convocati",
    empty: "Nessuna sessione disponibile per preparare convocazioni.",
  },
  attendance: {
    title: "Presenze allenamenti",
    description: "Registra e verifica presenze, assenze e note delle sedute.",
    icon: ClipboardCheck,
    action: "Registra presenze",
    empty: "Nessuna sessione disponibile per registrare presenze.",
  },
  calendar: {
    title: "Calendario operativo",
    description: "Vista operativa delle sedute con squadre, orari, campi e note.",
    icon: CalendarDays,
    action: "Apri dettaglio",
    empty: "Nessuna sessione pianificata nel calendario operativo.",
  },
} satisfies Record<TrainingOperationKind, { title: string; description: string; icon: typeof CalendarDays; action: string; empty: string }>;

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(withApi(path), { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function formatSessionDate(value?: string | null) {
  if (!value) return "Da programmare";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function canEditOperation(role: string) {
  return ["admin", "presidente", "director", "technical_director", "coach", "fitness_coach", "athletic_director"].includes(role);
}

export default function TrainingOperationsPage({ kind, section }: { kind: TrainingOperationKind; section?: ClubSection }) {
  const { role } = useAuth();
  const normalizedRole = normalizeSessionRole(role);
  const config = CONFIG[kind];
  const Icon = config.icon;
  const canEdit = canEditOperation(normalizedRole);
  const scopeLabel = section ? SECTION_LABELS[section] : "Tutte le sezioni abilitate";

  const { data: sessions = [], isLoading } = useQuery<TrainingSession[]>({
    queryKey: ["/api/training-sessions", "operations", kind, section ?? "global"],
    queryFn: () => apiFetch<TrainingSession[]>("/api/training-sessions"),
  });

  const visibleSessions = useMemo(() => {
    return [...sessions]
      .sort((a, b) => String(a.scheduledAt ?? "").localeCompare(String(b.scheduledAt ?? "")))
      .slice(0, 12);
  }, [sessions]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Icon className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">{config.title}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{config.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{scopeLabel}</Badge>
          <Badge variant={canEdit ? "default" : "secondary"}>{canEdit ? "Modifica abilitata" : "Sola visualizzazione"}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sessioni</p>
            <p className="text-2xl font-bold">{visibleSessions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Permesso</p>
            <p className="text-lg font-semibold">{canEdit ? "Gestione" : "Consultazione"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Area</p>
            <p className="text-lg font-semibold">{scopeLabel}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="h-4 w-4 text-primary" />
            Prossime sedute operative
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="rounded-md border bg-muted/20 px-3 py-6 text-sm text-muted-foreground">Caricamento...</div>
          ) : visibleSessions.length === 0 ? (
            <div className="rounded-md border bg-muted/20 px-3 py-6 text-sm text-muted-foreground">{config.empty}</div>
          ) : (
            visibleSessions.map((session) => (
              <div key={session.id} className="flex flex-col gap-3 rounded-md border bg-background px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{session.title || session.teamName || "Sessione allenamento"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatSessionDate(session.scheduledAt)}
                    {session.location ? ` - ${session.location}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {session.status && <Badge variant="outline">{session.status}</Badge>}
                  <Button type="button" size="sm" variant={canEdit ? "default" : "outline"} className="gap-2">
                    {canEdit ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {canEdit ? config.action : "Visualizza"}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
