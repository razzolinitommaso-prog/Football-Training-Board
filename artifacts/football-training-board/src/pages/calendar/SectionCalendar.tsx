import { useState, useMemo, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, getDay,
  isBefore, isAfter,
} from "date-fns";
import { it } from "date-fns/locale";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CalendarRange, Trophy, Dumbbell, Filter, RotateCcw, Plus, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { normalizeSessionRole } from "@/lib/session-role";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  EMPTY_SCHEDULE_FILTER,
  scheduleTimeFilterActive,
  datePassesScheduleFilter,
  combineLocalDayWithHHmm,
  type ScheduleFilterOpts,
} from "@/lib/calendar-schedule-filter";
import { ScheduleFilterFields } from "@/components/calendar/ScheduleFilterFields";
import { useToast } from "@/hooks/use-toast";

type Section = "scuola_calcio" | "settore_giovanile" | "prima_squadra";

interface TrainingSlot { day: string; startTime: string; endTime: string; }
interface Team { id: number; name: string; category?: string; trainingSchedule?: TrainingSlot[]; }
interface Match { id: number; opponent: string; date: string; homeAway: string; result?: string; teamId?: number; teamName?: string; competition?: string; }
interface PlayerLite { id: number; firstName?: string; lastName?: string; teamId?: number | null; }
type ExtraCategory = "allenamento_preparazione" | "camp_estivo" | "partita_interna" | "provino";
type ExtraFrequency = "everyday" | "selected_days";
interface ExtraEvent {
  id: number;
  section: Section;
  category: ExtraCategory;
  title: string;
  dateFrom: string;
  dateTo: string;
  startTime: string;
  endTime: string;
  frequency: ExtraFrequency;
  weekdays: number[];
  targetMode: "all" | "selected";
  teamIds: number[];
  playerIds: number[];
}

