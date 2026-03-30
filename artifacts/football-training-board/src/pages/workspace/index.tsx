import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { Shield, ArrowLeft, ChevronRight, Users, Loader2, School, GraduationCap, Star, Settings } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

interface ClubInfo {
  id: number;
  name: string;
  logoUrl?: string | null;
  city?: string | null;
}

export default function WorkspacePage() {
  const params = useParams<{ clubSlug: string }>();
  const [, setLocation] = useLocation();
  const { t, language, setLanguage } = useLanguage();
  const clubSlug = params.clubSlug ?? "";
  const clubNameFromUrl = decodeURIComponent(clubSlug);

  const [club, setClub] = useState<ClubInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clubSlug) {
      localStorage.setItem("ftb-workspace-slug", clubSlug);
    }
    if (!clubNameFromUrl) return;
    fetch(`/api/clubs/public/search?name=${encodeURIComponent(clubNameFromUrl)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: ClubInfo[]) => {
        if (data && data.length > 0) setClub(data[0]);
        else setClub({ id: 0, name: clubNameFromUrl });
      })
      .catch(() => setClub({ id: 0, name: clubNameFromUrl }))
      .finally(() => setLoading(false));
  }, [clubNameFromUrl, clubSlug]);

  const SECTIONS = [
    {
      key: "scuola-calcio",
      label: "Scuola Calcio",
      description: language === "it" ? "Allenatori, segreteria, staff tecnico e genitori" : "Coaches, secretary, technical staff and parents",
      icon: School,
      iconBg: "bg-sky-500/10",
      iconColor: "text-sky-400",
      border: "border-sky-500/20 hover:border-sky-400/40",
      gradient: "from-sky-600/20 to-sky-600/5",
      glow: "hover:shadow-sky-500/10",
      href: `/workspace/${clubSlug}/scuola-calcio`,
    },
    {
      key: "settore-giovanile",
      label: "Settore Giovanile",
      description: language === "it" ? "Staff, squadre e giocatori del settore giovanile" : "Staff, teams and players of the youth sector",
      icon: GraduationCap,
      iconBg: "bg-indigo-500/10",
      iconColor: "text-indigo-400",
      border: "border-indigo-500/20 hover:border-indigo-400/40",
      gradient: "from-indigo-600/20 to-indigo-600/5",
      glow: "hover:shadow-indigo-500/10",
      href: `/workspace/${clubSlug}/settore-giovanile`,
    },
    {
      key: "prima-squadra",
      label: "Prima Squadra",
      description: language === "it" ? "Staff tecnico e rosa della prima squadra" : "Technical staff and roster of the first team",
      icon: Star,
      iconBg: "bg-yellow-500/10",
      iconColor: "text-yellow-400",
      border: "border-yellow-500/20 hover:border-yellow-400/40",
      gradient: "from-yellow-600/20 to-yellow-600/5",
      glow: "hover:shadow-yellow-500/10",
      href: `/workspace/${clubSlug}/prima-squadra`,
    },
    {
      key: "admin",
      label: language === "it" ? "Amministrazione" : "Administration",
      description: language === "it" ? "Accesso completo: impostazioni, fatturazione e gestione club" : "Full access: settings, billing and club management",
      icon: Settings,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-400",
      border: "border-emerald-500/20 hover:border-emerald-400/40",
      gradient: "from-emerald-600/20 to-emerald-600/5",
      glow: "hover:shadow-emerald-500/10",
      href: "/admin/login",
    },
  ];

  return (
    <div className="min-h-screen bg-[#080d18] text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/60 via-[#080d18] to-slate-900/40 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      <header className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-white/5">
        <button
          onClick={() => setLocation("/login-club")}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          {t.changeClub}
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

      <div className="relative z-10 max-w-3xl mx-auto px-6 py-16">
        {/* Club header */}
        <div className="text-center mb-14">
          {loading ? (
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto mb-6" />
          ) : (
            <div className="mb-6">
              {club?.logoUrl ? (
                <img
                  src={club.logoUrl}
                  alt={club.name}
                  className="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 border-2 border-white/10 shadow-2xl"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4 shadow-2xl">
                  <Users className="w-10 h-10 text-emerald-400" />
                </div>
              )}
            </div>
          )}
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-3">
            {loading ? <span className="text-gray-400">...</span> : (club?.name ?? clubNameFromUrl)}
          </h1>
          {club?.city && <p className="text-gray-500 text-base mb-2">{club.city}</p>}
          <p className="text-gray-400 text-lg mt-2">
            {language === "it" ? "Seleziona la sezione per continuare" : "Select a section to continue"}
          </p>
        </div>

        {/* 4 main section cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SECTIONS.map((section) => (
            <Link key={section.key} href={section.href}>
              <div
                className={`group relative rounded-2xl border ${section.border} bg-gradient-to-br ${section.gradient} p-6 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-xl ${section.glow}`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl ${section.iconBg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                    <section.icon className={`w-6 h-6 ${section.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg mb-1 text-white">{section.label}</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">{section.description}</p>
                  </div>
                  <ChevronRight className={`w-5 h-5 ${section.iconColor} mt-1 group-hover:translate-x-1 transition-transform shrink-0`} />
                </div>
              </div>
            </Link>
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
