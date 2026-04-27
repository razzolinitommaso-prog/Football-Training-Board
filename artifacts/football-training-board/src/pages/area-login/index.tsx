import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/hooks/use-auth";
import { Link, Redirect } from "wouter";
import { Loader2, ArrowLeft, Eye, EyeOff, Shield, Target, FileText, BarChart3, Settings, Heart, Dumbbell } from "lucide-react";
import { useState } from "react";
import { withApi } from "@/lib/api-base";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type LoginForm = z.infer<typeof loginSchema>;

interface AreaConfig {
  role: string;
  label: string;
  description: string;
  Icon: React.FC<{ className?: string }>;
  accent: string;
  accentBg: string;
  accentBorder: string;
  accentGlow: string;
  gradientFrom: string;
}

const AREA_CONFIGS: Record<string, AreaConfig> = {
  coach: {
    role: "coach",
    label: "Coach Area",
    description: "Access training sessions, tactics and match management",
    Icon: Target,
    accent: "text-blue-400",
    accentBg: "bg-blue-500/10",
    accentBorder: "border-blue-500/20",
    accentGlow: "focus:ring-blue-500/20 focus:border-blue-500/50",
    gradientFrom: "from-blue-950/40",
  },
  secretary: {
    role: "secretary",
    label: "Secretary Area",
    description: "Manage registrations, payments and club documents",
    Icon: FileText,
    accent: "text-purple-400",
    accentBg: "bg-purple-500/10",
    accentBorder: "border-purple-500/20",
    accentGlow: "focus:ring-purple-500/20 focus:border-purple-500/50",
    gradientFrom: "from-purple-950/40",
  },
  technical: {
    role: "technical_director",
    label: "Technical Director Area",
    description: "Oversee training programs, exercises and team strategy",
    Icon: BarChart3,
    accent: "text-orange-400",
    accentBg: "bg-orange-500/10",
    accentBorder: "border-orange-500/20",
    accentGlow: "focus:ring-orange-500/20 focus:border-orange-500/50",
    gradientFrom: "from-orange-950/30",
  },
  director: {
    role: "director",
    label: "Area Direttore Generale",
    description: "Accedi a report, stagioni e panoramica delle performance del club",
    Icon: BarChart3,
    accent: "text-amber-400",
    accentBg: "bg-amber-500/10",
    accentBorder: "border-amber-500/20",
    accentGlow: "focus:ring-amber-500/20 focus:border-amber-500/50",
    gradientFrom: "from-amber-950/30",
  },
  admin: {
    role: "admin",
    label: "Area Presidente",
    description: "Accesso completo a tutte le funzionalità di gestione e impostazioni del club",
    Icon: Settings,
    accent: "text-emerald-400",
    accentBg: "bg-emerald-500/10",
    accentBorder: "border-emerald-500/20",
    accentGlow: "focus:ring-emerald-500/20 focus:border-emerald-500/50",
    gradientFrom: "from-emerald-950/30",
  },
  fitness: {
    role: "fitness_coach",
    label: "Area Preparatori",
    description: "Programmi fisici, performance e carichi di lavoro",
    Icon: Dumbbell,
    accent: "text-green-400",
    accentBg: "bg-green-500/10",
    accentBorder: "border-green-500/20",
    accentGlow: "focus:ring-green-500/20 focus:border-green-500/50",
    gradientFrom: "from-green-950/30",
  },
  parent: {
    role: "parent",
    label: "Area Genitori",
    description: "Monitora attività, allenamenti e pagamenti dei tuoi figli",
    Icon: Heart,
    accent: "text-pink-400",
    accentBg: "bg-pink-500/10",
    accentBorder: "border-pink-500/20",
    accentGlow: "focus:ring-pink-500/20 focus:border-pink-500/50",
    gradientFrom: "from-pink-950/30",
  },
};

interface AreaLoginProps {
  areaKey: keyof typeof AREA_CONFIGS;
}

const SECTION_LABELS: Record<string, string> = {
  "scuola-calcio": "Scuola Calcio",
  "settore-giovanile": "Settore Giovanile",
  "prima-squadra": "Prima Squadra",
};

