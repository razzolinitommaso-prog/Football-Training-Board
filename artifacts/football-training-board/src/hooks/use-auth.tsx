import { createContext, useContext, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetCurrentUser, 
  useLoginUser, 
  useLogoutUser, 
  useRegisterUser,
  getGetCurrentUserQueryKey
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
      retry: false,
      refetchOnWindowFocus: false,
    }
  });

  const loginMutation = useLoginUser({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), data);
        const clubName = data?.club?.name ?? "";
        if (clubName) {
          localStorage.setItem("ftb-workspace-slug", encodeURIComponent(clubName));
        }
        toast({ title: "Welcome back!", description: "Successfully logged in." });
        setLocation("/dashboard");
      },
      onError: (error) => {
        const errMsg = error.data?.error || "Invalid credentials";
        if (error.status === 403) {
          localStorage.removeItem("ftb-login-section");
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
        login: (data) => loginMutation.mutate({ data }),
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
