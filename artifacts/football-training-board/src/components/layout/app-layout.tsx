import { ReactNode, useState } from "react";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, Bell } from "lucide-react";
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
  const [location] = useLocation();
  const isTacticalBoardRoute = location.startsWith("/tactical-board");
  const [hideTacticalHeader, setHideTacticalHeader] = useState(false);

  const defaultSidebarOpen = typeof window !== "undefined"
    ? window.innerWidth >= MOBILE_BREAKPOINT
    : true;

  const style = {
    "--sidebar-width": "18rem",
    "--sidebar-width-icon": "4rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen} style={style}>
      <div className="flex h-screen w-full bg-muted/30">
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
              <div className="hidden sm:flex items-center gap-2">
                <h1 className="font-display font-semibold text-base sm:text-lg truncate">
                  {club?.name || "Football Training Board"}
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
            className={isTacticalBoardRoute ? "flex-1 overflow-auto relative" : "flex-1 overflow-auto p-4 sm:p-6 lg:p-8 relative"}
          >
            <div className={isTacticalBoardRoute ? "w-full" : "mx-auto max-w-7xl"}>
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
