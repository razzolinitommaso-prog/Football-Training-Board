import type { ReactNode } from "react";
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
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
type Player = {
  registered?: boolean | null;
  medicalCertificateExpiry?: string | null;
};
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
  children,
}: {
  title: string;
  icon: typeof CalendarDays;
  href: string;
  link: string;
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
          <Link
            href={href}
            className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-primary"
          >
            {link}
            <ArrowUpRight className="h-3 w-3" />
          </Link>
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
  sessions,
  sessionsLoading,
  sessionsError,
  matchCount,
  tournamentCount,
  memberCount,
  scopeLabel,
  dataState,
  children,
}: {
  dataState: { players: string; matches: string; members: string };
  role: string;
  teamCount: number;
  players: Player[];
  sessions: OverviewSession[];
  sessionsLoading: boolean;
  sessionsError: boolean;
  matchCount: number;
  tournamentCount: number;
  memberCount: number;
  scopeLabel: string;
  children?: ReactNode;
}) {
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
  const registrations = players.filter((p) => p.registered !== true).length;
  const certificates = players.filter(
    (p) =>
      !p.medicalCertificateExpiry ||
      p.medicalCertificateExpiry.slice(0, 10) < day,
  ).length;
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
          ? players.length
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
            title: "Sedute del mister",
            value: sessionsLoading
              ? "…"
              : sessionsError
                ? "—"
                : operational.length,
            description: sessionsError
              ? "Dati non disponibili"
              : `${counts.complete} complete · ${counts.pending} da completare`,
            icon: CalendarDays,
            href: "/training",
          },
        ]
      : [
          {
            title: "Gare in calendario",
            value:
              dataState.matches === "ready"
                ? matchCount
                : dataState.matches === "loading"
                  ? "…"
                  : "—",
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
            value:
              dataState.matches === "ready"
                ? tournamentCount
                : dataState.matches === "loading"
                  ? "…"
                  : "—",
            description: "Programmi selezionati",
            icon: Trophy,
            href: programPath,
          }
        : technical
          ? {
              title: "Partite",
              value: matchCount,
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
                  value:
                    dataState.matches === "ready"
                      ? matchCount
                      : dataState.matches === "loading"
                        ? "…"
                        : "—",
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
          <Panel
            title="Situazione amministrativa"
            icon={FileText}
            href="/players"
            link="Apri giocatori"
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
                <div className="flex justify-between gap-2 border-b py-3 text-sm">
                  <span>Tesseramento da verificare</span>
                  <strong className="tabular-nums">{registrations}</strong>
                </div>
                <div className="flex justify-between gap-2 pt-3 text-sm">
                  <span>Certificati scaduti o mancanti</span>
                  <strong className="tabular-nums">{certificates}</strong>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Riepilogo della rosa selezionata. Dettagli nelle schede
                  giocatore.
                </p>
              </>
            )}
          </Panel>
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
