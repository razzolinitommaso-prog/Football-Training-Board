import { createContext, useContext, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetCurrentUser, 
  useLoginUser, 
  useLogoutUser, 
  useRegisterUser,
  getGetCurrentUserQueryKey,
  getCurrentUser,
} from "@workspace/api-client-react";
import type { LoginRequest, RegisterRequest, AuthResponse } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface AuthContextType {
  user: AuthResponse["user"] | null;
  club: AuthResponse["club"] | null;
  role: string | null;
  section: string | null;
  isLoading: boolean;
  login: (data: LoginRequest) => void;
  register: (data: RegisterRequest) => void;
  logout: () => void;
  isLoggingIn: boolean;
  isRegistering: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: authData, isLoading } = useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      retry: (_count, err) => {
        const status =
          err && typeof err === "object" && "status" in err
            ? (err as { status: number }).status
            : 0;
        if (status === 401 || status === 403) return false;
        return _count < 2;
      },
    },
  });

  const loginMutation = useLoginUser({
    mutation: {
      onSuccess: async (_resp, variables) => {
        try {
          const verified = await queryClient.fetchQuery({
            queryKey: getGetCurrentUserQueryKey(),
            queryFn: () => getCurrentUser(),
          });
          if (!verified?.user) {
            queryClient.setQueryData(getGetCurrentUserQueryKey(), null);
            toast({
              title: "Accesso negato",
              description: "Sessione non valida dopo il login.",
              variant: "destructive",
            });
            return;
          }

          queryClient.setQueryData(getGetCurrentUserQueryKey(), verified);
          void queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
          void queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
          void queryClient.invalidateQueries({ queryKey: ["/api/players"] });
          void queryClient.invalidateQueries({ queryKey: ["/api/training-sessions"] });
          const clubName = verified.club?.name ?? "";
          if (clubName) {
            localStorage.setItem("ftb-workspace-slug", encodeURIComponent(clubName));
          }
          toast({ title: "Welcome back!", description: "Successfully logged in." });

          const requestedSection =
            variables &&
            typeof variables === "object" &&
            "data" in variables &&
            variables.data &&
            typeof variables.data === "object" &&
            "section" in variables.data
              ? String((variables.data as { section?: string }).section ?? "").trim()
              : "";
          const savedClub = localStorage.getItem("ftb-login-club");

          if (savedClub && requestedSection) {
            localStorage.setItem("ftb-login-section", requestedSection);
            const dest = (localStorage.getItem("ftb-post-login-dest") ?? "").trim();
            localStorage.removeItem("ftb-post-login-dest");
            if (dest === "dashboard") {
              setLocation("/dashboard");
            } else {
              setLocation(`/workspace/${savedClub}/${requestedSection}`);
            }
          } else {
            localStorage.removeItem("ftb-login-club");
            localStorage.removeItem("ftb-login-section");
            setLocation("/dashboard");
          }
        } catch {
          queryClient.setQueryData(getGetCurrentUserQueryKey(), null);
          toast({
            title: "Accesso negato",
            description:
              "Impossibile confermare la sessione (cookie). Usa lo stesso host per browser e dev server (es. solo localhost o solo 127.0.0.1) e verifica il proxy Vite su /api.",
            variant: "destructive",
          });
        }
      },
      onError: (error) => {
        const fromBody =
          error.data &&
          typeof error.data === "object" &&
          error.data !== null &&
          "error" in error.data
            ? String((error.data as { error: unknown }).error)
            : "";
        const errMsg =
          error.status === 403
            ? (fromBody || "Accesso negato per mancanza di permessi nell'area selezionata.")
            : (fromBody || error.message || "Credenziali non valide.");
        if (error.status === 403) {
          localStorage.removeItem("ftb-login-section");
          localStorage.removeItem("ftb-post-login-dest");
        }
        toast({ 
          title: "Accesso negato", 
          description: errMsg, 
          variant: "destructive" 
        });
      }
    }
  });

  const registerMutation = useRegisterUser({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), data);
        const code = (data as any).clubAccessCode;
        const clubName = data?.club?.name ?? "";
        if (clubName) {
          localStorage.setItem("ftb-workspace-slug", encodeURIComponent(clubName));
        }
        toast({
          title: "Club registrato!",
          description: code ? `Codice accesso club: ${code} — conservalo e condividilo con il tuo staff.` : "Benvenuto in FTB.",
          duration: 12000,
        });
        setLocation("/dashboard");
      },
      onError: (error) => {
        toast({ 
          title: "Registration failed", 
          description: error.data?.error || "Could not create account", 
          variant: "destructive" 
        });
      }
    }
  });

  const logoutMutation = useLogoutUser({
    mutation: {
      onSuccess: () => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), null);
        queryClient.clear();
        localStorage.removeItem("ftb-login-section");
        const savedSlug = localStorage.getItem("ftb-workspace-slug");
        setLocation(savedSlug ? `/workspace/${savedSlug}` : "/login-club");
      },
      onError: () => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), null);
        queryClient.clear();
        localStorage.removeItem("ftb-login-section");
        const savedSlug = localStorage.getItem("ftb-workspace-slug");
        setLocation(savedSlug ? `/workspace/${savedSlug}` : "/login-club");
      },
    }
  });

  return (
    <AuthContext.Provider
      value={{
        user: authData?.user || null,
        club: authData?.club || null,
        role: authData?.role || null,
        section: (authData as any)?.section || null,
        isLoading,
        login: (data) => {
          if (!data.section) {
            localStorage.removeItem("ftb-login-club");
            localStorage.removeItem("ftb-login-section");
            localStorage.removeItem("ftb-post-login-dest");
          }
          loginMutation.mutate({
            data: { ...data, email: data.email.trim().toLowerCase() },
          });
        },
        register: (data) => registerMutation.mutate({ data }),
        logout: () => logoutMutation.mutate(),
        isLoggingIn: loginMutation.isPending,
        isRegistering: registerMutation.isPending,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
