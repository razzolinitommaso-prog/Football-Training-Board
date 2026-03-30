import { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children, allowedRoles }: { children: ReactNode, allowedRoles?: string[] }) {
  const { user, isLoading, role } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to={role === "parent" ? "/parent/login" : "/login"} />;
  }

  const effectiveRole = role === "presidente" ? "admin" : role;
  if (allowedRoles && effectiveRole && !allowedRoles.includes(effectiveRole)) {
    return <Redirect to={role === "parent" ? "/parent-dashboard" : "/dashboard"} />;
  }

  return <>{children}</>;
}
