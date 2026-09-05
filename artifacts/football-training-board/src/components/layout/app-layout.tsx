import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGetMyClub } from "@workspace/api-client-react";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, LogOut, Bell, BellRing, CheckCheck, ExternalLink } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useLocation } from "wouter";
import { withApi } from "@/lib/api-base";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  admin:              "Amministratore",
  presidente:         "Presidente",
  director:           "Dir. Sportivo/Generale",
  secretary:          "Segreteria",
  technical_director: "Dir. Tecnico",
  coach:              "Allenatore",
  fitness_coach:      "Prep. Atletico",
  athletic_director:  "Dir. Atletico",
  parent:             "Genitore",
  superadmin:         "Super Admin",
};

const MOBILE_BREAKPOINT = 768;
const NOTIFICATION_POLL_MS = 30000;

type LayoutNotification = {
  id: number;
  title: string;
  message?: string | null;
  type?: string | null;
  createdAt?: string | null;
  sentAt?: string | null;
  isRead?: boolean;
  isTrashed?: boolean;
  source: "internal" | "platform";
};

function getWorkspaceAreaLabel(path: string): string | null {
  if (path.startsWith("/scuola-calcio")) return "Scuola Calcio";
  if (path.startsWith("/settore-giovanile")) return "Settore Giovanile";
  if (path.startsWith("/prima-squadra")) return "Prima Squadra";
  return null;
}

function notificationKey(notification: Pick<LayoutNotification, "id" | "source">) {
  return `${notification.source}:${notification.id}`;
}