async function apiFetch(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const ITALIAN_DAY_MAP: Record<string, number> = {
  "Domenica": 0, "Lunedì": 1, "Martedì": 2, "Mercoledì": 3,
  "Giovedì": 4, "Venerdì": 5, "Sabato": 6,
};

const WEEK_HEADERS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const TEAM_PALETTE = [
  { bg: "bg-blue-500",    soft: "bg-blue-100 text-blue-800 border-blue-200" },
  { bg: "bg-emerald-500", soft: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { bg: "bg-amber-500",   soft: "bg-amber-100 text-amber-800 border-amber-200" },
  { bg: "bg-violet-500",  soft: "bg-violet-100 text-violet-800 border-violet-200" },
  { bg: "bg-rose-500",    soft: "bg-rose-100 text-rose-800 border-rose-200" },
  { bg: "bg-sky-500",     soft: "bg-sky-100 text-sky-800 border-sky-200" },
  { bg: "bg-teal-500",    soft: "bg-teal-100 text-teal-800 border-teal-200" },
  { bg: "bg-orange-500",  soft: "bg-orange-100 text-orange-800 border-orange-200" },
  { bg: "bg-pink-500",    soft: "bg-pink-100 text-pink-800 border-pink-200" },
  { bg: "bg-indigo-500",  soft: "bg-indigo-100 text-indigo-800 border-indigo-200" },
];

const SECTION_LABELS: Record<Section, string> = {
  scuola_calcio: "Scuola Calcio",
  settore_giovanile: "Settore Giovanile",
  prima_squadra: "Prima Squadra",
};

interface CalendarEvent {
  type: "training" | "match" | "extra";
  teamId: number;
  teamName: string;
  label: string;
  time?: string;
  opponent?: string;
  homeAway?: string;
  result?: string;
  /** Istante locale (inizio allenamento o partita) per filtri orario. */
  at: Date;
}

function getSchoolYear(date: Date): { start: Date; end: Date; label: string } {
  const month = date.getMonth();
  const year = date.getFullYear();
  const startYear = month >= 8 ? year : year - 1;
  return {
    start: new Date(startYear, 8, 1),
    end: new Date(startYear + 1, 5, 30),
    label: `${startYear}/${startYear + 1}`,
  };
}

function getInitialMonth(today: Date): Date {
  const month = today.getMonth();
  const year = today.getFullYear();
  if (month === 6 || month === 7) return new Date(year, 8, 1);
  return new Date(year, month, 1);
}

export default function SectionCalendar({ section }: { section: Section }) {
  const { role } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const nr = normalizeSessionRole(role);
  const canManageExtraEvents = ["admin", "presidente", "secretary", "director", "technical_director"].includes(nr);
  const today = useMemo(() => new Date(), []);
  const schoolYear = useMemo(() => getSchoolYear(today), [today]);
  const [currentMonth, setCurrentMonth] = useState(() => getInitialMonth(today));
  /** Squadre (annate) da mostrare nel calendario; all’avvio tutte incluse. */
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<number>>(() => new Set());
  const previousValidTeamIdsRef = useRef<Set<number>>(new Set());
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilterOpts>(() => ({
    ...EMPTY_SCHEDULE_FILTER,
  }));
  const [showScheduleFilters, setShowScheduleFilters] = useState(true);
  const [extraDialogOpen, setExtraDialogOpen] = useState(false);
  const [extraCategory, setExtraCategory] = useState<ExtraCategory>("allenamento_preparazione");
  const [extraTitle, setExtraTitle] = useState("");
  const [extraDateFrom, setExtraDateFrom] = useState("");
  const [extraDateTo, setExtraDateTo] = useState("");
  const [extraStartTime, setExtraStartTime] = useState("17:00");
  const [extraEndTime, setExtraEndTime] = useState("18:30");
  const [extraFrequency, setExtraFrequency] = useState<ExtraFrequency>("everyday");
  const [extraWeekdays, setExtraWeekdays] = useState<number[]>([1, 3, 5]);
  const [extraTargetMode, setExtraTargetMode] = useState<"all" | "selected">("all");
  const [extraTeamIds, setExtraTeamIds] = useState<number[]>([]);
  const [extraPlayerIds, setExtraPlayerIds] = useState<number[]>([]);

  const goToPrev = () => setCurrentMonth(m => subMonths(m, 1));
  const goToNext = () => setCurrentMonth(m => addMonths(m, 1));
  const { data: allTeams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams", section],
    queryFn: () => apiFetch(`/api/teams?section=${section}`),
  });

  const { data: allMatches = [] } = useQuery<Match[]>({
    queryKey: ["/api/matches"],
    queryFn: () => apiFetch("/api/matches"),
  });
  const { data: allPlayers = [] } = useQuery<PlayerLite[]>({
    queryKey: ["/api/players", section, "calendar-extra"],
    queryFn: () => apiFetch(`/api/players?section=${section}`),
  });
  const { data: extraEvents = [] } = useQuery<ExtraEvent[]>({
    queryKey: ["/api/calendar-extra-events", section],
    queryFn: () => apiFetch(`/api/calendar-extra-events?section=${section}`),
  });

  const sectionTeamIds = useMemo(() => new Set(allTeams.map(t => t.id)), [allTeams]);

  useEffect(() => {
    const validIds = new Set(allTeams.map((t) => t.id));
    const oldIds = previousValidTeamIdsRef.current;
    previousValidTeamIdsRef.current = validIds;

    if (validIds.size === 0) {
      setSelectedTeamIds(new Set());
      return;
    }

    setSelectedTeamIds((prev) => {
      if (prev.size === 0 && oldIds.size === 0) {
        return validIds;
      }
      const next = new Set<number>();
      for (const id of prev) {
        if (validIds.has(id)) next.add(id);
      }
      for (const id of validIds) {
        if (!oldIds.has(id)) next.add(id);
      }
      return next;
    });
  }, [allTeams]);

  const teamColorMap = useMemo(() => {
    const map = new Map<number, typeof TEAM_PALETTE[0]>();
    allTeams.forEach((t, i) => map.set(t.id, TEAM_PALETTE[i % TEAM_PALETTE.length]));
    return map;
  }, [allTeams]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const seasonStart = schoolYear.start;
    const seasonEnd = schoolYear.end;
    // Scuola calcio: attività allenamento fino a fine seconda settimana di giugno.
    const trainingEnd = new Date(seasonEnd.getFullYear(), 5, 14);

    const addEvent = (date: Date, evt: CalendarEvent) => {
      if (isBefore(date, seasonStart) || isAfter(date, seasonEnd)) return;
      if (evt.type === "training" && isAfter(date, trainingEnd)) return;
      const key = format(date, "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(evt);
    };

    const visibleTeams = allTeams.filter((t) => selectedTeamIds.has(t.id));

    calendarDays.forEach(day => {
      const jsDay = getDay(day);
      visibleTeams.forEach(team => {
        (team.trainingSchedule ?? []).forEach(slot => {
          const slotDay = ITALIAN_DAY_MAP[slot.day];
          if (slotDay === jsDay) {
            const at = combineLocalDayWithHHmm(day, slot.startTime ?? "00:00");
            addEvent(day, {
              type: "training",
              teamId: team.id,
              teamName: team.name,
              label: team.name,
              time: `${slot.startTime}–${slot.endTime}`,
              at,
            });
          }
        });
      });
    });

    allMatches.forEach(match => {
      if (!match.teamId || !sectionTeamIds.has(match.teamId)) return;
      if (!selectedTeamIds.has(match.teamId)) return;
      if (!match.date) return;
      const matchDate = new Date(match.date);
      const team = allTeams.find(t => t.id === match.teamId);
      if (!team) return;
      addEvent(matchDate, {
        type: "match",
        teamId: match.teamId,
        teamName: team.name,
        label: team.name,
        opponent: match.opponent,
        homeAway: match.homeAway,
        result: match.result ?? undefined,
        at: matchDate,
      });
    });

    extraEvents.forEach((evt) => {
      if (evt.section !== section) return;
      const from = new Date(`${evt.dateFrom}T00:00:00`);
      const to = new Date(`${evt.dateTo}T00:00:00`);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || isAfter(from, to)) return;
      const days = eachDayOfInterval({ start: from, end: to });
      const teamsForEvent =
        evt.targetMode === "all"
          ? allTeams.filter((t) => selectedTeamIds.has(t.id))
          : allTeams.filter((t) => evt.teamIds.includes(t.id) && selectedTeamIds.has(t.id));
      days.forEach((day) => {
        if (evt.frequency === "selected_days" && !evt.weekdays.includes(getDay(day))) return;
        teamsForEvent.forEach((team) => {
          const at = combineLocalDayWithHHmm(day, evt.startTime || "00:00");
          addEvent(day, {
            type: "extra",
            teamId: team.id,
            teamName: team.name,
            label: evt.title,
            time: `${evt.startTime}–${evt.endTime}`,
            at,
          });
        });
      });
    });

    return map;
  }, [calendarDays, allTeams, allMatches, sectionTeamIds, schoolYear, selectedTeamIds, extraEvents, section]);

  const eventsByDayFiltered = useMemo(() => {
    if (!scheduleTimeFilterActive(scheduleFilter)) return eventsByDay;
    const out = new Map<string, CalendarEvent[]>();
    eventsByDay.forEach((list, key) => {
      out.set(
        key,
        list.filter((e) => datePassesScheduleFilter(e.at, scheduleFilter)),
      );
    });
    return out;
  }, [eventsByDay, scheduleFilter]);

  const monthLabel = format(currentMonth, "MMMM yyyy", { locale: it });
  const playersForExtraSelection = useMemo(() => {
    if (extraTargetMode === "all" || extraTeamIds.length === 0) return allPlayers;
    const set = new Set(extraTeamIds);
    return allPlayers.filter((p) => set.has(Number(p.teamId ?? 0)));
  }, [allPlayers, extraTargetMode, extraTeamIds]);

  const toggleWeekday = (weekday: number) => {
    setExtraWeekdays((prev) => (prev.includes(weekday) ? prev.filter((d) => d !== weekday) : [...prev, weekday].sort((a, b) => a - b)));
  };

  const toggleExtraPlayer = (playerId: number) => {
    setExtraPlayerIds((prev) => (prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]));
  };

  const toggleExtraTeam = (teamId: number) => {
    setExtraTeamIds((prev) => (prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]));
  };

  const createExtraEventMutation = useMutation({
    mutationFn: async () => {
      const categoryLabel =
        extraCategory === "allenamento_preparazione"
          ? "Allenamento preparazione"
          : extraCategory === "camp_estivo"
            ? "Camp estivo"
            : extraCategory === "partita_interna"
              ? "Partita interna"
              : "Provino";
      const title = extraTitle.trim() || categoryLabel;
      const body = {
        section,
        category: extraCategory,
        title,
        dateFrom: extraDateFrom,
        dateTo: extraDateTo,
        startTime: extraStartTime,
        endTime: extraEndTime,
        frequency: extraFrequency,
        weekdays: extraFrequency === "selected_days" ? extraWeekdays : [],
        targetMode: extraTargetMode,
        teamIds: extraTargetMode === "selected" ? extraTeamIds : [],
        playerIds: extraPlayerIds,
      };
      const res = await fetch("/api/calendar-extra-events", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/calendar-extra-events", section] });
      setExtraDialogOpen(false);
      setExtraTitle("");
      setExtraDateFrom("");
      setExtraDateTo("");
      setExtraStartTime("17:00");
      setExtraEndTime("18:30");
      setExtraFrequency("everyday");
      setExtraWeekdays([1, 3, 5]);
      setExtraTargetMode("all");
      setExtraTeamIds([]);
      setExtraPlayerIds([]);
      toast({ title: "Evento straordinario creato" });
    },
    onError: (err) => {
      toast({ title: "Evento non creato", description: err instanceof Error ? err.message : "Errore", variant: "destructive" });
    },
  });

  const handleCreateExtraEvent = () => {
    if (!extraDateFrom || !extraDateTo || !extraStartTime || !extraEndTime) return;
    if (extraFrequency === "selected_days" && extraWeekdays.length === 0) return;
    if (extraTargetMode === "selected" && extraTeamIds.length === 0) return;
    createExtraEventMutation.mutate();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarRange className="w-6 h-6 text-primary" />
            Calendario — {SECTION_LABELS[section]}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Anno sportivo {schoolYear.label} · 1 settembre – 30 giugno
          </p>
        </div>
        {canManageExtraEvents && (
          <Button type="button" className="gap-2" onClick={() => setExtraDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            Aggiungi evento straordinario
          </Button>
        )}
      </div>

      {allTeams.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-foreground">
              Annate visibili
              <span className="font-normal text-muted-foreground">
                {" "}
                ({selectedTeamIds.size}/{allTeams.length})
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setSelectedTeamIds(new Set(allTeams.map((t) => t.id)))}
              >
                Tutte
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setSelectedTeamIds(new Set())}
              >
                Nessuna
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Clicca un&apos;annata per includerla o escluderla dal calendario (anche più di una).
          </p>
          <div className="flex flex-wrap gap-2">
            {allTeams.map((team) => {
              const color = teamColorMap.get(team.id);
              const on = selectedTeamIds.has(team.id);
              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => {
                    setSelectedTeamIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(team.id)) next.delete(team.id);
                      else next.add(team.id);
                      return next;
                    });
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all",
                    color?.soft,
                    on
                      ? "ring-2 ring-primary/60 ring-offset-2 ring-offset-background shadow-sm"
                      : "opacity-45 hover:opacity-80",
                  )}
                  aria-pressed={on}
                >
                  <span className={cn("w-2 h-2 rounded-full shrink-0", color?.bg)} />
                  {team.name}
                </button>
              );
            })}
          </div>
          {selectedTeamIds.size === 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Nessuna annata selezionata: il calendario è vuoto. Usa «Tutte» o clicca le annate da vedere.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="h-9 text-xs" onClick={goToPrev}>
          Mese precedente
        </Button>
        <Button variant="outline" size="icon" onClick={goToPrev}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-base font-semibold min-w-[155px] text-center capitalize">
          {monthLabel}
        </span>
        <Button variant="outline" size="icon" onClick={goToNext}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" className="h-9 text-xs" onClick={goToNext}>
          Mese successivo
        </Button>
      </div>

      <div className="rounded-xl border border-border/80 bg-muted/15 p-4 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Filter className="w-4 h-4 text-primary shrink-0" />
              Filtro giorno e fascia oraria
            </div>
            {showScheduleFilters && (
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                Utile in segreteria per vedere solo impegni in certi slot (es. sabato mattina) e valutare
                disponibilità di campo o sovrapposizioni tra annate.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setShowScheduleFilters((v) => !v)}
              title={showScheduleFilters ? "Nascondi filtri orari" : "Mostra filtri orari"}
            >
              {showScheduleFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
            {showScheduleFilters && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 shrink-0"
                disabled={!scheduleTimeFilterActive(scheduleFilter)}
                onClick={() => setScheduleFilter({ ...EMPTY_SCHEDULE_FILTER })}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Azzera orario
              </Button>
            )}
          </div>
        </div>
        {showScheduleFilters && (
          <ScheduleFilterFields value={scheduleFilter} onChange={setScheduleFilter} idPrefix={`sec-cal-${section}`} />
        )}
      </div>

      <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {WEEK_HEADERS.map(h => (
            <div key={h} className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {h}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {calendarDays.map((day, idx) => {
            const key = format(day, "yyyy-MM-dd");
            const events = eventsByDayFiltered.get(key) ?? [];
            const isToday = isSameDay(day, today);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isLastRow = idx >= calendarDays.length - 7;
            const isRightEdge = idx % 7 === 6;

            return (
              <div
                key={key}
                className={[
                  "min-h-[100px] p-1.5 border-b border-r flex flex-col gap-0.5",
                  !isCurrentMonth && "bg-muted/20",
                  isLastRow && "border-b-0",
                  isRightEdge && "border-r-0",
                ].filter(Boolean).join(" ")}
              >
                <span className={[
                  "text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-0.5 self-end",
                  isToday
                    ? "bg-primary text-primary-foreground"
                    : isCurrentMonth
                    ? "text-foreground"
                    : "text-muted-foreground/50",
                ].join(" ")}>
                  {format(day, "d")}
                </span>
                {events.map((evt, i) => {
                  const color = teamColorMap.get(evt.teamId);
                  if (evt.type === "training") {
                    return (
                      <div
                        key={`t-${i}`}
                        title={`${evt.teamName} — Allenamento ${evt.time}`}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border leading-tight cursor-default ${color?.soft}`}
                      >
                        <Dumbbell className="w-2.5 h-2.5 flex-shrink-0 opacity-70" />
                        <span className="truncate">{evt.teamName}</span>
                        {evt.time && <span className="flex-shrink-0 opacity-70 hidden sm:inline">{evt.time}</span>}
                      </div>
                    );
                  }
                  if (evt.type === "extra") {
                    return (
                      <div
                        key={`x-${i}`}
                        title={`${evt.teamName} — ${evt.label} ${evt.time ?? ""}`.trim()}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border leading-tight cursor-default bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200`}
                      >
                        <ClipboardList className="w-2.5 h-2.5 flex-shrink-0 opacity-80" />
                        <span className="truncate">{evt.label}</span>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={`m-${i}`}
                      title={`${evt.teamName} vs ${evt.opponent} (${evt.homeAway === "home" ? "Casa" : "Trasferta"})`}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border leading-tight cursor-default ${color?.soft}`}
                    >
                      <Trophy className="w-2.5 h-2.5 flex-shrink-0 opacity-70" />
                      <span className="truncate">vs {evt.opponent}</span>
                      {evt.result && <span className="flex-shrink-0 font-bold">{evt.result}</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-6 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Dumbbell className="w-3.5 h-3.5" /> Allenamento
        </span>
        <span className="flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5" /> Partita
        </span>
        <span className="flex items-center gap-1.5">
          <ClipboardList className="w-3.5 h-3.5" /> Evento straordinario
        </span>
      </div>

      <Dialog open={extraDialogOpen} onOpenChange={setExtraDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nuovo evento straordinario</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Tipologia</Label>
              <Select value={extraCategory} onValueChange={(v) => setExtraCategory(v as ExtraCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="allenamento_preparazione">Allenamenti preparazione</SelectItem>
                  <SelectItem value="camp_estivo">Camp estivo</SelectItem>
                  <SelectItem value="partita_interna">Partite interne</SelectItem>
                  <SelectItem value="provino">Provini</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Titolo (opzionale)</Label>
              <Input value={extraTitle} onChange={(e) => setExtraTitle(e.target.value)} placeholder="Es. Preparazione pre-campionato" />
            </div>
            <div className="space-y-1">
              <Label>Data da</Label>
              <Input type="date" value={extraDateFrom} onChange={(e) => setExtraDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Data a</Label>
              <Input type="date" value={extraDateTo} onChange={(e) => setExtraDateTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Orario inizio</Label>
              <Input type="time" value={extraStartTime} onChange={(e) => setExtraStartTime(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Orario fine</Label>
              <Input type="time" value={extraEndTime} onChange={(e) => setExtraEndTime(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Frequenza</Label>
              <Select value={extraFrequency} onValueChange={(v) => setExtraFrequency(v as ExtraFrequency)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyday">Tutti i giorni</SelectItem>
                  <SelectItem value="selected_days">Seleziona giorni</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Invia calendari</Label>
              <Select value={extraTargetMode} onValueChange={(v) => setExtraTargetMode(v as "all" | "selected")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i calendari annata</SelectItem>
                  <SelectItem value="selected">Solo calendari selezionati</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {extraTargetMode === "selected" && (
            <div className="space-y-2">
              <Label>Annate selezionate</Label>
              <div className="max-h-28 overflow-auto rounded border p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {allTeams.map((team) => (
                  <label key={team.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={extraTeamIds.includes(team.id)} onCheckedChange={() => toggleExtraTeam(team.id)} />
                    <span>{team.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {extraFrequency === "selected_days" && (
            <div className="space-y-2">
              <Label>Giorni</Label>
              <div className="flex flex-wrap gap-3">
                {[
                  { id: 1, label: "Lun" },
                  { id: 2, label: "Mar" },
                  { id: 3, label: "Mer" },
                  { id: 4, label: "Gio" },
                  { id: 5, label: "Ven" },
                  { id: 6, label: "Sab" },
                  { id: 0, label: "Dom" },
                ].map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={extraWeekdays.includes(d.id)} onCheckedChange={() => toggleWeekday(d.id)} />
                    <span>{d.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Lista giocatori presenti</Label>
            <div className="max-h-40 overflow-auto rounded border p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {playersForExtraSelection.map((p) => {
                const fullName = `${String(p.firstName ?? "").trim()} ${String(p.lastName ?? "").trim()}`.trim() || `Giocatore ${p.id}`;
                return (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={extraPlayerIds.includes(p.id)} onCheckedChange={() => toggleExtraPlayer(p.id)} />
                    <span>{fullName}</span>
                  </label>
                );
              })}
              {playersForExtraSelection.length === 0 && (
                <p className="text-xs text-muted-foreground">Nessun giocatore disponibile per la selezione annate corrente.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setExtraDialogOpen(false)}>Annulla</Button>
            <Button type="button" onClick={handleCreateExtraEvent} disabled={createExtraEventMutation.isPending}>
              {createExtraEventMutation.isPending ? "Inserimento..." : "Inserisci evento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
