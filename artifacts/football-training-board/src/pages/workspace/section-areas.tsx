import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { Shield, ArrowLeft, ChevronRight, Users, Loader2, School, GraduationCap, Star, Target, FileText, BarChart3, Dumbbell, Settings, Heart } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

interface ClubInfo {
  id: number;
  name: string;
  logoUrl?: string | null;
  city?: string | null;
}

const SECTION_META: Record<string, { label: string; labelEn: string; icon: React.ElementType; iconBg: string; iconColor: string; accent: string }> = {
  "scuola-calcio": {
    label: "Scuola Calcio",
    labelEn: "Football School",
    icon: School,
    iconBg: "bg-sky-500/10",
    iconColor: "text-sky-400",
    accent: "text-sky-400",
  },
  "settore-giovanile": {
    label: "Settore Giovanile",
    labelEn: "Youth Sector",
    icon: GraduationCap,
    iconBg: "bg-indigo-500/10",
    iconColor: "text-indigo-400",
    accent: "text-indigo-400",
  },
  "prima-squadra": {
    label: "Prima Squadra",
    labelEn: "First Team",
    icon: Star,
    iconBg: "bg-yellow-500/10",
    iconColor: "text-yellow-400",
    accent: "text-yellow-400",
  },
};

export default function WorkspaceSectionAreasPage() {
  const params = useParams<{ clubSlug: string; section: string }>();
  const [, setLocation] = useLocation();
  const { t, language, setLanguage } = useLanguage();
  const clubSlug = params.clubSlug ?? "";
  const section = params.section ?? "scuola-calcio";
  const clubNameFromUrl = decodeURIComponent(clubSlug);

  const [club, setClub] = useState<ClubInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clubNameFromUrl) return;
    fetch(`/api/clubs/public/search?name=${encodeURIComponent(clubNameFromUrl)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: ClubInfo[]) => {
        if (data && data.length > 0) setClub(data[0]);
        else setClub({ id: 0, name: clubNameFromUrl });
      })
      .catch(() => setClub({ id: 0, name: clubNameFromUrl }))
      .finally(() => setLoading(false));
  }, [clubNameFromUrl]);

  const meta = SECTION_META[section] ?? SECTION_META["scuola-calcio"];
  const SectionIcon = meta.icon;

  const AREAS = [
    {
      key: "admin",
      label: language === "it" ? "Area Presidente" : "Presidente Area",
      description: language === "it" ? "Accesso completo: membri, fatturazione, impostazioni" : "Full access: members, billing, settings and all areas",
      href: "/admin/login",
      icon: Settings,
      gradient: "from-emerald-600/20 to-emerald-600/5",
      border: "border-emerald-500/20 hover:border-emerald-400/40",
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-400",
      glow: "hover:shadow-emerald-500/10",
    },
    {
      key: "director",
      label: language === "it" ? "Area Direttore Generale" : "General Director Area",
      description: language === "it" ? "Panoramica club, performance e stagioni" : "Club overview, performance metrics and seasons",
      href: "/director/login",
      icon: BarChart3,
      gradient: "from-amber-600/20 to-amber-600/5",
      border: "border-amber-500/20 hover:border-amber-400/40",
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-400",
      glow: "hover:shadow-amber-500/10",
    },
    {
      key: "secretary",
      label: language === "it" ? "Area Segreteria" : "Secretary Area",
      description: language === "it" ? "Iscrizioni, pagamenti, documenti e attrezzature" : "Registrations, payments, documents and equipment",
      href: "/secretary/login",
      icon: FileText,
      gradient: "from-purple-600/20 to-purple-600/5",
      border: "border-purple-500/20 hover:border-purple-400/40",
      iconBg: "bg-purple-500/10",
      iconColor: "text-purple-400",
      glow: "hover:shadow-purple-500/10",
    },
    {
      key: "technical",
      label: language === "it" ? "Area Direttore Tecnico" : "Technical Director Area",
      description: language === "it" ? "Stagioni, esercizi e strategia delle squadre" : "Seasons, exercises and team strategy overview",
      href: "/technical/login",
      icon: BarChart3,
      gradient: "from-orange-600/20 to-orange-600/5",
      border: "border-orange-500/20 hover:border-orange-400/40",
      iconBg: "bg-orange-500/10",
      iconColor: "text-orange-400",
      glow: "hover:shadow-orange-500/10",
    },
    {
      key: "fitness",
      label: language === "it" ? "Area Preparatori" : "Fitness Coaches Area",
      description: language === "it" ? "Programmi fisici, performance e carichi di lavoro" : "Fitness programs, performance and workload tracking",
      href: "/fitness/login",
      icon: Dumbbell,
      gradient: "from-green-600/20 to-green-600/5",
      border: "border-green-500/20 hover:border-green-400/40",
      iconBg: "bg-green-500/10",
      iconColor: "text-green-400",
      glow: "hover:shadow-green-500/10",
    },
    {
      key: "coach",
      label: language === "it" ? "Area Allenatori" : "Coach Area",
      description: language === "it" ? "Allenamenti, tattica, partite e gestione giocatori" : "Training, tactics, matches and player management",
      href: "/coach/login",
      icon: Target,
      gradient: "from-blue-600/20 to-blue-600/5",
      border: "border-blue-500/20 hover:border-blue-400/40",
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-400",
      glow: "hover:shadow-blue-500/10",
    },
    {
      key: "parent",
      label: language === "it" ? "Area Genitori" : "Parent Area",
      description: language === "it" ? "Attività, partite, documenti e pagamenti dei tuoi figli" : "Activities, matches, documents and payments for your children",
      href: "/parent/login",
      icon: Heart,
      gradient: "from-pink-600/20 to-pink-600/5",
      border: "border-pink-500/20 hover:border-pink-400/40",
      iconBg: "bg-pink-500/10",
      iconColor: "text-pink-400",
      glow: "hover:shadow-pink-500/10",
    },
  ];

  return (
    <div className="min-h-screen bg-[#080d18] text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/60 via-[#080d18] to-slate-900/40 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      <header className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-white/5">
        <button
          onClick={() => setLocation(`/workspace/${clubSlug}`)}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          {language === "it" ? "Torna alle sezioni" : "Back to sections"}
        </button>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-white/10 p-1 bg-white/5">
            <button
              onClick={() => setLanguage("en")}
              className={`px-2 py-0.5 rounded text-xs font-semibold transition-all ${language === "en" ? "bg-emerald-500 text-white" : "text-gray-400 hover:text-white"}`}
            >
              🇬🇧 EN
            </button>
            <button
              onClick={() => setLanguage("it")}
              className={`px-2 py-0.5 rounded text-xs font-semibold transition-all ${language === "it" ? "bg-emerald-500 text-white" : "text-gray-400 hover:text-white"}`}
            >
              🇮🇹 IT
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-extrabold text-sm">FTB</span>
          </div>
        </div>
      </header>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-14">
        {/* Club + Section header */}
        <div className="text-center mb-12">
          {loading ? (
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto mb-6" />
          ) : (
            <div className="mb-4">
              {club?.logoUrl ? (
                <img
                  src={club.logoUrl}
                  alt={club.name}
                  className="w-16 h-16 rounded-2xl object-cover mx-auto mb-3 border-2 border-white/10 shadow-2xl"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-3 shadow-2xl">
                  <Users className="w-8 h-8 text-emerald-400" />
                </div>
              )}
            </div>
          )}

          <p className="text-gray-500 text-sm font-medium mb-1">
            {loading ? "..." : (club?.name ?? clubNameFromUrl)}
          </p>

          {/* Section badge */}
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-xl ${meta.iconBg} flex items-center justify-center`}>
              <SectionIcon className={`w-4 h-4 ${meta.iconColor}`} />
            </div>
            <h1 className={`text-3xl md:text-4xl font-extrabold tracking-tight ${meta.accent}`}>
              {language === "it" ? meta.label : meta.labelEn}
            </h1>
          </div>

          <p className="text-gray-400 text-base">
            {language === "it" ? "Seleziona la tua area per accedere" : "Select your area to sign in"}
          </p>
        </div>

        {/* Role area cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {AREAS.map((area) => (
            <div
              key={area.key}
              onClick={() => {
                setLocation(`${area.href}?section=${section}`);
              }}
              className={`group relative rounded-2xl border ${area.border} bg-gradient-to-br ${area.gradient} p-6 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-xl ${area.glow}`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl ${area.iconBg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                  <area.icon className={`w-6 h-6 ${area.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg mb-1 text-white">{area.label}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{area.description}</p>
                </div>
                <ChevronRight className={`w-5 h-5 ${area.iconColor} mt-1 group-hover:translate-x-1 transition-transform shrink-0`} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            {t.knowCredentials}{" "}
            <Link href="/login">
              <span className="text-gray-400 hover:text-white transition-colors cursor-pointer underline underline-offset-2">{t.signInDirectly}</span>
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