function notificationTimestamp(notification: LayoutNotification) {
  const raw = notification.createdAt ?? notification.sentAt ?? "";
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

function shortNotificationText(value?: string | null) {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  return clean.length > 120 ? `${clean.slice(0, 117)}...` : clean;
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, club, role, logout } = useAuth();
  const { toast } = useToast();
  const { data: liveClub } = useGetMyClub();
  const activeClub = liveClub ?? club;
  const [location, setLocation] = useLocation();
  const isTacticalBoardRoute = location.startsWith("/tactical-board");
  const showBackButton = location !== "/dashboard" && !location.startsWith("/workspace");
  const workspaceAreaLabel = getWorkspaceAreaLabel(location);
  const [hideTacticalHeader, setHideTacticalHeader] = useState(false);
  const clubLogoUrl = String((activeClub as { logoUrl?: string | null } | null)?.logoUrl ?? "");
  const backgroundLogoEnabled = Number((activeClub as { backgroundLogoEnabled?: number | null } | null)?.backgroundLogoEnabled ?? 1) !== 0;
  const backgroundLogoMode = String((activeClub as { backgroundLogoMode?: string | null } | null)?.backgroundLogoMode ?? "large");
  const backgroundLogoOpacity = Math.max(0, Math.min(30, Number((activeClub as { backgroundLogoOpacity?: number | null } | null)?.backgroundLogoOpacity ?? 8))) / 100;
  const [unreadNotifications, setUnreadNotifications] = useState<LayoutNotification[]>([]);
  const seenNotificationKeysRef = useRef<Set<string> | null>(null);
  const canWatchClubNotifications = !!user?.id && !!activeClub?.id && role !== "parent" && role !== "superadmin";

  const defaultSidebarOpen = typeof window !== "undefined"
    ? window.innerWidth >= MOBILE_BREAKPOINT
    : true;

  const unreadNotificationCount = unreadNotifications.length;
  const newestUnreadNotification = useMemo(
    () => [...unreadNotifications].sort((a, b) => notificationTimestamp(b) - notificationTimestamp(a))[0] ?? null,
    [unreadNotifications],
  );

  const fetchLayoutNotifications = useCallback(async () => {
    if (!canWatchClubNotifications) {
      setUnreadNotifications([]);
      seenNotificationKeysRef.current = null;
      return;
    }

    try {
      const [internalRes, platformRes] = await Promise.all([
        fetch(withApi("/api/club/notifications"), { credentials: "include" }),
        fetch(withApi("/api/club/platform-announcements"), { credentials: "include" }),
      ]);

      const internal: LayoutNotification[] = internalRes.ok
        ? (await internalRes.json()).map((n: any) => ({
            id: Number(n.id),
            title: String(n.title ?? "Nuova comunicazione"),
            message: n.message ?? null,
            type: n.type ?? null,
            createdAt: n.createdAt ?? null,
            isRead: Boolean(n.isRead),
            isTrashed: Boolean(n.isTrashed),
            source: "internal" as const,
          }))
        : [];

      const platform: LayoutNotification[] = platformRes.ok
        ? (await platformRes.json()).map((n: any) => ({
            id: Number(n.id),
            title: String(n.title ?? "Nuova comunicazione"),
            message: n.message ?? null,
            type: n.type ?? null,
            createdAt: n.sentAt ?? n.createdAt ?? null,
            sentAt: n.sentAt ?? null,
            isRead: Boolean(n.isRead),
            isTrashed: false,
            source: "platform" as const,
          }))
        : [];

      const current = [...platform, ...internal]
        .filter((n) => Number.isFinite(n.id) && !n.isRead && !n.isTrashed)
        .sort((a, b) => notificationTimestamp(b) - notificationTimestamp(a));
      const currentKeys = new Set(current.map(notificationKey));
      const seenKeys = seenNotificationKeysRef.current;
      setUnreadNotifications(current);

      if (!seenKeys) {
        seenNotificationKeysRef.current = currentKeys;
        return;
      }

      const fresh = current.filter((notification) => !seenKeys.has(notificationKey(notification)));
      seenNotificationKeysRef.current = currentKeys;
      if (fresh.length === 0) return;

      const latest = fresh[0];
      toast({
        title: fresh.length === 1 ? "Nuova comunicazione" : `${fresh.length} nuove comunicazioni`,
        description: `${latest.title}${latest.message ? ` - ${shortNotificationText(latest.message)}` : ""}`,
      });
    } catch (error) {
      if (import.meta.env.DEV) console.error("[layout] notifications watch failed", error);
    }
  }, [canWatchClubNotifications, toast]);

  const markLayoutNotificationRead = useCallback(async (notification: LayoutNotification) => {
    const key = notificationKey(notification);
    setUnreadNotifications((current) => current.filter((item) => notificationKey(item) !== key));

    const endpoint = notification.source === "platform"
      ? `/api/club/platform-announcements/${notification.id}/read`
      : `/api/club/notifications/${notification.id}/read`;

    try {
      const response = await fetch(withApi(endpoint), {
        method: "PATCH",
        credentials: "include",
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (import.meta.env.DEV) console.error("[layout] mark notification read failed", error);
      toast({
        title: "Comunicazione non aggiornata",
        description: "Riapro l'elenco aggiornato tra un momento.",
        variant: "destructive",
      });
      void fetchLayoutNotifications();
    }
  }, [fetchLayoutNotifications, toast]);

  const markAllLayoutNotificationsRead = useCallback(async () => {
    const current = unreadNotifications;
    if (current.length === 0) return;

    setUnreadNotifications([]);

    try {
      const results = await Promise.all(current.map((notification) => {
        const endpoint = notification.source === "platform"
          ? `/api/club/platform-announcements/${notification.id}/read`
          : `/api/club/notifications/${notification.id}/read`;
        return fetch(withApi(endpoint), {
          method: "PATCH",
          credentials: "include",
        });
      }));

      if (results.some((response) => !response.ok)) throw new Error("Some notifications were not updated");
    } catch (error) {
      if (import.meta.env.DEV) console.error("[layout] mark all notifications read failed", error);
      toast({
        title: "Alcune comunicazioni non sono state aggiornate",
        description: "Ricarico lo stato reale delle notifiche.",
        variant: "destructive",
      });
      void fetchLayoutNotifications();
    }
  }, [fetchLayoutNotifications, toast, unreadNotifications]);

  useEffect(() => {
    void fetchLayoutNotifications();
    if (!canWatchClubNotifications) return;
    const interval = window.setInterval(() => {
      void fetchLayoutNotifications();
    }, NOTIFICATION_POLL_MS);
    return () => window.clearInterval(interval);
  }, [canWatchClubNotifications, fetchLayoutNotifications]);

  const style = {
    "--sidebar-width": "18rem",
    "--sidebar-width-icon": "4rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen} style={style}>
      <div className="flex h-dvh min-h-svh w-full overflow-hidden bg-muted/30">
        <AppSidebar />
        <div className="mobile-contain-x flex flex-col flex-1 min-w-0 overflow-hidden">
          <header
            className={`mobile-safe-header flex shrink-0 items-center justify-between overflow-hidden px-4 pb-0 sm:px-6 sm:pt-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 transition-all duration-200 ${
              isTacticalBoardRoute && hideTacticalHeader
                ? "h-0 border-b-0 opacity-0 pointer-events-none"
                : "h-[calc(4rem+max(env(safe-area-inset-top),2.25rem))] border-b opacity-100 sm:h-16"
            }`}
          >
            <div className="flex items-center gap-3">
              <SidebarTrigger data-testid="button-sidebar-toggle" className="shrink-0" />
              {showBackButton && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  title="Indietro"
                  onClick={() => {
                    if (window.history.length > 1) window.history.back();
                    else setLocation("/dashboard");
                  }}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <div className="hidden sm:flex items-center gap-2">
                {clubLogoUrl && (
                  <img
                    src={clubLogoUrl}
                    alt={activeClub?.name || "Logo societa"}
                    className="h-8 w-8 rounded-md object-contain bg-white/80 p-0.5 ring-1 ring-border"
                  />
                )}
                <h1 className="font-display font-semibold text-base sm:text-lg truncate">
                  {activeClub?.name || "Football Training Board"}
                </h1>
                {role && ROLE_LABELS[role] && (
                  <Badge variant="secondary" className="text-xs font-medium shrink-0">
                    {ROLE_LABELS[role]}
                  </Badge>
                )}
                {workspaceAreaLabel && (
                  <Badge variant="outline" className="text-xs font-medium shrink-0">
                    {workspaceAreaLabel}
                  </Badge>
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-1 sm:hidden">
                {role && ROLE_LABELS[role] && (
                  <Badge variant="secondary" className="w-fit max-w-[42vw] truncate text-[10px] font-medium">
                    {ROLE_LABELS[role]}
                  </Badge>
                )}
                {workspaceAreaLabel && (
                  <Badge variant="outline" className="w-fit max-w-[42vw] truncate text-[10px] font-medium">
                    {workspaceAreaLabel}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                      "relative shrink-0",
                      unreadNotificationCount > 0 ? "text-amber-600 hover:text-amber-700" : "text-muted-foreground hover:text-foreground",
                    )}
                    title={
                      newestUnreadNotification
                        ? `Nuova comunicazione: ${newestUnreadNotification.title}`
                        : "Comunicazioni"
                    }
                  >
                    {unreadNotificationCount > 0 ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
                    {unreadNotificationCount > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background">
                        {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[min(92vw,24rem)] p-2">
                  <div className="flex items-center justify-between gap-3 px-2 py-1.5">
                    <DropdownMenuLabel className="p-0">Comunicazioni</DropdownMenuLabel>
                    <Badge variant={unreadNotificationCount > 0 ? "default" : "secondary"} className="shrink-0">
                      {unreadNotificationCount > 0 ? `${unreadNotificationCount} non lette` : "Tutto letto"}
                    </Badge>
                  </div>
                  <DropdownMenuSeparator />

                  {unreadNotificationCount === 0 ? (
                    <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                      Nessuna comunicazione non letta.
                    </div>
                  ) : (
                    <div className="max-h-[min(70vh,24rem)] space-y-1 overflow-y-auto pr-1">
                      {unreadNotifications.slice(0, 8).map((notification) => (
                        <DropdownMenuItem
                          key={notificationKey(notification)}
                          className="block cursor-pointer rounded-md border border-transparent p-3 focus:border-amber-200 focus:bg-amber-50"
                          onSelect={(event) => {
                            event.preventDefault();
                            void markLayoutNotificationRead(notification);
                            setLocation("/dashboard");
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">{notification.title}</p>
                              {notification.message && (
                                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                  {shortNotificationText(notification.message)}
                                </p>
                              )}
                            </div>
                            <Badge variant="outline" className="shrink-0 text-[10px]">
                              {notification.source === "platform" ? "Piattaforma" : "Societa"}
                            </Badge>
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  )}

                  <DropdownMenuSeparator />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <DropdownMenuItem
                      className="cursor-pointer justify-center rounded-md"
                      onSelect={() => setLocation("/dashboard")}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Apri schede
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer justify-center rounded-md"
                      disabled={unreadNotificationCount === 0}
                      onSelect={(event) => {
                        event.preventDefault();
                        void markAllLayoutNotificationsRead();
                      }}
                    >
                      <CheckCheck className="h-4 w-4" />
                      Segna lette
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex items-center gap-2 sm:gap-3 pl-3 sm:pl-4 border-l">
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-sm font-medium leading-none">{user?.firstName} {user?.lastName}</span>
                  <span className="text-xs text-muted-foreground capitalize">{user?.email}</span>
                </div>
                <Avatar className="h-8 w-8 sm:h-9 sm:w-9 border shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
                    {user?.firstName?.[0]}{user?.lastName?.[0]}
                  </AvatarFallback>
                </Avatar>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={logout}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </header>

          <main
            onScroll={
              isTacticalBoardRoute
                ? (event) => {
                    const scrollTop = event.currentTarget.scrollTop;
                    setHideTacticalHeader((hidden) => hidden ? scrollTop > 8 : scrollTop > 96);
                  }
                : undefined
            }
            className={isTacticalBoardRoute ? "relative flex-1 overflow-auto overscroll-contain" : "mobile-contain-x relative flex-1 overflow-auto overscroll-contain p-3 sm:p-6 lg:p-8"}
          >
            {clubLogoUrl && backgroundLogoEnabled && !isTacticalBoardRoute && (
              <div className="pointer-events-none sticky top-0 z-0 -mx-3 -mb-[100svh] h-[100svh] min-h-[100svh] overflow-hidden sm:-mx-6 lg:-mx-8">
                {backgroundLogoMode === "repeat" ? (
                  <div
                    className="absolute inset-0"
                    style={{
                      opacity: backgroundLogoOpacity,
                      backgroundImage: `url(${clubLogoUrl})`,
                      backgroundRepeat: "repeat",
                      backgroundSize: "clamp(150px, 16vw, 240px) clamp(150px, 16vw, 240px)",
                      backgroundPosition: "center",
                    }}
                  />
                ) : (
                  <img
                    src={clubLogoUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute left-1/2 top-1/2 h-[min(112svh,1180px)] min-h-[min(760px,92svh)] w-auto max-w-none -translate-x-1/2 -translate-y-1/2 object-contain"
                    style={{ opacity: backgroundLogoOpacity }}
                  />
                )}
              </div>
            )}
            <div
              className={
                isTacticalBoardRoute ? "relative z-10 w-full min-w-0" : "mobile-contain-x relative z-10 mx-auto w-full min-w-0 max-w-7xl"
              }
            >
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
