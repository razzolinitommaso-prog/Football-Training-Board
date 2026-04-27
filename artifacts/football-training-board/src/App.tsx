import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { AuthProvider } from "@/hooks/use-auth";
import { LanguageProvider } from "@/lib/i18n";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/app-layout";

import Login from "@/pages/login";
import Register from "@/pages/register";
import PlatformLoginPage from "@/pages/platform-login/index";
import PlatformAdminPage from "@/pages/platform-admin/index";
import LandingPage from "@/pages/landing/index";
import LoginClubPage from "@/pages/login-club/index";
import WorkspacePage from "@/pages/workspace/index";
import WorkspaceSectionAreasPage from "@/pages/workspace/section-areas";
import { CoachLoginPage, SecretaryLoginPage, TechnicalLoginPage, DirectorLoginPage, AdminLoginPage, ParentLoginPage, FitnessLoginPage } from "@/pages/area-login/index";
import ParentDashboard from "@/pages/parent/index";
import ParentChildren from "@/pages/parent/children";
import ParentTeamInfo from "@/pages/parent/team";
import ParentCommunications from "@/pages/parent/communications";
import ParentMatches from "@/pages/parent/matches";
import ParentDocuments from "@/pages/parent/documents";
import ParentPayments from "@/pages/parent/payments";
import ParentNotifications from "@/pages/parent/notifications";
import ParentAdminManagement from "@/pages/parent/admin-management";
import Dashboard from "@/pages/dashboard";
import TeamsList from "@/pages/teams/index";
import TeamDetail from "@/pages/teams/detail";
import PlayersList from "@/pages/players/index";
import TrainingList from "@/pages/training/index";
import ClubSettings from "@/pages/club/index";
import MembersList from "@/pages/members/index";
import TacticalBoard from "@/pages/tactical-board/index";
import FitnessDashboard from "@/pages/fitness-dashboard/index";
import FitnessPrograms from "@/pages/fitness-programs/index";
import PlayerPerformance from "@/pages/player-performance/index";
import SeasonsPage from "@/pages/seasons/index";
import MatchesPage from "@/pages/matches/index";
import AttendancePage from "@/pages/attendance/index";
import ExercisesPage from "@/pages/exercises/index";
import RegistrationsPage from "@/pages/secretary/registrations";
import PaymentsPage from "@/pages/secretary/payments";
import DocumentsPage from "@/pages/secretary/documents";
import EquipmentPage from "@/pages/secretary/equipment";
import SecretaryParentApp from "@/pages/secretary/parent-app";
import BillingPage from "@/pages/billing/index";
import CredentialsPage from "@/pages/club/credentials";
import PlatformNotificationsPage from "@/pages/club/platform-notifications";
import SettoreGiovanilePage from "@/pages/settore-giovanile/index";
import PrimaSquadraPage from "@/pages/prima-squadra/index";
import SectionCalendar from "@/pages/calendar/SectionCalendar";
import SeasonTransitionPage from "@/pages/season-transition/index";
import TeamCalendar from "@/pages/calendari/TeamCalendar";
import SectionMatchCalendars from "@/pages/matches/SectionMatchCalendars";

const queryClient = new QueryClient();

const coachingRoles = ["admin", "coach", "technical_director", "director"];
const secretaryRoles = ["admin", "secretary"];
const fitnessRoles = ["admin", "director", "technical_director", "fitness_coach", "athletic_director"];
const playerPerformanceRoles = ["admin", "presidente", "director", "technical_director", "fitness_coach", "athletic_director"];

