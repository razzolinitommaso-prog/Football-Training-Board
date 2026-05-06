import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  Users,
  UsersRound,
  CalendarDays,
  Building2,
  ShieldCheck,
  Crosshair,
  Dumbbell,
  Activity,
  BarChart3,
  Trophy,
  BookOpen,
  CalendarCheck,
  FileText,
  CreditCard,
  Package,
  ClipboardList,
  Banknote,
  Layers,
  Heart,
  MessageSquare,
  Bell,
  KeyRound,
  GraduationCap,
  Star,
  School,
  ChevronRight,
  X,
  CalendarRange,
  RefreshCw,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLanguage } from "@/lib/i18n";
import { LanguageToggle } from "@/components/language-toggle";

type SubItem = { label: string; url: string; icon: any; roles: string[] };

// Sub-items per sezione — roles confermati dalla matrice
const SEZIONE_SUB_ITEMS: SubItem[] = [
  { label: "Squadre",              url: "teams",      icon: UsersRound,    roles: ["admin", "presidente", "director", "secretary", "technical_director", "coach", "fitness_coach", "athletic_director"] },
  { label: "Giocatori",            url: "players",    icon: Users,         roles: ["admin", "presidente", "director", "secretary", "technical_director", "coach", "fitness_coach", "athletic_director"] },
  { label: "Sessioni Allenamento", url: "training",   icon: CalendarDays,  roles: ["admin", "presidente", "director", "technical_director", "coach", "fitness_coach", "athletic_director"] },
  { label: "Partite",              url: "matches",    icon: Trophy,        roles: ["admin", "presidente", "director", "secretary", "technical_director", "coach", "fitness_coach", "athletic_director"] },
  { label: "Stagioni",             url: "seasons",    icon: Layers,        roles: ["admin", "presidente", "director", "technical_director"] },
  { label: "Presenze",             url: "attendance", icon: CalendarCheck, roles: ["admin", "presidente", "technical_director", "coach"] },
  { label: "Calendario",           url: "calendar",   icon: CalendarRange, roles: ["admin", "presidente", "director", "secretary", "technical_director", "coach", "fitness_coach", "athletic_director"] },
];

// Tutte e 3 le sezioni — la visibilità viene filtrata per section utente in CollapsibleSection
const SEZIONI = [
  { key: "scuola-calcio",     label: "Scuola Calcio",     icon: School },
  { key: "settore-giovanile", label: "Settore Giovanile", icon: GraduationCap },
  { key: "prima-squadra",     label: "Prima Squadra",     icon: Star },
] as const;

// Ruoli che hanno accesso ad almeno una sezione (il direttore tecnico usa il menu “area tecnica” unificato, senza albero a 3 sezioni)
const SEZIONE_ROLES = ["admin", "presidente", "director", "secretary", "coach", "fitness_coach", "athletic_director"];

// Club-wide: tutte e tre le sezioni nel menu. Il DT non è incluso: vede squadre/giocatori/sessioni da percorsi globali /teams, /players, ecc.
const ALL_SECTIONS_ROLES = ["admin", "presidente", "director"];

