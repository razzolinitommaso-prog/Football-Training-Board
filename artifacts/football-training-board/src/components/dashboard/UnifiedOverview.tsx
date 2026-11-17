import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  CalendarDays,
  Users,
  UsersRound,
  Trophy,
  BookOpen,
  FileText,
  ShieldCheck,
  ArrowUpRight,
  Search,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supervisionState } from "@/components/training/TrainingSupervision";

export type OverviewSession = {
  id: number;
  title?: string | null;
  teamId?: number | null;
  teamName?: string | null;
  scheduledAt?: string | null;
  sessionKind?: string | null;
  status?: string | null;
  notes?: string | null;
  objectives?: string | null;
  description?: string | null;
  createdByUserId?: number | null;
  creatorName?: string | null;
  preparation?: { exerciseCount: number; phases: string[]; complete: boolean };
};
type AlertFilter = "all" | "registration" | "certificate" | "overdue";
type AlertListState = { filter: AlertFilter; search: string; scrollTop: number };

type Player = {
  id: number;
  firstName: string;
  lastName: string;
  dateOfBirth?: string | null;
  teamName?: string | null;
  supplementalTeamName?: string | null;
  registered?: boolean | null;
  status?: string | null;
  medicalCertificateExpiry?: string | null;
};
const normalizeAlertSearch = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("it").trim();

const preparation = (session: OverviewSession) =>
  supervisionState({
    ...session,
    title: session.title ?? "",
    scheduledAt: session.scheduledAt ?? "",
    status: session.status ?? "",
    sessionKind: session.sessionKind ?? "regular",
    teamId: session.teamId ?? null,
    createdByUserId: session.createdByUserId ?? null,
  });
