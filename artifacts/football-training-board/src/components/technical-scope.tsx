import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { withApi } from "@/lib/api-base";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
export type TechnicalSection =
  | "scuola_calcio"
  | "settore_giovanile"
  | "prima_squadra";
export type TechnicalTeam = {
  id: number;
  name: string;
  clubSection?: string | null;
};
export const technicalSections = {
  scuola_calcio: "Scuola Calcio",
  settore_giovanile: "Settore Giovanile",
  prima_squadra: "Prima Squadra",
};
export const unifiedStaffRoles = [
  "admin",
  "presidente",
  "director",
  "secretary",
  "sporting_director",
  "technical_director",
  "coach",
  "fitness_coach",
  "athletic_director",
];
export const isScopeAwarePath = (path: string) =>
  /^\/(?:technical\/(?:dashboard|matches|championships)|dashboard|teams|players|training|exercises|attendance|partite|campionati|programmazione-gare)$/.test(
    path,
  ) ||
  /^\/(?:scuola-calcio|settore-giovanile|prima-squadra)\/(?:dashboard|teams|players|training(?:\/convocazioni)?|exercises|attendance|matches|campionati|programmazione-gare)$/.test(
    path,
  ) ||
  path === "/training/convocazioni";
type Scope = {
  enabled: boolean;
  section?: TechnicalSection;
  teamId?: number;
  teams: TechnicalTeam[];
  sections: TechnicalSection[];
  loading: boolean;
  error: boolean;
  setSection: (value: string) => void;
  setTeam: (value: string) => void;
};
const Context = createContext<Scope>({
  enabled: false,
  teams: [],
  sections: [],
  loading: false,
  error: false,
  setSection: () => {},
  setTeam: () => {},
});
export function TechnicalScopeProvider({ children }: { children: ReactNode }) {
  const {
    role,
    club,
    user,
    sections: loginSections,
    section: loginSection,
  } = useAuth();
  const [location, navigate] = useLocation();
  const enabled = unifiedStaffRoles.includes(role ?? "");
  // Keep the existing DT selection and isolate other roles/accounts/clubs.
  const key =
    role === "technical_director"
      ? `ftb-technical-scope:${club?.id}:${user?.id}`
      : `ftb-work-scope:${club?.id}:${user?.id}:${role}`;
  const [stored, setStored] = useState<{
    key: string;
    section?: string;
    teamId?: number;
  }>({ key: "" });
  useEffect(() => {
    try {
      setStored({ ...JSON.parse(localStorage.getItem(key) ?? "{}"), key });
    } catch {
      setStored({ key });
    }
  }, [key]);
  const query = useQuery<{
    teams: TechnicalTeam[];
    sections: TechnicalSection[];
  }>({
    queryKey: ["/api/teams", "navigation-scope", club?.id, user?.id, role],
    enabled: enabled && !!club?.id,
    retry: (count, error) =>
      ![401, 403].includes((error as { status?: number }).status ?? 0) &&
      count < 1,
    queryFn: async () => {
      const r = await fetch(withApi("/api/teams/navigation-scope"), {
        credentials: "include",
      });
      // Frontend/API deploy independently. Old servers route this name to
      // /teams/:id (400) or 404: reuse their already-authorized team list,
      // narrowed by the authenticated sections. Never fall back after 401/403.
      if ([400, 404].includes(r.status)) {
        const legacy = await fetch(withApi("/api/teams"), {
          credentials: "include",
        });
        if (!legacy.ok)
          throw Object.assign(Error("Annate non disponibili"), {
            status: legacy.status,
          });
        const rows: TechnicalTeam[] = await legacy.json();
        if (!Array.isArray(rows)) throw Error("Annate non disponibili");
        const normalize = (value: string) =>
          value.replaceAll("-", "_") as TechnicalSection;
        const explicit = [
          ...new Set(
            (loginSections.length
              ? loginSections
              : loginSection
                ? [loginSection]
                : []
            )
              .map(normalize)
              .filter((key) => key in technicalSections),
          ),
        ];
        const sections = loginSections.length || loginSection
          ? explicit
          : [
              ...new Set(
                rows
                  .map((team) => normalize(team.clubSection ?? ""))
                  .filter((key) => key in technicalSections),
              ),
            ];
        return {
          sections,
          teams: rows
            .filter((team) =>
              sections.includes(normalize(team.clubSection ?? "")),
            )
            .map(({ id, name, clubSection }) => ({ id, name, clubSection })),
        };
      }
      if (!r.ok)
        throw Object.assign(Error("Annate non disponibili"), {
          status: r.status,
        });
      return r.json();
    },
  });
  const teams = query.data?.teams ?? [];
  const sections = query.data?.sections ?? [];
  const legacySection = isScopeAwarePath(location)
    ? (location
        .match(/^\/(scuola-calcio|settore-giovanile|prima-squadra)\//)?.[1]
        ?.replaceAll("-", "_") as TechnicalSection | undefined)
    : undefined;
  const forbidden =
    !!legacySection && !query.isPending && !sections.includes(legacySection);
  useEffect(() => {
    if (
      !legacySection ||
      !sections.includes(legacySection) ||
      stored.key !== key ||
      stored.section === legacySection
    )
      return;
    const value = {
      section: legacySection,
      teamId: teams.some(
        (team) =>
          team.id === stored.teamId && team.clubSection === legacySection,
      )
        ? stored.teamId
        : undefined,
    };
    setStored({ ...value, key });
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [
    legacySection,
    query.data,
    key,
    stored.key,
    stored.section,
    stored.teamId,
  ]);
  const section =
    legacySection ??
    (stored.key === key && sections.includes(stored.section as TechnicalSection)
      ? (stored.section as TechnicalSection)
      : sections.length === 1
        ? sections[0]
        : undefined);
  const teamId =
    stored.key === key &&
    teams.some(
      (t) => t.id === stored.teamId && (!section || t.clubSection === section),
    )
      ? stored.teamId
      : undefined;
  const save = (value: { section?: string; teamId?: number }) => {
    setStored({ ...value, key });
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  };
  const moveFromLegacy = (value?: string) => {
    if (legacySection) {
      const rest = location.replace(
        /^\/(scuola-calcio|settore-giovanile|prima-squadra)/,
        "",
      );
      navigate(value ? `/${value.replaceAll("_", "-")}${rest}` : rest);
    }
  };
  const setSection = (value: string) => {
    if (value !== "all" && !sections.includes(value as TechnicalSection))
      return;
    const next = value === "all" ? undefined : value;
    save({ section: next });
    moveFromLegacy(next);
  };
  const setTeam = (value: string) => {
    const team = teams.find((t) => t.id === Number(value));
    if (value !== "all" && !team) return;
    const next = team?.clubSection ?? section;
    save({ section: next, teamId: team?.id });
    if (next !== legacySection) moveFromLegacy(next);
  };
  return (
    <Context.Provider
      value={{
        enabled,
        section,
        teamId,
        sections,
        teams,
        loading: enabled && (query.isPending || stored.key !== key),
        error: enabled && (query.isError || forbidden),
        setSection,
        setTeam,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useTechnicalScope = () => useContext(Context);
export function TechnicalScopeBar() {
  const scope = useTechnicalScope();
  if (!scope.enabled) return null;
  return (
    <section
      aria-label="Settore e annata di lavoro"
      className="mb-6 grid grid-cols-2 gap-3 rounded-xl border bg-card p-3 sm:gap-4 sm:p-4"
    >
      <div className="min-w-0 space-y-2">
        <label className="text-xs text-muted-foreground">Settore</label>
        <Select
          value={scope.section ?? "all"}
          onValueChange={scope.setSection}
          disabled={scope.loading || scope.error}
        >
          <SelectTrigger aria-label="Settore di lavoro">
            <SelectValue placeholder="Seleziona settore" />
          </SelectTrigger>
          <SelectContent>
            {scope.sections.length > 1 && (
              <SelectItem value="all">Tutti i settori autorizzati</SelectItem>
            )}
            {scope.sections.map((key) => (
              <SelectItem key={key} value={key}>
                {technicalSections[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-0 space-y-2">
        <label className="text-xs text-muted-foreground">Annata</label>
        <Select
          value={scope.teamId ? String(scope.teamId) : "all"}
          onValueChange={scope.setTeam}
          disabled={scope.loading || scope.error}
        >
          <SelectTrigger aria-label="Annata di lavoro">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {scope.section
                ? "Tutte le annate del settore"
                : "Tutte le annate autorizzate"}
            </SelectItem>
            {scope.teams
              .filter((t) => !scope.section || t.clubSection === scope.section)
              .map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}