/** Voci aggiuntive per il direttore tecnico: metodologia, coordinamento staff, lettura attività (non segreteria, non gestione fitness). */
const TECHNICAL_DIRECTOR_EXTRA: { label: string; url: string; icon: typeof UsersRound }[] = [
  { label: "Squadre", url: "/teams", icon: UsersRound },
  { label: "Giocatori", url: "/players", icon: Users },
  { label: "Calendario", url: "/scuola-calcio/calendar", icon: CalendarRange },
  { label: "Partite", url: "/matches", icon: Trophy },
  { label: "Presenze", url: "/attendance", icon: CalendarCheck },
  { label: "Stagioni", url: "/seasons", icon: Layers },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { role, section, club } = useAuth();
  const { t } = useLanguage();
  const { isMobile, setOpenMobile, toggleSidebar } = useSidebar();

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [location, isMobile, setOpenMobile]);

  type NavItem = { titleKey?: keyof typeof t; label?: string; url: string; icon: any; roles: string[]; group: string };

  const navigation: NavItem[] = [
    // Main
    { titleKey: "dashboard",       url: "/dashboard",    icon: LayoutDashboard, roles: ["admin", "presidente", "coach", "secretary", "technical_director", "fitness_coach", "director", "athletic_director"], group: "main" },
    { titleKey: "tacticalBoard",   url: "/tactical-board", icon: Crosshair,     roles: ["coach", "fitness_coach"], group: "main" },
    { label: "Le mie sessioni",    url: "/training",     icon: CalendarDays,    roles: ["technical_director", "coach", "fitness_coach"], group: "main" },
    { label: "Esercitazioni",      url: "/exercises",    icon: BookOpen,        roles: ["coach", "fitness_coach", "athletic_director", "director", "technical_director"], group: "main" },
    { titleKey: "clubSettings",    url: "/club",         icon: Building2,       roles: ["admin", "presidente"], group: "main" },
    { titleKey: "members",         url: "/members",      icon: ShieldCheck,     roles: ["admin", "presidente", "secretary"], group: "main" },
    { label: "Notifiche Piattaforma", url: "/club/platform-notifications", icon: Bell, roles: ["admin", "presidente", "secretary"], group: "main" },
    // Segreteria
    { titleKey: "registrations",   url: "/secretary/registrations", icon: ClipboardList, roles: ["admin", "presidente", "secretary"], group: "secretary" },
    { titleKey: "payments",        url: "/secretary/payments",      icon: Banknote,      roles: ["admin", "presidente", "secretary"], group: "secretary" },
    { titleKey: "documents",       url: "/secretary/documents",     icon: FileText,      roles: ["admin", "presidente", "secretary"], group: "secretary" },
    { titleKey: "equipment",       url: "/secretary/equipment",     icon: Package,       roles: ["admin", "presidente", "secretary"], group: "secretary" },
    { label: "App Genitori",          url: "/secretary/parent-app",    icon: Heart,      roles: ["admin", "presidente", "secretary"], group: "secretary" },
    { label: "Transizione Stagionale", url: "/season-transition",      icon: RefreshCw,  roles: ["admin", "presidente", "secretary"], group: "secretary" },
    { label: "Credenziali & Accessi", url: "/club/credentials",        icon: KeyRound,   roles: ["admin", "presidente", "secretary", "director"], group: "secretary" },
    // Fitness (DT: solo lettura a livello funzionale se esposto altrove; non gestisce programmi fitness dalla sidebar)
    { titleKey: "fitnessDashboard",  url: "/fitness-dashboard",  icon: Activity,  roles: ["fitness_coach", "athletic_director", "director"], group: "fitness" },
    { titleKey: "fitnessPrograms",   url: "/fitness-programs",   icon: Dumbbell,  roles: ["fitness_coach", "athletic_director", "director"], group: "fitness" },
    { titleKey: "playerPerformance", url: "/player-performance", icon: BarChart3, roles: ["admin", "presidente", "fitness_coach"], group: "fitness" },
    // Admin
    { titleKey: "billing",       url: "/billing",       icon: CreditCard, roles: ["admin", "presidente"], group: "admin" },
    { label: "Accesso Genitori", url: "/admin/parents", icon: Heart,      roles: ["admin", "presidente"], group: "admin" },
    // Genitori
    { label: "Dashboard",          url: "/parent-dashboard",      icon: LayoutDashboard, roles: ["parent"], group: "parent" },
    { label: "Squadre & Atleti",   url: "/parent/children",       icon: Users,           roles: ["parent"], group: "parent" },
    { label: "Comunicazioni",      url: "/parent/communications", icon: MessageSquare,   roles: ["parent"], group: "parent" },
    { label: "Partite",            url: "/parent/matches",        icon: Trophy,          roles: ["parent"], group: "parent" },
    { label: "Documenti",          url: "/parent/documents",      icon: FileText,        roles: ["parent"], group: "parent" },
    { label: "Pagamenti",          url: "/parent/payments",       icon: Banknote,        roles: ["parent"], group: "parent" },
    { label: "Notifiche",          url: "/parent/notifications",  icon: Bell,            roles: ["parent"], group: "parent" },
  ];

  const visibleNav    = navigation.filter(item => item.roles.includes(role || ""));
  const mainNav       = visibleNav.filter(item => item.group === "main");
  const secretaryNav  = visibleNav.filter(item => item.group === "secretary");
  const fitnessNav    = visibleNav.filter(item => item.group === "fitness");
  const adminNav      = visibleNav.filter(item => item.group === "admin");
  const parentNav     = visibleNav.filter(item => item.group === "parent");

  // Normalizza section (underscore → hyphen) per confronto con SEZIONI key
  const userSectionKey = section ? section.replace(/_/g, "-") : null;
  const seeAllSections = ALL_SECTIONS_ROLES.includes(role || "");

  function shouldShowSection(sectionKey: string): boolean {
    if (!SEZIONE_ROLES.includes(role || "")) return false;
    if (seeAllSections) return true;
    return userSectionKey === sectionKey;
  }

  function CollapsibleSection({ sectionKey, label, Icon }: { sectionKey: string; label: string; Icon: any }) {
    if (!shouldShowSection(sectionKey)) return null;

    const basePath = `/${sectionKey}`;
    const subItems = SEZIONE_SUB_ITEMS
      .filter(s => s.roles.includes(role || ""))
      .map(s => ({ ...s, url: `${basePath}/${s.url}` }));

    if (subItems.length === 0) return null;

    const subActive = subItems.some(s => location.startsWith(s.url));
    const isActive  = subActive || location === basePath;

    return (
      <Collapsible defaultOpen={isActive} className="group/collapsible">
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton isActive={isActive} tooltip={label} className="font-medium w-full">
              <Icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-sidebar-foreground/70"}`} />
              <span>{label}</span>
              <ChevronRight className="ml-auto w-4 h-4 text-sidebar-foreground/50 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {subItems.map((sub) => {
                const active = location.startsWith(sub.url);
                return (
                  <SidebarMenuSubItem key={sub.url}>
                    <SidebarMenuSubButton asChild isActive={active}>
                      <Link href={sub.url} className="flex items-center gap-2">
                        <sub.icon className={`w-4 h-4 ${active ? "text-primary" : "text-sidebar-foreground/60"}`} />
                        <span>{sub.label}</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                );
              })}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  }

  function NavGroup({ items, labelKey }: { items: NavItem[]; labelKey: string }) {
    if (items.length === 0) return null;
    return (
      <SidebarGroup>
        <SidebarGroupLabel className="text-xs uppercase tracking-wider text-sidebar-foreground/50 font-semibold mb-2">
          {labelKey}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => {
              const isActive = location.startsWith(item.url);
              const title = item.label ?? (item.titleKey ? t[item.titleKey] as string : "");
              return (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={title} className="font-medium">
                    <Link href={item.url} className="flex items-center gap-3">
                      <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-sidebar-foreground/70"}`} />
                      <span>{title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  const topMainItems    = mainNav.filter(i => i.url === "/dashboard" || i.url === "/tactical-board" || i.url === "/training" || i.url === "/exercises");
  const bottomMainItems = mainNav.filter(i => i.url !== "/dashboard" && i.url !== "/tactical-board" && i.url !== "/training" && i.url !== "/exercises");

  return (
    <Sidebar variant="sidebar" className="border-r shadow-sm">
      <SidebarContent>
        <div className="p-5 pb-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-inner shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </div>
              <span className="font-display font-bold text-xl tracking-tight text-sidebar-foreground truncate">
                FT Board
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-9 w-9 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent md:hidden"
              onClick={toggleSidebar}
              aria-label="Chiudi menu"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-sidebar-foreground/50 font-semibold mb-2">
            {t.menu}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {topMainItems.map((item) => {
                const isActive = location.startsWith(item.url);
                const title =
                  item.url === "/training" && role === "technical_director"
                    ? "Sessioni allenamento"
                    : (item.label ?? (item.titleKey ? t[item.titleKey] as string : ""));
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={title} className="font-medium">
                      <Link href={item.url} className="flex items-center gap-3">
                        <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-sidebar-foreground/70"}`} />
                        <span>{title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              {role === "technical_director" &&
                TECHNICAL_DIRECTOR_EXTRA.map(({ label, url, icon: Icon }) => {
                  const isActive = location.startsWith(url);
                  return (
                    <SidebarMenuItem key={url}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={label} className="font-medium">
                        <Link href={url} className="flex items-center gap-3">
                          <Icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-sidebar-foreground/70"}`} />
                          <span>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}

              {role !== "technical_director" &&
                SEZIONI.map(({ key, label, icon: Icon }) => (
                  <CollapsibleSection key={key} sectionKey={key} label={label} Icon={Icon} />
                ))}

              {bottomMainItems.map((item) => {
                const isActive = location.startsWith(item.url);
                const title = item.label ?? (item.titleKey ? t[item.titleKey] as string : "");
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={title} className="font-medium">
                      <Link href={item.url} className="flex items-center gap-3">
                        <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-sidebar-foreground/70"}`} />
                        <span>{title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <NavGroup items={secretaryNav} labelKey={t.secretaryArea} />
        <NavGroup items={fitnessNav}   labelKey={t.fitnessSection} />
        <NavGroup items={adminNav}     labelKey={t.adminSection} />
        <NavGroup items={parentNav}    labelKey="Area Genitori" />
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border bg-sidebar-accent/30 space-y-3">
        <div className="flex items-center gap-3 px-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate text-sidebar-foreground">{club?.name}</p>
            <p className="text-xs text-sidebar-foreground/60 capitalize truncate">{role?.replace(/_/g, " ")} {t.account}</p>
          </div>
        </div>
        <div className="px-2">
          <LanguageToggle />
        </div>
        <div className="px-2">
          <a
            href={`${import.meta.env.BASE_URL}platform-login`}
            className="text-[10px] text-sidebar-foreground/30 hover:text-sidebar-foreground/60 transition-colors cursor-pointer select-none tracking-widest"
            title="Platform Owner Portal"
          >
            · · ·
          </a>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
