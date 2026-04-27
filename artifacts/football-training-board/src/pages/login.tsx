import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/hooks/use-auth";
import { Link, Redirect, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Loader2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { LanguageToggle } from "@/components/language-toggle";
import { useEffect, useState } from "react";

export default function Login() {
  const { login, isLoggingIn, user } = useAuth();
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);

  const loginSchema = z.object({
    email: z.string().email(t.invalidEmail),
    password: z.string().min(1, t.passwordRequired),
  });

  type LoginForm = z.infer<typeof loginSchema>;

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const searchParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : "",
  );
  const clubParam = (searchParams.get("club") ?? "").trim();
  const sectionParam = (searchParams.get("section") ?? "").trim();
  const isDirectCredentialsLogin =
    searchParams.get("direct") === "1" || searchParams.get("credentials") === "1";

  useEffect(() => {
    if (clubParam) localStorage.setItem("ftb-login-club", clubParam);
    if (sectionParam) {
      localStorage.setItem("ftb-login-section", sectionParam);
      localStorage.setItem("ftb-post-login-dest", "dashboard");
    }
  }, [clubParam, sectionParam]);

  if (user) {
    return <Redirect to="/dashboard" />;
  }

  // Senza ?direct=1, /login serve al flusso aree (?club=&section=). Chi ha già le credenziali usa /login?direct=1 (il backend risolve il club dall’utente).
  if (!isDirectCredentialsLogin) {
    if (!clubParam && !sectionParam) {
      return <Redirect to="/login-club" />;
    }
    if (clubParam && !sectionParam) {
      return <Redirect to={`/workspace/${encodeURIComponent(clubParam)}`} />;
    }
    if (!clubParam && sectionParam) {
      return <Redirect to="/login-club" />;
    }
  }

  function goBack() {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("direct") === "1" || sp.get("credentials") === "1") {
      setLocation("/login-club");
      return;
    }
    const section = (sp.get("section") ?? "").trim();
    const clubFromQuery = (sp.get("club") ?? "").trim();
    const clubFromStore = localStorage.getItem("ftb-workspace-slug") || "";
    if (section && clubFromQuery) {
      setLocation(`/workspace/${encodeURIComponent(clubFromQuery)}/${section}`);
      return;
    }
    if (section && clubFromStore) {
      setLocation(`/workspace/${clubFromStore}/${section}`);
      return;
    }
    if (clubFromQuery) {
      setLocation(`/workspace/${encodeURIComponent(clubFromQuery)}`);
      return;
    }
    if (clubFromStore) {
      setLocation(`/workspace/${clubFromStore}`);
      return;
    }
    setLocation("/login-club");
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
          alt="Stadium Background"
          className="w-full h-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      <div className="absolute top-4 right-4 z-20">
        <LanguageToggle />
      </div>
      <button
        type="button"
        onClick={goBack}
        className="absolute top-4 left-4 z-20 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Indietro
      </button>

      <Card className="w-full max-w-md z-10 border-border/50 shadow-2xl backdrop-blur-sm bg-card/95">
        <CardHeader className="space-y-2 text-center pb-6">
          <div className="mx-auto w-12 h-12 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-primary-foreground"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <CardTitle className="text-3xl font-display font-bold tracking-tight">{t.welcomeBack}</CardTitle>
          <CardDescription className="text-base">{t.signInDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit((data) => {
              const searchParams = new URLSearchParams(window.location.search);
              const section = (searchParams.get("section") ?? "").trim() || undefined;
              const club = (searchParams.get("club") ?? "").trim();
              if (section && club) {
                localStorage.setItem("ftb-login-club", club);
                localStorage.setItem("ftb-login-section", section);
                localStorage.setItem("ftb-post-login-dest", "dashboard");
              }
              login({ ...data, section });
            })}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="email">{t.email}</Label>
              <Input
                id="email"
                type="email"
                placeholder="coach@club.com"
                className="h-11"
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t.password}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="h-11 pr-10"
                  {...form.register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full h-11 text-base font-semibold mt-2" disabled={isLoggingIn}>
              {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
              {isLoggingIn ? t.signingIn : t.signIn}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center border-t border-border/50 pt-6">
          <p className="text-sm text-muted-foreground">
            {t.noAccount}{" "}
            <Link href="/register" className="font-semibold text-primary hover:underline">
              {t.registerClub}
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
