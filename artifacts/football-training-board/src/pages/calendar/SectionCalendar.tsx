import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, getDay,
  isBefore, isAfter,
} from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarRange, Trophy, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";

type Section = "scuola_calcio" | "settore_giovanile" | "prima_squadra";

interface TrainingSlot { day: string; startTime: string; endTime: string; }
interface Team { id: number; name: string; category?: string; trainingSchedule?: TrainingSlot[]; }
interface Match { id: number; opponent: string; date: string; homeAway: string; result?: string; teamId?: number; teamName?: string; competition?: string; }

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
  type: "training" | "match";
  teamId: number;
  teamName: string;
  label: string;
  time?: string;
  opponent?: string;
  homeAway?: string;
  result?: string;
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
  const today = useMemo(() => new Date(), []);
  const schoolYear = useMemo(() => getSchoolYear(today), [today]);
  const [currentMonth, setCurrentMonth] = useState(() => getInitialMonth(today));

  const goToPrev = () => setCurrentMonth(m => subMonths(m, 1));
  const goToNext = () => setCurrentMonth(m => addMonths(m, 1));
  const goToToday = () => setCurrentMonth(getInitialMonth(today));

  const { data: allTeams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams", section],
    queryFn: () => apiFetch(`/api/teams?section=${section}`),
  });

  const { data: allMatches = [] } = useQuery<Match[]>({
    queryKey: ["/api/matches"],
    queryFn: () => apiFetch("/api/matches"),
  });

  const sectionTeamIds = useMemo(() => new Set(allTeams.map(t => t.id)), [allTeams]);

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

    const addEvent = (date: Date, evt: CalendarEvent) => {
      if (isBefore(date, schoolYear.start) || isAfter(date, schoolYear.end)) return;
      const key = format(date, "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(evt);
    };

    calendarDays.forEach(day => {
      const jsDay = getDay(day);
      allTeams.forEach(team => {
        (team.trainingSchedule ?? []).forEach(slot => {
          const slotDay = ITALIAN_DAY_MAP[slot.day];
          if (slotDay === jsDay) {
            addEvent(day, {
              type: "training",
              teamId: team.id,
              teamName: team.name,
              label: team.name,
              time: `${slot.startTime}–${slot.endTime}`,
            });
          }
        });
      });
    });

    allMatches.forEach(match => {
      if (!match.teamId || !sectionTeamIds.has(match.teamId)) return;
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
      });
    });

    return map;
  }, [calendarDays, allTeams, allMatches, sectionTeamIds, schoolYear]);

  const monthLabel = format(currentMonth, "MMMM yyyy", { locale: it });

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

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPrev}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-base font-semibold min-w-[155px] text-center capitalize">
            {monthLabel}
          </span>
          <Button variant="outline" size="icon" onClick={goToNext}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="ml-1 text-xs" onClick={goToToday}>
            Oggi
          </Button>
        </div>
      </div>

      {allTeams.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {allTeams.map(team => {
            const color = teamColorMap.get(team.id);
            return (
              <span key={team.id} className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${color?.soft}`}>
                <span className={`w-2 h-2 rounded-full ${color?.bg}`} />
                {team.name}
              </span>
            );
          })}
        </div>
      )}

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
            const events = eventsByDay.get(key) ?? [];
            const isToday = isSameDay(day, today);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isOutOfSeason = isBefore(day, schoolYear.start) || isAfter(day, schoolYear.end);
            const isLastRow = idx >= calendarDays.length - 7;
            const isRightEdge = idx % 7 === 6;

            return (
              <div
                key={key}
                className={[
                  "min-h-[100px] p-1.5 border-b border-r flex flex-col gap-0.5",
                  (!isCurrentMonth || isOutOfSeason) && "bg-muted/20",
                  isLastRow && "border-b-0",
                  isRightEdge && "border-r-0",
                ].filter(Boolean).join(" ")}
              >
                <span className={[
                  "text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-0.5 self-end",
                  isToday
                    ? "bg-primary text-primary-foreground"
                    : isOutOfSeason
                    ? "text-muted-foreground/30"
                    : isCurrentMonth
                    ? "text-foreground"
                    : "text-muted-foreground/50",
                ].join(" ")}>
                  {format(day, "d")}
                </span>
                {!isOutOfSeason && events.map((evt, i) => {
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
      </div>
    </div>
  );
}
