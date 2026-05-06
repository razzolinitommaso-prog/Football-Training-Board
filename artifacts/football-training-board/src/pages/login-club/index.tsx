import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Shield, ArrowLeft, ChevronRight, Lock } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { withApi } from "@/lib/api-base";

export default function LoginClubPage() {
  const [, setLocation] = useLocation();
  const { t, language, setLanguage } = useLanguage();
  const [clubName, setClubName] = useState("");
  const [clubCode, setClubCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = clubName.trim();
    const trimmedCode = clubCode.trim();
    if (!trimmedName) { setError(t.clubNotFound); return; }
    if (!trimmedCode) { setError(t.clubCodeLabel + " required"); return; }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(withApi("/api/clubs/public/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: clubName.trim(),
          code: clubCode.trim(),
        }),
      });
      if (res.status === 404) { setError(t.clubNotFound); return; }
      if (res.status === 401) { setError(t.invalidClubCode); return; }
      if (!res.ok) { setError(t.clubNotFound); return; }
      const club = await res.json();
      const slug = encodeURIComponent(club.name);
      localStorage.setItem("ftb-workspace-slug", slug);
      setLocation(`/workspace/${slug}`);
    } catch {
      setError(t.clubNotFound);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#080d18] text-white flex flex-col">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/30 via-[#080d18] to-blue-950/10 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <Link href="/">
          <button className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            {t.backToHome}
          </button>
        </Link>
        <div className="flex items-center gap-3">
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
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div className="leading-none">
              <span className="font-extrabold text-sm">FTB</span>
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6">
              <Lock className="w-8 h-8 text-emerald-400" />
            </div>
            <h1 className="text-3xl font-bold mb-3">{t.findYourClub}</h1>
            <p className="text-gray-400 leading-relaxed">
              {t.findYourClubDesc}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {t.clubNameLabel}
              </label>
              <input
                type="text"
                value={clubName}
                onChange={(e) => { setClubName(e.target.value); setError(""); }}
                placeholder="es. ASD Paolo Rossi"
                className="w-full px-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all text-base"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {t.clubCodeLabel}
              </label>
              <input
                type="text"
                value={clubCode}
                onChange={(e) => { setClubCode(e.target.value); setError(""); }}
                placeholder={t.clubCodePlaceholder}
                maxLength={8}
                className="w-full px-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all text-base tracking-widest font-mono"
              />
              {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-base rounded-xl transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  ...
                </span>
              ) : (
                <>
                  {t.accessClubWorkspace}
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-sm text-gray-500">
              {t.dontHaveClub}{" "}
              <Link href="/register">
                <span className="text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer">{t.createOneFree}</span>
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
