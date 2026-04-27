import { ReactNode } from "react";
import { Redirect } from "wouter";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function ProtectedRoute({ children, allowedRoles }: { children: ReactNode; allowedRoles?: string[] }) {
  const { user, role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-[40vh] w-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login-club" />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const currentRole = role ?? "";
    if (!allowedRoles.includes(currentRole)) {
      return <Redirect to="/dashboard" />;
    }
  }

  return <>{children}</>;
}