const labels = {
  complete: "Completa",
  pending: "Da completare",
  unstarted: "Da impostare",
  unknown: "Da verificare",
};
const tones = {
  complete: "text-emerald-700 dark:text-emerald-400",
  pending: "text-amber-700 dark:text-amber-400",
  unstarted: "text-muted-foreground",
  unknown: "text-muted-foreground",
};
function Panel({
  title,
  icon: Icon,
  href,
  link,
  action,
  children,
}: {
  title: string;
  icon: typeof CalendarDays;
  href?: string;
  link?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            {title}
          </h2>
          {action ?? (href && <Link
            href={href}
            className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-primary"
          >
            {link}
            <ArrowUpRight className="h-3 w-3" />
          </Link>)}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
const cardTones = {
  default: { border: "", icon: "bg-primary/10 text-primary" },
  amber: { border: "border-amber-200 dark:border-amber-800/60", icon: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  pink: { border: "border-pink-200 dark:border-pink-800/60", icon: "bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300" },
  violet: { border: "border-violet-200 dark:border-violet-800/60", icon: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" },
  sky: { border: "border-sky-200 dark:border-sky-800/60", icon: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" },
};

export function overviewMetric(value: number, state: "loading" | "error" | "ready") {
  if (state === "loading") return "…";
  return state === "error" ? "—" : value;
}

type OverviewCardProps = {
  title: string;
  value: number | string;
  description: string;
  icon: LucideIcon;
  tone?: keyof typeof cardTones;
} & ({ href: string; onClick?: never } | { href?: never; onClick: () => void });

export function OverviewCard({ title, value, description, icon: Icon, tone = "default", href, onClick }: OverviewCardProps) {
  const colors = cardTones[tone];
  const actionClass = "block h-full min-w-0 rounded-lg text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary";
  const content = (
    <Card className={cn("h-full transition-colors hover:border-primary/40", colors.border)}>
      <CardContent className="flex items-start gap-2 p-3 sm:gap-3 sm:p-4">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:h-9 sm:w-9", colors.icon)}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="break-words text-xs font-medium">{title}</p>
          <p className="mt-1 text-xl font-medium leading-none tabular-nums sm:text-2xl">{value}</p>
          <p className="mt-1 break-words text-[11px] leading-4 text-muted-foreground sm:text-xs">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
  return href !== undefined ? (
    <Link href={href} className={actionClass}>{content}</Link>
  ) : (
    <button type="button" onClick={onClick} className={actionClass}>{content}</button>
  );
}

export function UnifiedOverview({
  role,
  teamCount,
  players,
  overduePlayers,
  overduePlayersState,
  sessions,
  sessionsLoading,
  sessionsError,
  matchCount,
  tournamentCount,
  memberCount,
  scopeLabel,
  playersPath,
  dataState,
  children,
}: {
  dataState: { players: string; matches: "loading" | "error" | "ready"; members: string };
  role: string;
  teamCount: number;
  players: Player[];
  overduePlayers?: { enrolledIds: number[]; overdueIds: number[] };
  overduePlayersState?: "pending" | "success" | "error";
  sessions: OverviewSession[];
  sessionsLoading: boolean;
  sessionsError: boolean;
  matchCount: number;
  tournamentCount: number;
  memberCount: number;
  scopeLabel: string;
  playersPath: string;
  children?: ReactNode;
}) {
  const [restoredAlerts] = useState<AlertListState | undefined>(() => window.history.state?.playerAlerts);
  const [alertFilter, setAlertFilter] = useState<AlertFilter | null>(restoredAlerts?.filter ?? null);
  const [alertSearch, setAlertSearch] = useState(restoredAlerts?.search ?? "");
  const alertsTitle = useRef<HTMLHeadingElement>(null);
  const alertsDialog = useRef<HTMLDivElement>(null);
  const restoreScroll = useRef(restoredAlerts?.scrollTop);

  useEffect(() => {
    if (!alertFilter || dataState.players !== "ready" || restoreScroll.current === undefined) return;
    const frame = window.requestAnimationFrame(() => {
      if (!alertsDialog.current || restoreScroll.current === undefined) return;
      alertsDialog.current.scrollTop = restoreScroll.current;
      restoreScroll.current = undefined;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [alertFilter, dataState.players]);
  const technical = [
    "admin",
    "director",
    "technical_director",
    "coach",
    "fitness_coach",
    "athletic_director",
  ].includes(role);
  const administrative = [
    "admin",
    "director",
    "presidente",
    "secretary",
    "sporting_director",
  ].includes(role);
  const operational = sessions.filter(
    (s) =>
      s.sessionKind !== "tipo" &&
      !["cancelled", "canceled"].includes(s.status ?? ""),
  );
  const proposals = sessions.filter((s) => s.sessionKind === "tipo");
  const counts = { complete: 0, pending: 0, unstarted: 0, unknown: 0 };
  operational.forEach((s) => counts[preparation(s)]++);
  const now = new Date(),
    day = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
  const roster = players.filter(player => player.status !== "withdrawn");
  const enrolledIds = new Set(overduePlayers?.enrolledIds);
  const overdueIds = new Set(overduePlayers?.overdueIds);
  const enrolledCount = roster.filter(player => enrolledIds.has(player.id)).length;
  const alerts = administrative && dataState.players === "ready" ? roster.map(player => ({
    player,
    birthYear: /^(\d{4})(?:-|$)/.exec(player.dateOfBirth ?? "")?.[1],
    teamName: player.teamName?.trim() || undefined,
    supplementalTeamName: player.supplementalTeamName?.trim(),
    registration: player.registered !== true,
    overdue: overdueIds.has(player.id),
    certificate: !player.medicalCertificateExpiry ? "Certificato mancante"
      : player.medicalCertificateExpiry.slice(0, 10) < day ? "Certificato scaduto" : null,
  })).filter(item => item.registration || item.certificate || item.overdue) : [];
  const registrations = alerts.filter(item => item.registration).length;
  const overdueCount = alerts.filter(item => item.overdue).length;
  const certificates = alerts.filter(item => item.certificate).length;
  const searchTerms = normalizeAlertSearch(alertSearch).split(/\s+/).filter(Boolean);
  const visibleAlerts = alertFilter === null ? [] : alerts
    .filter(item => alertFilter === "all" || (alertFilter === "registration" ? item.registration : alertFilter === "certificate" ? item.certificate : item.overdue))
    .filter(({ player, birthYear, teamName, supplementalTeamName }) => {
      const searchText = normalizeAlertSearch([player.firstName, player.lastName, birthYear, teamName, supplementalTeamName].join(" "));
      return searchTerms.every(term => searchText.includes(term));
    })
    .sort((a, b) => a.player.lastName.localeCompare(b.player.lastName, "it") || a.player.firstName.localeCompare(b.player.firstName, "it"));
  const programPath =
    role === "secretary" ? "/programmazione-gare" : "/partite";
  const stats = [
    {
      title: "Annate",
      value: teamCount,
      description: scopeLabel,
      icon: UsersRound,
      href: role === "secretary" ? programPath : "/teams",
    },
    {
      title: "Giocatori",
      value:
        dataState.players === "ready"
          ? roster.length
          : dataState.players === "loading"
            ? "…"
            : "—",
      description: "Rosa selezionata",
      icon: Users,
      href: "/players",
    },
    ...(technical
      ? [
          {
            title: "Sedute in calendario",
            value: sessionsLoading
              ? "…"
              : sessionsError
                ? "—"
                : operational.length,
            description: sessionsError
              ? "Dati non disponibili"
              : sessionsLoading ? "Caricamento sedute…" : `${counts.complete} complete · ${counts.pending} da completare · ${counts.unstarted} da impostare`,
            icon: CalendarDays,
            href: "/training",
          },
        ]
      : [
          {
            title: "Gare in calendario",
            value: overviewMetric(matchCount, dataState.matches),
            description: "Impegni delle annate selezionate",
            icon: Trophy,
            href: programPath,
          },
        ]),
    role === "technical_director"
      ? {
          title: "Linee guida",
          value: sessionsLoading ? "…" : sessionsError ? "—" : proposals.length,
          description: "Proposte visibili",
          icon: BookOpen,
          href: "/training?view=guidelines",
        }
      : role === "secretary"
        ? {
            title: "Tornei e amichevoli",
            value: overviewMetric(tournamentCount, dataState.matches),
            description: "Programmi selezionati",
            icon: Trophy,
            href: programPath,
          }
        : technical
          ? {
              title: "Partite",
              value: overviewMetric(matchCount, dataState.matches),
              description: "Impegni in calendario",
              icon: Trophy,
              href: programPath,
            }
          : {
              title: "Membri",
              value:
                dataState.members === "ready"
                  ? memberCount
                  : dataState.members === "loading"
                    ? "…"
                    : "—",
              description: "Settori selezionati",
              icon: ShieldCheck,
              href: "/members",
            },
  ];
  const nearest = [...operational]
    .filter((s) => s.scheduledAt)
    .sort(
      (a, b) =>
        Math.abs(new Date(a.scheduledAt!).getTime() - Date.now()) -
        Math.abs(new Date(b.scheduledAt!).getTime() - Date.now()),
    )
    .slice(0, 2);
  return (
    <section aria-label="Panoramica unificata" className="space-y-5">
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Panoramica · {scopeLabel}
        </h2>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {(role === "technical_director"
            ? [
                stats[1],
                stats[2],
                stats[3],
                {
                  title: "Partite",
                  value: overviewMetric(matchCount, dataState.matches),
                  description: "Impegni in calendario",
                  icon: Trophy,
                  href: "/partite",
                },
              ]
            : stats
          ).map(card => <OverviewCard key={card.title} {...card} />)}
          {children}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {technical ? (
          <Panel
            title="Preparazione delle sedute"
            icon={CalendarDays}
            href="/training"
            link="Apri sedute"
          >
            {sessionsError ? (
              <p role="alert" className="text-sm text-muted-foreground">
                Impossibile caricare le sedute. Ricarica la pagina.
              </p>
            ) : sessionsLoading ? (
              <p role="status" className="text-sm text-muted-foreground">
                Caricamento sedute…
              </p>
            ) : (
              <>
                <div className="mb-1 flex flex-wrap gap-2">
                  {(["complete", "pending", "unstarted"] as const).map(
                    (state) => (
                      <Badge
                        key={state}
                        variant="outline"
                        className={`rounded-md text-xs font-normal ${tones[state]}`}
                      >
                        {counts[state]}{" "}
                        {state === "complete"
                          ? "complete"
                          : labels[state].toLowerCase()}
                      </Badge>
                    ),
                  )}
                  {!!counts.unknown && (
                    <Badge variant="outline">
                      {counts.unknown} da verificare
                    </Badge>
                  )}
                </div>
                {nearest.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between gap-3 border-b py-3 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">
                        {session.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {session.scheduledAt &&
                          new Date(session.scheduledAt).toLocaleString(
                            "it-IT",
                            {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}{" "}
                        · {session.teamName ?? "Annata"}
                        {session.creatorName ? ` · ${session.creatorName}` : ""}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className={`shrink-0 text-xs ${tones[preparation(session)]}`}
                      asChild
                    >
                      <Link href={`/training?sessionId=${session.id}`}>
                        {labels[preparation(session)]}
                      </Link>
                    </Button>
                  </div>
                ))}
                {!operational.length && (
                  <p className="pt-3 text-sm text-muted-foreground">
                    Nessuna seduta nell’ambito selezionato.
                  </p>
                )}
              </>
            )}
          </Panel>
        ) : (
          <Panel
            title="Programmazione gare"
            icon={CalendarDays}
            href={programPath}
            link="Apri calendario FTB"
          >
            <div className="space-y-3">
              <p className="text-sm">
                Calendario, tornei e amichevoli delle annate selezionate.
              </p>
              <p className="text-xs text-muted-foreground">
                {dataState.matches === "ready"
                  ? `${matchCount} gare · ${tournamentCount} tornei e amichevoli`
                  : dataState.matches === "loading"
                    ? "Caricamento gare…"
                    : "Dati gare non disponibili"}
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link href={programPath}>
                  {role === "secretary"
                    ? "Gestisci programmi / PDF"
                    : "Consulta partite"}
                </Link>
              </Button>
            </div>
          </Panel>
        )}
        {role === "technical_director" ? (
          <Panel
            title="Linee guida e direttive"
            icon={BookOpen}
            href="/training?view=guidelines"
            link="Visualizza"
          >
            <p className="mb-3 text-xs text-muted-foreground">
              Il mister consulta e decide se adottare le proposte.
            </p>
            {proposals.slice(0, 2).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 border-t py-3"
              >
                <p className="text-sm">{s.title}</p>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/training?view=guidelines&sessionId=${s.id}`}>
                    Apri
                  </Link>
                </Button>
              </div>
            ))}
            {!proposals.length && !sessionsLoading && (
              <p className="text-sm text-muted-foreground">
                Nessuna linea guida nell’ambito selezionato.
              </p>
            )}
            <Link
              href="/training?view=guidelines"
              className="mt-3 inline-block text-xs text-primary"
            >
              Consulta anche le direttive →
            </Link>
          </Panel>
        ) : administrative ? (
          <>
          <Panel
            title="Situazione amministrativa"
            icon={FileText}
            action={<Button type="button" variant="ghost" size="sm" className="h-auto shrink-0 px-1 py-1 text-xs text-muted-foreground"
              disabled={dataState.players !== "ready"} onClick={() => setAlertFilter("all")}>
              Apri giocatori <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </Button>}
          >
            {dataState.players !== "ready" ? (
              <p
                role={dataState.players === "error" ? "alert" : "status"}
                className="text-sm text-muted-foreground"
              >
                {dataState.players === "error"
                  ? "Dati della rosa non disponibili. Ricarica la pagina."
                  : "Caricamento rosa…"}
              </p>
            ) : (
              <>
                <button type="button" onClick={() => setAlertFilter("registration")}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b py-3 text-left text-sm hover:text-primary">
                  <span>Tesseramento da verificare</span><strong className="tabular-nums">{registrations}</strong>
                </button>
                <button type="button" onClick={() => setAlertFilter("certificate")}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 text-left text-sm hover:text-primary">
                  <span>Certificati scaduti o mancanti</span><strong className="tabular-nums">{certificates}</strong>
                </button>
                {overduePlayersState && <button type="button" onClick={() => setAlertFilter("overdue")}
                  disabled={overduePlayersState !== "success"}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t py-3 text-left text-sm hover:text-primary">
                  <span>Iscritti con pagamenti scaduti</span>
                  <strong className="shrink-0 tabular-nums">{overduePlayersState === "success" ? overdueCount + "/" + enrolledCount : "—"}</strong>
                </button>}
                {overduePlayersState === "error" && <p className="text-xs text-muted-foreground" role="status">Dati sui pagamenti scaduti non disponibili.</p>}
              </>
            )}
          </Panel>
          <Dialog open={alertFilter !== null} onOpenChange={open => {
            if (!open) {
              setAlertFilter(null);
              setAlertSearch("");
              restoreScroll.current = undefined;
              window.history.replaceState({ ...window.history.state, playerAlerts: undefined }, "");
            }
          }}>
            <DialogContent ref={alertsDialog} className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl" onOpenAutoFocus={event => {
              event.preventDefault();
              alertsTitle.current?.focus();
            }}>
              <DialogHeader>
                <DialogTitle ref={alertsTitle} tabIndex={-1}>Giocatori con segnalazioni</DialogTitle>
                <DialogDescription>{scopeLabel}</DialogDescription>
              </DialogHeader>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input type="search" aria-label="Cerca giocatore, annata o squadra"
                  placeholder="Cerca giocatore, annata o squadra" className="pl-9"
                  value={alertSearch} onChange={event => setAlertSearch(event.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtra per segnalazione">
                {([
                  ["all", "Tutte", alerts.length],
                  ["registration", "Tesseramento", registrations],
                  ["certificate", "Certificati", certificates],
                  ...(overduePlayersState === "success" ? [["overdue", "Pagamenti scaduti", overdueCount] as const] : []),
                ] as const).map(([filter, label, count]) => <Button key={filter} type="button" size="sm"
                  variant={alertFilter === filter ? "secondary" : "outline"} aria-pressed={alertFilter === filter}
                  onClick={() => setAlertFilter(filter)}>{label} · {count}</Button>)}
              </div>
              {visibleAlerts.length ? <ul className="divide-y rounded-lg border">
                {visibleAlerts.map(({ player, birthYear, teamName, supplementalTeamName, registration, certificate, overdue }) => <li key={player.id}>
                  <Link href={`${playersPath}?openPlayerId=${player.id}${role === "secretary" ? "&mode=edit" : ""}`}
                    state={{ fromPlayerAlerts: true }}
                    onClick={() => {
                      const playerAlerts: AlertListState = {
                        filter: alertFilter ?? "all",
                        search: alertSearch,
                        scrollTop: alertsDialog.current?.scrollTop ?? 0,
                      };
                      window.history.replaceState({ ...window.history.state, playerAlerts }, "");
                    }}
                    className="flex min-w-0 items-center justify-between gap-2 rounded-md p-3 hover:bg-muted/50">
                    <span className="min-w-0 space-y-1">
                      <span className="block break-words text-sm font-semibold">{player.lastName} {player.firstName}</span>
                      <span className="block break-words text-xs text-muted-foreground">
                        Annata {birthYear ?? "non indicata"} · {teamName ?? "Squadra non assegnata"}
                        {supplementalTeamName && supplementalTeamName !== teamName && (
                          <span className="block">Anche in {supplementalTeamName}</span>
                        )}
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {registration && (alertFilter === "all" || alertFilter === "registration") && <Badge variant="outline">Tesseramento da verificare</Badge>}
                        {certificate && (alertFilter === "all" || alertFilter === "certificate") && <Badge variant="outline">{certificate}</Badge>}
                        {overdue && (alertFilter === "all" || alertFilter === "overdue") && <Badge variant="outline" className="border-red-300 text-red-700 dark:text-red-300">Pagamento scaduto</Badge>}
                        {alertFilter !== "all" && [registration, certificate, overdue].filter(Boolean).length > 1 && (
                          <Badge variant="secondary" aria-label="Altre segnalazioni">+{[registration, certificate, overdue].filter(Boolean).length - 1}</Badge>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-primary">Apri scheda <ArrowUpRight className="h-3 w-3" aria-hidden="true" /></span>
                  </Link>
                </li>)}
              </ul> : <p className="text-sm text-muted-foreground">{searchTerms.length ? "Nessun giocatore corrisponde alla ricerca." : "Nessun giocatore per questo filtro."}</p>}
            </DialogContent>
          </Dialog>
          </>
        ) : (
          <Panel
            title="Partite e convocazioni"
            icon={Trophy}
            href="/training/convocazioni"
            link="Convocazioni"
          >
            <p className="text-sm">
              {dataState.matches === "ready"
                ? `${matchCount} gare delle annate selezionate.`
                : dataState.matches === "loading"
                  ? "Caricamento gare…"
                  : "Dati gare non disponibili"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Prepara le partite e consulta convocati, schieramenti e minutaggi.
            </p>
            <Button className="mt-4" variant="outline" size="sm" asChild>
              <Link href="/partite">Apri partite</Link>
            </Button>
          </Panel>
        )}
      </div>
    </section>
  );
}