export function AreaLoginPage({ areaKey }: AreaLoginProps) {
  const { user, isLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const config = AREA_CONFIGS[areaKey];

  const searchParams = new URLSearchParams(window.location.search);
  const loginSection = searchParams.get("section") ?? undefined;
  const loginClub = searchParams.get("club") ?? undefined;
  const loginArea = searchParams.get("area") ?? undefined;
  const sectionLabel = loginSection ? (SECTION_LABELS[loginSection] ?? loginSection) : undefined;

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#080d18] text-white flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-gray-400" aria-label="Caricamento sessione" />
      </div>
    );
  }

  if (user) {
    return <Redirect to="/dashboard" />;
  }

  async function onSubmit(data: LoginForm) {
    setSubmitError("");
    if (loginClub) {
      localStorage.setItem("ftb-login-club", loginClub);
    }
  
    if (loginSection) {
      localStorage.setItem("ftb-login-section", loginSection);
    }

    setSubmitting(true);
    try {
      const effectiveAreaKey = (loginArea || areaKey || "").trim();
      const res = await fetch(withApi(`/api/auth/login?area=${encodeURIComponent(effectiveAreaKey)}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: data.email.trim().toLowerCase(),
          password: data.password,
          section: loginSection,
        }),
      });
      const payload = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        setSubmitError(String(payload?.error || "Accesso negato"));
        setSubmitting(false);
        return;
      }

      // Frontend safety net: if backend didn't enforce area-role properly,
      // block here using the role returned by /auth/login.
      const roleFromResponse = String((payload as any)?.role ?? "").trim();
      const areaRoleMap: Record<string, string[]> = {
        admin: ["admin", "presidente"],
        director: ["director"],
        secretary: ["secretary"],
        technical: ["technical_director"],
        fitness: ["fitness_coach", "athletic_director"],
        coach: ["coach"],
        parent: ["parent"],
      };
      const allowedRoles = areaRoleMap[effectiveAreaKey];
      if (allowedRoles && roleFromResponse && !allowedRoles.includes(roleFromResponse)) {
        await fetch(withApi("/api/auth/logout"), { method: "POST", credentials: "include" }).catch(() => null);
        setSubmitError("Accesso negato per mancanza di permessi nell'area selezionata.");
        setSubmitting(false);
        return;
      }

      // Successful login: go to dashboard; AuthProvider will hydrate from /api/auth/me
      window.location.href = "/dashboard";
    } catch {
      setSubmitError("Errore di connessione. Riprova.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#080d18] text-white flex flex-col">
      <div className={`absolute inset-0 bg-gradient-to-br ${config.gradientFrom} via-[#080d18] to-[#080d18] pointer-events-none`} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] opacity-50 rounded-full blur-3xl pointer-events-none bg-white/3" />

      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Indietro
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm">FT Board</span>
        </div>
      </header>

      <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className={`w-16 h-16 rounded-2xl ${config.accentBg} border ${config.accentBorder} flex items-center justify-center mx-auto mb-6`}>
              <config.Icon className={`w-8 h-8 ${config.accent}`} />
            </div>
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${config.accentBg} border ${config.accentBorder} mb-2`}>
              <span className={`text-xs font-semibold uppercase tracking-wider ${config.accent}`}>{config.label}</span>
            </div>
            {sectionLabel && (
              <p className="text-gray-500 text-xs font-medium mt-1 mb-3">Sezione: <span className="text-gray-300 font-semibold">{sectionLabel}</span></p>
            )}
            <h1 className="text-3xl font-bold mb-2">Accedi</h1>
            <p className="text-gray-400 text-sm leading-relaxed">{config.description}</p>
          </div>

          <div className={`rounded-2xl border ${config.accentBorder} bg-white/3 p-8`}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Indirizzo email</label>
                <input
                  {...form.register("email")}
                  type="email"
                  placeholder="tua@email.com"
                  autoComplete="email"
                  className={`w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none ${config.accentGlow} focus:ring-2 transition-all text-sm`}
                />
                {form.formState.errors.email && (
                  <p className="mt-1.5 text-xs text-red-400">{form.formState.errors.email.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
                <div className="relative">
                  <input
                    {...form.register("password")}
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className={`w-full px-4 py-3 pr-12 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none ${config.accentGlow} focus:ring-2 transition-all text-sm`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {form.formState.errors.password && (
                  <p className="mt-1.5 text-xs text-red-400">{form.formState.errors.password.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className={`w-full flex items-center justify-center gap-2 px-6 py-3.5 ${config.accentBg} border ${config.accentBorder} ${config.accent} font-bold text-base rounded-xl transition-all hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Accesso in corso...</>
                ) : (
                  <>Accedi — {config.label}</>
                )}
              </button>
              {submitError && (
                <p className="text-sm text-red-400 text-center">{submitError}</p>
              )}
            </form>
          </div>

          <div className="mt-6 text-center space-y-3">
            <p className="text-sm text-gray-500">
              Area sbagliata?{" "}
              <button
                onClick={() => window.history.back()}
                className="text-gray-400 hover:text-white transition-colors underline underline-offset-2"
              >
                Torna al workspace
              </button>
            </p>
            <p className="text-sm text-gray-500">
              Hai bisogno di un account?{" "}
              <Link
                href="/register"
                className="text-emerald-400 hover:text-emerald-300 font-medium underline-offset-2 hover:underline"
              >
                Registra il tuo club
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CoachLoginPage() { return <AreaLoginPage areaKey="coach" />; }
export function SecretaryLoginPage() { return <AreaLoginPage areaKey="secretary" />; }
export function TechnicalLoginPage() { return <AreaLoginPage areaKey="technical" />; }
export function DirectorLoginPage() { return <AreaLoginPage areaKey="director" />; }
export function AdminLoginPage() { return <AreaLoginPage areaKey="admin" />; }
export function FitnessLoginPage() { return <AreaLoginPage areaKey="fitness" />; }
export function ParentLoginPage() {
  const { user, isLoading } = useAuth();
  const [clubCode, setClubCode] = useState("");
  const [parentCode, setParentCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#080d18] text-white flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-gray-400" aria-label="Caricamento sessione" />
      </div>
    );
  }
  if (user) return <Redirect to="/parent-dashboard" />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!clubCode.trim() || !parentCode.trim()) { setError("Inserisci entrambi i codici."); return; }
    setLoading(true);
    try {
      const res = await fetch(withApi("/api/auth/parent-login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ clubCode: clubCode.trim(), parentCode: parentCode.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Credenziali non valide"); setLoading(false); return; }
      window.location.href = "/parent-dashboard";
    } catch {
      setError("Errore di connessione. Riprova.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#080d18] text-white flex flex-col">
      <div className="absolute inset-0 bg-gradient-to-br from-pink-950/30 via-[#080d18] to-[#080d18] pointer-events-none" />
      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <button onClick={() => window.history.back()} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
          <ArrowLeft className="w-4 h-4" /> Indietro
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm">FT Board</span>
        </div>
      </header>

      <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="w-16 h-16 rounded-2xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center mx-auto mb-6">
              <Heart className="w-8 h-8 text-pink-400" />
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/20 mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-pink-400">Area Genitori</span>
            </div>
            <h1 className="text-3xl font-bold mb-2">Accesso Genitori</h1>
            <p className="text-gray-400 text-sm leading-relaxed">Inserisci i codici forniti dalla tua società sportiva</p>
          </div>

          <div className="rounded-2xl border border-pink-500/20 bg-white/3 p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Codice Club</label>
                <input
                  value={clubCode}
                  onChange={e => setClubCode(e.target.value)}
                  type="text"
                  placeholder="Es. 1234"
                  maxLength={4}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500/50 transition-all text-sm tracking-widest font-mono text-center text-lg"
                />
                <p className="text-xs text-gray-600 mt-1.5">Il codice a 4 cifre della vostra società</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Codice Genitori</label>
                <div className="relative">
                  <input
                    value={parentCode}
                    onChange={e => setParentCode(e.target.value.toUpperCase())}
                    type={showCode ? "text" : "password"}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 pr-12 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500/50 transition-all text-sm tracking-widest font-mono text-center text-lg"
                  />
                  <button type="button" onClick={() => setShowCode(!showCode)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-600 mt-1.5">Il codice di 8 caratteri per l'accesso genitori</p>
              </div>

              {error && <p className="text-sm text-red-400 text-center">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-pink-500/10 border border-pink-500/20 text-pink-400 font-bold text-base rounded-xl transition-all hover:bg-pink-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Accesso in corso...</> : <>Accedi all'Area Genitori</>}
              </button>
            </form>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Area sbagliata?{" "}
              <button onClick={() => window.history.back()} className="text-gray-400 hover:text-white transition-colors underline underline-offset-2">
                Torna al workspace
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
