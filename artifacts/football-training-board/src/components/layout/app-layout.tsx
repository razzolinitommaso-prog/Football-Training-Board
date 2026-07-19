import { ReactNode, useState } from "react";
import { useGetMyClub } from "@workspace/api-client-react";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, LogOut, Bell } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useLocation } from "wouter";

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

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, club, role, logout } = useAuth();
  const { data: liveClub } = useGetMyClub();
  const activeClub = liveClub ?? club;
  const [location, setLocation] = useLocation();
  const isTacticalBoardRoute = location.startsWith("/tactical-board");
  const showBackButton = location !== "/dashboard" && !location.startsWith("/workspace");
  const [hideTacticalHeader, setHideTacticalHeader] = useState(false);
  const clubLogoUrl = String((activeClub as { logoUrl?: string | null } | null)?.logoUrl ?? "");
  const backgroundLogoEnabled = Number((activeClub as { backgroundLogoEnabled?: number | null } | null)?.backgroundLogoEnabled ?? 1) !== 0;
  const backgroundLogoMode = String((activeClub as { backgroundLogoMode?: string | null } | null)?.backgroundLogoMode ?? "large");
  const backgroundLogoOpacity = Math.max(0, Math.min(30, Number((activeClub as { backgroundLogoOpacity?: number | null } | null)?.backgroundLogoOpacity ?? 8))) / 100;

  const defaultSidebarOpen = typeof window !== "undefined"
    ? window.innerWidth >= MOBILE_BREAKPOINT
    : true;

  const style = {
    "--sidebar-width": "18rem",
    "--sidebar-width-icon": "4rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen} style={style}>
      <div className="flex h-dvh min-h-svh w-full overflow-hidden bg-muted/30">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <header
            className={`flex shrink-0 items-center justify-between overflow-hidden px-4 sm:px-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 transition-all duration-200 ${
              isTacticalBoardRoute && hideTacticalHeader
                ? "h-0 border-b-0 opacity-0 pointer-events-none"
                : "h-16 border-b opacity-100"
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
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-foreground shrink-0">
                <Bell className="w-5 h-5" />
              </Button>

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
            className={isTacticalBoardRoute ? "relative flex-1 overflow-auto overscroll-contain" : "relative flex-1 overflow-auto overscroll-contain p-3 sm:p-6 lg:p-8"}
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
                isTacticalBoardRoute ? "relative z-10 w-full min-w-0" : "relative z-10 mx-auto w-full min-w-0 max-w-7xl"
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
