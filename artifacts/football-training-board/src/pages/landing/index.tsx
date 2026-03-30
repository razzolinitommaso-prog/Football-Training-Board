import { Link, Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Shield, Users, Calendar, Target, Trophy, Dumbbell, BookOpen, ChevronRight, Menu, X } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "@/lib/i18n";

export default function LandingPage() {
  const { user, isLoading } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!isLoading && user) {
    return <Redirect to="/dashboard" />;
  }

  const features = [
    { icon: Users, title: t.landingF1Title, desc: t.landingF1Desc, color: "text-emerald-400", bg: "bg-emerald-400/10" },
    { icon: Calendar, title: t.landingF2Title, desc: t.landingF2Desc, color: "text-blue-400", bg: "bg-blue-400/10" },
    { icon: Target, title: t.landingF3Title, desc: t.landingF3Desc, color: "text-purple-400", bg: "bg-purple-400/10" },
    { icon: Trophy, title: t.landingF4Title, desc: t.landingF4Desc, color: "text-amber-400", bg: "bg-amber-400/10" },
    { icon: Dumbbell, title: t.landingF5Title, desc: t.landingF5Desc, color: "text-red-400", bg: "bg-red-400/10" },
    { icon: BookOpen, title: t.landingF6Title, desc: t.landingF6Desc, color: "text-cyan-400", bg: "bg-cyan-400/10" },
  ];

  const previewStats = [
    { label: t.landingPreviewStat1, value: "48", change: "+3" },
    { label: t.landingPreviewStat2, value: "12", change: "+5" },
    { label: t.landingPreviewStat3, value: "73%", change: "+8%" },
  ];

  const roles = [
    { label: t.admin, color: "from-emerald-500/20 to-emerald-500/5", border: "border-emerald-500/20", text: "text-emerald-400" },
    { label: t.coach, color: "from-blue-500/20 to-blue-500/5", border: "border-blue-500/20", text: "text-blue-400" },
    { label: t.secretary, color: "from-purple-500/20 to-purple-500/5", border: "border-purple-500/20", text: "text-purple-400" },
    { label: t.technicalDirector, color: "from-orange-500/20 to-orange-500/5", border: "border-orange-500/20", text: "text-orange-400" },
    { label: t.fitnessCoach, color: "from-green-500/20 to-green-500/5", border: "border-green-500/20", text: "text-green-400" },
    { label: t.athleticDirector, color: "from-red-500/20 to-red-500/5", border: "border-red-500/20", text: "text-red-400" },
    { label: t.director, color: "from-amber-500/20 to-amber-500/5", border: "border-amber-500/20", text: "text-amber-400" },
  ];

  return (
    <div className="min-h-screen bg-[#080d18] text-white">
      {/* NAV */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#080d18]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-extrabold text-xl tracking-tight text-white">FTB</span>
              <span className="text-[10px] text-emerald-400 font-medium tracking-widest uppercase">Football Training Board</span>
            </div>
          </div>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <a href="#features" className="hover:text-white transition-colors">{t.landingNavFeatures}</a>
            <a href="#areas" className="hover:text-white transition-colors">{t.landingNavAreas}</a>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {/* Language toggle */}
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
            <Link href="/login-club">
              <button className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors rounded-lg border border-white/10 hover:border-white/20">
                {t.landingNavLogin}
              </button>
            </Link>
            <Link href="/register">
              <button className="px-4 py-2 text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg transition-colors shadow-lg shadow-emerald-500/20">
                {t.landingNavCreate}
              </button>
            </Link>
          </div>

          {/* Mobile burger */}
          <button
            className="md:hidden p-2 text-gray-400 hover:text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/5 bg-[#080d18] px-6 py-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setLanguage("en")}
                className={`px-3 py-1 rounded text-sm font-semibold transition-all ${language === "en" ? "bg-emerald-500 text-white" : "text-gray-400 border border-white/10"}`}
              >
                🇬🇧 EN
              </button>
              <button
                onClick={() => setLanguage("it")}
                className={`px-3 py-1 rounded text-sm font-semibold transition-all ${language === "it" ? "bg-emerald-500 text-white" : "text-gray-400 border border-white/10"}`}
              >
                🇮🇹 IT
              </button>
            </div>
            <Link href="/login-club" onClick={() => setMobileMenuOpen(false)}>
              <div className="block py-2 text-gray-300 hover:text-white">{t.landingNavLogin}</div>
            </Link>
            <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
              <div className="block py-2 font-semibold text-emerald-400">{t.landingNavCreate}</div>
            </Link>
          </div>
        )}
      </header>
      {/* HERO */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/40 via-[#080d18] to-blue-950/20 pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-8">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {t.landingBadge}
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight mb-6 border-t-[#195240] border-r-[#195240] border-b-[#195240] border-l-[#195240]">
            {t.landingHero1}<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
              {t.landingHero2}
            </span>
          </h1>

          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            {t.landingSubtitle}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login-club">
              <button className="group flex items-center justify-center gap-2 px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-lg rounded-xl transition-all shadow-2xl shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-105">
                {t.landingCta1}
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </Link>
            <Link href="/register">
              <button className="flex items-center justify-center gap-2 px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-bold text-lg rounded-xl transition-all border border-white/10 hover:border-white/20 hover:scale-105">
                {t.landingCta2}
              </button>
            </Link>
          </div>
        </div>

        {/* Dashboard preview */}
        <div className="relative max-w-5xl mx-auto mt-20">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/2 overflow-hidden shadow-2xl shadow-black/50">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-white/5">
              <span className="w-3 h-3 rounded-full bg-red-500/60" />
              <span className="w-3 h-3 rounded-full bg-amber-500/60" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/60" />
              <span className="ml-4 text-xs text-gray-500 flex items-center gap-1">
                <Shield className="w-3 h-3 text-emerald-500" />
                FTB — Dashboard
              </span>
            </div>
            <div className="p-8 grid grid-cols-3 gap-4">
              {previewStats.map((stat) => (
                <div key={stat.label} className="rounded-xl bg-white/5 border border-white/5 p-4 text-center">
                  <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
                  <div className="text-xs text-gray-400">{stat.label}</div>
                  <div className="text-xs text-emerald-400 mt-1">{stat.change} {t.landingThisMonth}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      {/* FEATURES */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{t.landingFeaturesTitle}</h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">{t.landingFeaturesSubtitle}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-white/5 bg-white/3 hover:bg-white/5 p-6 transition-all hover:border-white/10 hover:shadow-lg hover:shadow-black/30"
              >
                <div className={`w-12 h-12 rounded-xl ${f.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <f.icon className={`w-6 h-6 ${f.color}`} />
                </div>
                <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* ROLES */}
      <section id="areas" className="py-24 px-6 bg-gradient-to-b from-transparent to-white/3">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">{t.landingAreasTitle}</h2>
          <p className="text-gray-400 text-lg mb-12">{t.landingAreasSubtitle}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {roles.map((role) => (
              <div key={role.label} className={`rounded-xl border ${role.border} bg-gradient-to-b ${role.color} p-4 text-center`}>
                <Shield className={`w-6 h-6 ${role.text} mx-auto mb-2`} />
                <div className={`text-sm font-semibold ${role.text}`}>{role.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* CTA SECTION */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl bg-gradient-to-br from-emerald-900/40 to-cyan-900/20 border border-emerald-500/20 p-12 text-center">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="font-extrabold text-2xl text-white">FTB</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{t.landingCtaTitle}</h2>
            <p className="text-gray-400 text-lg mb-8">{t.landingCtaSubtitle}</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register">
                <button className="group flex items-center justify-center gap-2 px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-lg rounded-xl transition-all shadow-2xl shadow-emerald-500/30 hover:scale-105">
                  {t.landingCtaBtn1}
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </Link>
              <Link href="/login-club">
                <button className="flex items-center justify-center gap-2 px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-semibold text-lg rounded-xl transition-all border border-white/10 hover:scale-105">
                  {t.landingCtaBtn2}
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>
      {/* FOOTER */}
      <footer className="border-t border-white/5 py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center shadow shadow-emerald-500/20">
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="leading-none">
              <span className="font-extrabold text-sm text-gray-300">FTB</span>
              <span className="text-gray-600 ml-1 text-xs">Football Training Board</span>
            </div>
          </div>
          <span>© {new Date().getFullYear()} Football Training Board. {t.landingFooterRights}</span>
          <a href="/platform-login" className="text-[10px] text-gray-800 hover:text-gray-600 transition-colors select-none">·</a>
        </div>
      </footer>
    </div>
  );
}