function ProtectedAppRoutes() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/dashboard">
          <ProtectedRoute><Dashboard /></ProtectedRoute>
        </Route>
        <Route path="/teams">
          <ProtectedRoute><TeamsList /></ProtectedRoute>
        </Route>
        <Route path="/teams/:id">
          <ProtectedRoute><TeamDetail /></ProtectedRoute>
        </Route>
        <Route path="/players">
          <ProtectedRoute><PlayersList /></ProtectedRoute>
        </Route>
        <Route path="/training">
          <ProtectedRoute><TrainingList /></ProtectedRoute>
        </Route>
        <Route path="/club">
          <ProtectedRoute allowedRoles={["admin"]}><ClubSettings /></ProtectedRoute>
        </Route>
        <Route path="/members">
          <ProtectedRoute allowedRoles={["admin"]}><MembersList /></ProtectedRoute>
        </Route>
        <Route path="/tactical-board" component={TacticalBoard} />
  
        <Route path="/fitness-dashboard">
          <ProtectedRoute allowedRoles={fitnessRoles}><FitnessDashboard /></ProtectedRoute>
        </Route>
        <Route path="/fitness-programs">
          <ProtectedRoute allowedRoles={fitnessRoles}><FitnessPrograms /></ProtectedRoute>
        </Route>
        <Route path="/player-performance">
          <ProtectedRoute allowedRoles={playerPerformanceRoles}><PlayerPerformance /></ProtectedRoute>
        </Route>
        <Route path="/seasons">
          <ProtectedRoute allowedRoles={["admin", "director", "technical_director"]}><SeasonsPage /></ProtectedRoute>
        </Route>
        <Route path="/scuola-calcio/seasons">
          <ProtectedRoute allowedRoles={["admin", "director", "technical_director"]}><SeasonsPage /></ProtectedRoute>
        </Route>
        <Route path="/settore-giovanile/seasons">
          <ProtectedRoute allowedRoles={["admin", "director", "technical_director"]}><SeasonsPage /></ProtectedRoute>
        </Route>
        <Route path="/prima-squadra/seasons">
          <ProtectedRoute allowedRoles={["admin", "director", "technical_director"]}><SeasonsPage /></ProtectedRoute>
        </Route>
        <Route path="/matches">
          <ProtectedRoute allowedRoles={coachingRoles}><MatchesPage /></ProtectedRoute>
        </Route>
        <Route path="/attendance">
          <ProtectedRoute allowedRoles={coachingRoles}><AttendancePage /></ProtectedRoute>
        </Route>
        <Route path="/exercises">
          <ProtectedRoute allowedRoles={coachingRoles}><ExercisesPage /></ProtectedRoute>
        </Route>
        <Route path="/secretary/registrations">
          <ProtectedRoute allowedRoles={secretaryRoles}><RegistrationsPage /></ProtectedRoute>
        </Route>
        <Route path="/secretary/payments">
          <ProtectedRoute allowedRoles={secretaryRoles}><PaymentsPage /></ProtectedRoute>
        </Route>
        <Route path="/secretary/documents">
          <ProtectedRoute allowedRoles={secretaryRoles}><DocumentsPage /></ProtectedRoute>
        </Route>
        <Route path="/secretary/equipment">
          <ProtectedRoute allowedRoles={secretaryRoles}><EquipmentPage /></ProtectedRoute>
        </Route>
        <Route path="/secretary/parent-app">
          <ProtectedRoute allowedRoles={["admin", "secretary"]}><SecretaryParentApp /></ProtectedRoute>
        </Route>
        <Route path="/billing">
          <ProtectedRoute allowedRoles={["admin"]}><BillingPage /></ProtectedRoute>
        </Route>
        <Route path="/calendari/:teamId">
          <ProtectedRoute allowedRoles={["admin", "director", "secretary", "coach", "fitness_coach", "athletic_director", "technical_director"]}><TeamCalendar /></ProtectedRoute>
        </Route>
        <Route path="/club/credentials">
          <ProtectedRoute allowedRoles={["admin", "secretary", "director"]}><CredentialsPage /></ProtectedRoute>
        </Route>
        <Route path="/club/platform-notifications">
          <ProtectedRoute allowedRoles={["admin", "secretary", "director", "technical_director", "coach", "fitness_coach", "athletic_director"]}><PlatformNotificationsPage /></ProtectedRoute>
        </Route>
        <Route path="/parent-dashboard">
          <ProtectedRoute allowedRoles={["parent"]}><ParentDashboard /></ProtectedRoute>
        </Route>
        <Route path="/parent/children">
          <ProtectedRoute allowedRoles={["parent"]}><ParentChildren /></ProtectedRoute>
        </Route>
        <Route path="/parent/team/:teamId">
          <ProtectedRoute allowedRoles={["parent"]}><ParentTeamInfo /></ProtectedRoute>
        </Route>
        <Route path="/parent/communications">
          <ProtectedRoute allowedRoles={["parent"]}><ParentCommunications /></ProtectedRoute>
        </Route>
        <Route path="/parent/matches">
          <ProtectedRoute allowedRoles={["parent"]}><ParentMatches /></ProtectedRoute>
        </Route>
        <Route path="/parent/documents">
          <ProtectedRoute allowedRoles={["parent"]}><ParentDocuments /></ProtectedRoute>
        </Route>
        <Route path="/parent/payments">
          <ProtectedRoute allowedRoles={["parent"]}><ParentPayments /></ProtectedRoute>
        </Route>
        <Route path="/parent/notifications">
          <ProtectedRoute allowedRoles={["parent"]}><ParentNotifications /></ProtectedRoute>
        </Route>
        <Route path="/admin/parents">
          <ProtectedRoute allowedRoles={["admin"]}><ParentAdminManagement /></ProtectedRoute>
        </Route>
        <Route path="/scuola-calcio/calendar">
          <ProtectedRoute allowedRoles={["admin", "secretary", "director", "technical_director"]}>
            <SectionCalendar section="scuola_calcio" />
          </ProtectedRoute>
        </Route>
        <Route path="/scuola-calcio/teams">
          <ProtectedRoute><TeamsList key="scuola_calcio" section="scuola_calcio" /></ProtectedRoute>
        </Route>
        <Route path="/scuola-calcio/teams/:id">
          <ProtectedRoute><TeamDetail /></ProtectedRoute>
        </Route>
        <Route path="/scuola-calcio/players">
          <ProtectedRoute><PlayersList /></ProtectedRoute>
        </Route>
        <Route path="/scuola-calcio/training">
          <ProtectedRoute><TrainingList /></ProtectedRoute>
        </Route>
        <Route path="/scuola-calcio/matches">
          <ProtectedRoute allowedRoles={["admin", "director", "secretary", "coach", "fitness_coach", "athletic_director", "technical_director"]}>
            <SectionMatchCalendars section="scuola_calcio" />
          </ProtectedRoute>
        </Route>
        <Route path="/scuola-calcio/attendance">
          <ProtectedRoute allowedRoles={coachingRoles}><AttendancePage /></ProtectedRoute>
        </Route>
        <Route path="/settore-giovanile/calendar">
          <ProtectedRoute allowedRoles={["admin", "secretary", "director", "technical_director"]}>
            <SectionCalendar section="settore_giovanile" />
          </ProtectedRoute>
        </Route>
        <Route path="/settore-giovanile/teams">
          <ProtectedRoute><TeamsList key="settore_giovanile" section="settore_giovanile" /></ProtectedRoute>
        </Route>
        <Route path="/settore-giovanile/teams/:id">
          <ProtectedRoute><TeamDetail /></ProtectedRoute>
        </Route>
        <Route path="/settore-giovanile/players">
        <ProtectedRoute><PlayersList section="settore_giovanile" /></ProtectedRoute>
        </Route>
        <Route path="/settore-giovanile/training">
        <ProtectedRoute><TrainingList section="settore_giovanile" /></ProtectedRoute>
        </Route>
        <Route path="/settore-giovanile/matches">
          <ProtectedRoute allowedRoles={["admin", "director", "secretary", "coach", "fitness_coach", "athletic_director", "technical_director"]}>
            <SectionMatchCalendars section="settore_giovanile" />
          </ProtectedRoute>
        </Route>
        <Route path="/settore-giovanile/attendance">
          <ProtectedRoute allowedRoles={coachingRoles}><AttendancePage /></ProtectedRoute>
        </Route>
        <Route path="/settore-giovanile">
          <ProtectedRoute allowedRoles={["admin"]}><SettoreGiovanilePage /></ProtectedRoute>
        </Route>
        <Route path="/prima-squadra/calendar">
          <ProtectedRoute allowedRoles={["admin", "secretary", "director", "technical_director"]}>
            <SectionCalendar section="prima_squadra" />
          </ProtectedRoute>
        </Route>
        <Route path="/prima-squadra/teams">
          <ProtectedRoute><TeamsList key="prima_squadra" section="prima_squadra" /></ProtectedRoute>
        </Route>
        <Route path="/prima-squadra/teams/:id">
          <ProtectedRoute><TeamDetail /></ProtectedRoute>
        </Route>
        <Route path="/prima-squadra/players">
        <ProtectedRoute><PlayersList section="prima_squadra" /></ProtectedRoute>
        </Route>
        <Route path="/prima-squadra/training">
        <ProtectedRoute><TrainingList section="prima_squadra" /></ProtectedRoute>
        </Route>
        <Route path="/prima-squadra/matches">
          <ProtectedRoute allowedRoles={["admin", "director", "secretary", "coach", "fitness_coach", "athletic_director", "technical_director"]}>
            <SectionMatchCalendars section="prima_squadra" />
          </ProtectedRoute>
        </Route>
        <Route path="/prima-squadra/attendance">
          <ProtectedRoute allowedRoles={coachingRoles}><AttendancePage /></ProtectedRoute>
        </Route>
        <Route path="/prima-squadra">
          <ProtectedRoute allowedRoles={["admin"]}><PrimaSquadraPage /></ProtectedRoute>
        </Route>
        <Route path="/season-transition">
          <ProtectedRoute allowedRoles={["admin", "secretary", "director", "technical_director"]}>
            <SeasonTransitionPage />
          </ProtectedRoute>
        </Route>
        <Route path="/">
          <ProtectedRoute><Dashboard /></ProtectedRoute>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/login-club" component={LoginClubPage} />
      <Route path="/workspace/:clubSlug/:section" component={WorkspaceSectionAreasPage} />
      <Route path="/workspace/:clubSlug" component={WorkspacePage} />
      <Route path="/coach/login" component={CoachLoginPage} />
      <Route path="/secretary/login" component={SecretaryLoginPage} />
      <Route path="/technical/login" component={TechnicalLoginPage} />
      <Route path="/director/login" component={DirectorLoginPage} />
      <Route path="/admin/login" component={AdminLoginPage} />
      <Route path="/fitness/login" component={FitnessLoginPage} />
      <Route path="/parent/login" component={ParentLoginPage} />
      <Route path="/platform-login" component={PlatformLoginPage} />
      <Route path="/platform-admin" component={PlatformAdminPage} />
      <Route path="/*" component={ProtectedAppRoutes} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LanguageProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <Router />
            </AuthProvider>
          </WouterRouter>
          <Toaster />
        </LanguageProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
