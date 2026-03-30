import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Shield, LayoutDashboard, Building2, MessageSquare, CreditCard,
  LogOut, Users, Trophy, Dumbbell, Trash2, Send, RefreshCw,
  TrendingUp, CheckCircle, Clock, AlertTriangle, X, Menu,
  Bell, Globe, Plus, Copy, FileText, MapPin, Phone, Mail, Receipt, User, Pencil
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 403 || res.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  return res.json();
}

type Stats = {
  totalClubs: number;
  totalUsers: number;
  totalPlayers: number;
  totalTeams: number;
  recentClubs: { id: number; name: string; createdAt: string }[];
};

type Club = {
  id: number;
  name: string;
  legalName: string | null;
  city: string | null;
  country: string | null;
  foundedYear: number | null;
  description: string | null;
  vatNumber: string | null;
  fiscalCode: string | null;
  sdiCode: string | null;
  pec: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  legalAddress: string | null;
  legalCity: string | null;
  legalZip: string | null;
  legalProvince: string | null;
  operationalAddress: string | null;
  operationalCity: string | null;
  operationalZip: string | null;
  operationalProvince: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  accessCode: string | null;
  createdAt: string;
  memberCount: number;
  playerCount: number;
  teamCount: number;
  subscription: { planName: string; status: string; endDate: string | null; paymentMethod?: string | null } | null;
  recentPayments: { id: number; amount: number; status: string; paymentDate: string | null; description: string | null }[];
};

type Announcement = {
  id: number;
  title: string;
  message: string;
  type: string;
  targetClubId: number | null;
  isRead: boolean;
  sentAt: string;
  clubName: string | null;
};

const tabs = [
  { id: "overview", label: "Panoramica", icon: LayoutDashboard },
  { id: "clubs", label: "Società", icon: Building2 },
  { id: "communications", label: "Comunicazioni", icon: MessageSquare },
  { id: "billing", label: "Fatturazione", icon: CreditCard },
];

const announcementTypes = [
  { value: "info", label: "Informazione", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { value: "warning", label: "Avviso", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  { value: "billing", label: "Fatturazione", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  { value: "critical", label: "Urgente", color: "bg-red-500/10 text-red-400 border-red-500/20" },
];

function typeStyle(type: string) {
  return announcementTypes.find(t => t.value === type)?.color ?? "bg-gray-500/10 text-gray-400 border-gray-500/20";
}

function typeLabel(type: string) {
  return announcementTypes.find(t => t.value === type)?.label ?? type;
}

export default function PlatformAdminPage() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");
  const [authChecked, setAuthChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [ownerName, setOwnerName] = useState("Owner");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [stats, setStats] = useState<Stats | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const [deleteClubId, setDeleteClubId] = useState<number | null>(null);
  const [deleteAnnoId, setDeleteAnnoId] = useState<number | null>(null);

  const [annoTitle, setAnnoTitle] = useState("");
  const [annoMessage, setAnnoMessage] = useState("");
  const [annoType, setAnnoType] = useState("info");
  const [annoTargets, setAnnoTargets] = useState<"all" | number[]>("all");
  const [annoSending, setAnnoSending] = useState(false);
  const [annoSuccess, setAnnoSuccess] = useState(false);
  const [annoError, setAnnoError] = useState("");

  const [loading, setLoading] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const data = await apiFetch("/auth/me");
      if (data.isSuperAdmin) {
        setAuthorized(true);
        setOwnerName(data.user?.firstName ?? "Owner");
      } else {
        setLocation("/platform-login");
      }
    } catch {
      setLocation("/platform-login");
    } finally {
      setAuthChecked(true);
    }
  }, [setLocation]);

  const loadStats = useCallback(async () => {
    try {
      const data = await apiFetch("/platform/stats");
      setStats(data);
    } catch { /* empty */ }
  }, []);

  const loadClubs = useCallback(async () => {
    try {
      const data = await apiFetch("/platform/clubs");
      setClubs(data);
    } catch { /* empty */ }
  }, []);

  const loadAnnouncements = useCallback(async () => {
    try {
      const data = await apiFetch("/platform/announcements");
      setAnnouncements(data);
    } catch { /* empty */ }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  useEffect(() => {
    if (!authorized) return;
    if (activeTab === "overview") { loadStats(); loadClubs(); }
    if (activeTab === "clubs") { loadClubs(); }
    if (activeTab === "communications") { loadAnnouncements(); loadClubs(); }
    if (activeTab === "billing") { loadClubs(); }
  }, [authorized, activeTab, loadStats, loadClubs, loadAnnouncements]);

  async function handleDeleteClub() {
    if (!deleteClubId) return;
    try {
      await apiFetch(`/platform/clubs/${deleteClubId}`, { method: "DELETE" });
      setClubs(prev => prev.filter(c => c.id !== deleteClubId));
      if (stats) setStats(s => s ? { ...s, totalClubs: s.totalClubs - 1 } : s);
    } catch (err) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") {
        setLocation("/platform-login");
      }
    } finally {
      setDeleteClubId(null);
    }
  }

  async function handleDeleteAnnouncement() {
    if (!deleteAnnoId) return;
    try {
      await apiFetch(`/platform/announcements/${deleteAnnoId}`, { method: "DELETE" });
      setAnnouncements(prev => prev.filter(a => a.id !== deleteAnnoId));
    } catch (err) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") {
        setLocation("/platform-login");
      }
    } finally {
      setDeleteAnnoId(null);
    }
  }

  async function handleSendAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    setAnnoSending(true);
    setAnnoError("");
    try {
      await apiFetch("/platform/announcements", {
        method: "POST",
        body: JSON.stringify({
          title: annoTitle,
          message: annoMessage,
          type: annoType,
          targetClubIds: annoTargets === "all" ? null : annoTargets,
        }),
      });
      setAnnoTitle("");
      setAnnoMessage("");
      setAnnoType("info");
      setAnnoTargets("all");
      setAnnoSuccess(true);
      setTimeout(() => setAnnoSuccess(false), 3000);
      loadAnnouncements();
    } catch (err) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") {
        setLocation("/platform-login");
      } else {
        setAnnoError("Errore durante l'invio. Riprova.");
      }
    } finally {
      setAnnoSending(false);
    }
  }

  async function handleLogout() {
    await fetch(`${BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
    setLocation("/platform-login");
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Verifica accesso...
        </div>
      </div>
    );
  }

  if (!authorized) return null;

  const sidebarContent = (
    <>
      <div className="px-6 py-5 border-b border-white/5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-extrabold text-sm text-white leading-none">FTB Platform</div>
              <div className="text-[10px] text-emerald-400 mt-0.5">Owner Console</div>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Chiudi menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/5">
        <div className="px-3 py-2 mb-2">
          <p className="text-xs text-gray-500">Connesso come</p>
          <p className="text-sm font-semibold text-white">{ownerName}</p>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Esci
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col md:flex-row">

      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — desktop: always visible inline; mobile: fixed overlay */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 flex flex-col
        border-r border-white/5 bg-[#0d0d14]
        transform transition-transform duration-300 ease-in-out
        md:relative md:w-64 md:translate-x-0 md:z-auto md:flex md:shrink-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        {sidebarContent}
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-[#0d0d14] md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Apri menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-sm text-white">FTB Platform</span>
          </div>
          <span className="ml-auto text-xs text-emerald-400 font-medium capitalize">
            {tabs.find(t => t.id === activeTab)?.label}
          </span>
        </div>

        <main className="flex-1 overflow-auto">
          {activeTab === "overview" && <OverviewTab stats={stats} clubs={clubs} />}
          {activeTab === "clubs" && (
            <ClubsTab
              clubs={clubs}
              onDelete={setDeleteClubId}
              onRefresh={loadClubs}
              onCreated={(club) => setClubs(prev => [club, ...prev])}
              onUpdated={(updated) => setClubs(prev => prev.map(c => c.id === updated.id ? updated : c))}
            />
          )}
          {activeTab === "communications" && (
            <CommunicationsTab
              announcements={announcements}
              clubs={clubs}
              annoTitle={annoTitle} setAnnoTitle={setAnnoTitle}
              annoMessage={annoMessage} setAnnoMessage={setAnnoMessage}
              annoType={annoType} setAnnoType={setAnnoType}
              annoTargets={annoTargets} setAnnoTargets={setAnnoTargets}
              annoSending={annoSending} annoSuccess={annoSuccess} annoError={annoError}
              onSend={handleSendAnnouncement}
              onDelete={setDeleteAnnoId}
            />
          )}
          {activeTab === "billing" && <BillingTab clubs={clubs} onRefresh={loadClubs} />}
        </main>
      </div>

      <AlertDialog open={deleteClubId !== null} onOpenChange={() => setDeleteClubId(null)}>
        <AlertDialogContent className="bg-[#111118] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Società</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Questa azione è irreversibile. Tutti i dati della società (giocatori, squadre, allenamenti, convocazioni) verranno eliminati definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 text-gray-300 hover:bg-white/5">Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteClub} className="bg-red-600 hover:bg-red-500 text-white">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteAnnoId !== null} onOpenChange={() => setDeleteAnnoId(null)}>
        <AlertDialogContent className="bg-[#111118] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Comunicazione</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Vuoi eliminare questo messaggio?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 text-gray-300 hover:bg-white/5">Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAnnouncement} className="bg-red-600 hover:bg-red-500 text-white">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number | undefined; color: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5">
      <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-3xl font-extrabold text-white">{value ?? "—"}</div>
      <div className="text-sm text-gray-400 mt-1">{label}</div>
    </div>
  );
}

function OverviewTab({ stats, clubs }: { stats: Stats | null; clubs: Club[] }) {
  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Panoramica Piattaforma</h1>
        <p className="text-gray-500 text-sm mt-1">Stato generale di Football Training Board</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Building2} label="Società registrate" value={stats?.totalClubs} color="bg-emerald-500/15 text-emerald-400" />
        <StatCard icon={Users} label="Utenti staff" value={stats?.totalUsers} color="bg-blue-500/15 text-blue-400" />
        <StatCard icon={Dumbbell} label="Giocatori" value={stats?.totalPlayers} color="bg-purple-500/15 text-purple-400" />
        <StatCard icon={Trophy} label="Squadre" value={stats?.totalTeams} color="bg-amber-500/15 text-amber-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Ultime Società Registrate
          </h2>
          <div className="space-y-3">
            {stats?.recentClubs.length === 0 && (
              <p className="text-gray-600 text-sm">Nessuna società ancora.</p>
            )}
            {stats?.recentClubs.map(c => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold text-xs">
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm text-white font-medium">{c.name}</span>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(c.createdAt).toLocaleDateString("it-IT")}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-400" />
            Distribuzione Geografica
          </h2>
          <div className="space-y-2">
            {Object.entries(
              clubs.reduce((acc: Record<string, number>, c) => {
                const key = c.country || "N/D";
                acc[key] = (acc[key] || 0) + 1;
                return acc;
              }, {})
            ).sort((a, b) => b[1] - a[1]).map(([country, count]) => (
              <div key={country} className="flex items-center gap-3">
                <span className="text-sm text-gray-300 w-24 truncate">{country}</span>
                <div className="flex-1 bg-white/5 rounded-full h-2">
                  <div
                    className="bg-emerald-500 h-2 rounded-full"
                    style={{ width: `${Math.min(100, (count / clubs.length) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-6 text-right">{count}</span>
              </div>
            ))}
            {clubs.length === 0 && <p className="text-gray-600 text-sm">Nessun dato.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

const plans = [
  { value: "standard", label: "Standard", desc: "3 sq · 50 gioc." },
  { value: "advanced", label: "Advanced", desc: "5 sq · 100 gioc." },
  { value: "semi-pro", label: "Semi-Pro", desc: "10 sq · 200 gioc." },
  { value: "pro",      label: "Pro",      desc: "Illimitato" },
];

const paymentMethods = [
  { value: "bonifico", label: "Bonifico" },
  { value: "carta",    label: "Carta" },
  { value: "paypal",   label: "PayPal" },
  { value: "altro",    label: "Altro" },
];

type ClubFormData = {
  // Admin user
  adminFirstName: string; adminLastName: string; adminEmail: string; adminPassword: string;
  // Club
  name: string; legalName: string; city: string; country: string;
  foundedYear: string; description: string;
  vatNumber: string; fiscalCode: string; sdiCode: string; pec: string;
  phone: string; email: string; website: string;
  legalAddress: string; legalCity: string; legalZip: string; legalProvince: string;
  operationalAddress: string; operationalCity: string; operationalZip: string; operationalProvince: string;
  contactName: string; contactPhone: string; contactEmail: string;
  // Plan & payment
  planName: string; paymentMethod: string;
};

const emptyForm = (): ClubFormData => ({
  adminFirstName: "", adminLastName: "", adminEmail: "", adminPassword: "",
  name: "", legalName: "", city: "", country: "Italia",
  foundedYear: "", description: "",
  vatNumber: "", fiscalCode: "", sdiCode: "", pec: "",
  phone: "", email: "", website: "",
  legalAddress: "", legalCity: "", legalZip: "", legalProvince: "",
  operationalAddress: "", operationalCity: "", operationalZip: "", operationalProvince: "",
  contactName: "", contactPhone: "", contactEmail: "",
  planName: "standard", paymentMethod: "bonifico",
});

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-gray-400 text-xs font-medium uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-2 pt-2 pb-1 border-b border-white/10">
      <Icon className="w-4 h-4 text-emerald-400" />
      <span className="text-sm font-semibold text-white">{label}</span>
    </div>
  );
}

function CreateClubDialog({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (club: Club) => void;
}) {
  const [form, setForm] = useState<ClubFormData>(emptyForm());
  const [sameAddress, setSameAddress] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  function set(field: keyof ClubFormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm(prev => ({ ...prev, [field]: e.target.value }));
    };
  }

  function handleSameAddress(checked: boolean) {
    setSameAddress(checked);
    if (checked) {
      setForm(prev => ({
        ...prev,
        operationalAddress: prev.legalAddress,
        operationalCity: prev.legalCity,
        operationalZip: prev.legalZip,
        operationalProvince: prev.legalProvince,
      }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Il nome della società è obbligatorio."); return; }
    if (form.adminEmail && !form.adminPassword) { setError("Inserisci una password per l'admin."); return; }
    if (form.adminPassword && form.adminPassword.length < 6) { setError("Password min. 6 caratteri."); return; }
    setSaving(true); setError("");
    try {
      const club = await apiFetch("/platform/clubs", {
        method: "POST",
        body: JSON.stringify({ ...form, foundedYear: form.foundedYear ? Number(form.foundedYear) : undefined }),
      });
      setCreatedCode(club.accessCode);
      onCreated(club);
    } catch {
      setError("Errore durante la creazione. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setForm(emptyForm());
    setSameAddress(false);
    setError("");
    setCreatedCode(null);
    onClose();
  }

  const inputClass = "bg-white/5 border-white/10 text-white placeholder:text-gray-600 text-sm h-9";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-[#111118] border-white/10 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-extrabold">
            <Building2 className="w-5 h-5 text-emerald-400" />
            Nuova Società
          </DialogTitle>
        </DialogHeader>

        {createdCode ? (
          <div className="py-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold text-white text-lg">Società creata con successo!</p>
              <p className="text-gray-400 text-sm mt-1">Il codice di accesso per il login dello staff è:</p>
            </div>
            <div className="inline-flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-6 py-3">
              <span className="font-mono text-2xl font-bold text-emerald-400 tracking-widest">{createdCode}</span>
              <button
                onClick={() => navigator.clipboard.writeText(createdCode)}
                className="text-gray-500 hover:text-gray-300"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500">Conserva questo codice e condividilo con l'amministratore della società.</p>
            <Button onClick={handleClose} className="bg-emerald-600 hover:bg-emerald-500">Chiudi</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <SectionHeader icon={User} label="Utente Amministratore (opzionale)" />
            <p className="text-xs text-gray-500 -mt-3">Se fornito, verrà creato un account admin per la società.</p>
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="Nome">
                <Input value={form.adminFirstName} onChange={set("adminFirstName")} placeholder="Mario" className={inputClass} />
              </FieldRow>
              <FieldRow label="Cognome">
                <Input value={form.adminLastName} onChange={set("adminLastName")} placeholder="Rossi" className={inputClass} />
              </FieldRow>
              <FieldRow label="Email Admin">
                <Input value={form.adminEmail} onChange={set("adminEmail")} type="email" placeholder="admin@club.it" className={inputClass} />
              </FieldRow>
              <FieldRow label="Password">
                <Input value={form.adminPassword} onChange={set("adminPassword")} type="password" placeholder="Min. 6 caratteri" className={inputClass} />
              </FieldRow>
            </div>

            <SectionHeader icon={Building2} label="Dati Principali" />
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="Nome Società *">
                <Input value={form.name} onChange={set("name")} required placeholder="Es. ASD Fiorentina" className={inputClass} />
              </FieldRow>
              <FieldRow label="Ragione Sociale">
                <Input value={form.legalName} onChange={set("legalName")} placeholder="Ragione sociale completa" className={inputClass} />
              </FieldRow>
              <FieldRow label="Città">
                <Input value={form.city} onChange={set("city")} placeholder="Es. Firenze" className={inputClass} />
              </FieldRow>
              <FieldRow label="Paese">
                <Input value={form.country} onChange={set("country")} placeholder="Es. Italia" className={inputClass} />
              </FieldRow>
              <FieldRow label="Anno Fondazione">
                <Input value={form.foundedYear} onChange={set("foundedYear")} type="number" placeholder="Es. 1926" className={inputClass} />
              </FieldRow>
            </div>
            <FieldRow label="Descrizione">
              <Textarea value={form.description} onChange={set("description")} rows={2} placeholder="Note o descrizione del club..." className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 text-sm resize-none" />
            </FieldRow>

            <SectionHeader icon={Receipt} label="Dati Fiscali & Fatturazione" />
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="Partita IVA">
                <Input value={form.vatNumber} onChange={set("vatNumber")} placeholder="IT12345678901" className={inputClass} />
              </FieldRow>
              <FieldRow label="Codice Fiscale">
                <Input value={form.fiscalCode} onChange={set("fiscalCode")} placeholder="RSSSMN80A01H501U" className={inputClass} />
              </FieldRow>
              <FieldRow label="Codice SDI (Fatturazione Elettronica)">
                <Input value={form.sdiCode} onChange={set("sdiCode")} placeholder="Es. XXXXXXX (7 caratteri)" maxLength={7} className={inputClass} />
              </FieldRow>
              <FieldRow label="PEC">
                <Input value={form.pec} onChange={set("pec")} type="email" placeholder="pec@example.it" className={inputClass} />
              </FieldRow>
            </div>

            <SectionHeader icon={Phone} label="Contatti Principali" />
            <div className="grid grid-cols-3 gap-4">
              <FieldRow label="Telefono">
                <Input value={form.phone} onChange={set("phone")} placeholder="+39 055 000000" className={inputClass} />
              </FieldRow>
              <FieldRow label="Email">
                <Input value={form.email} onChange={set("email")} type="email" placeholder="info@club.it" className={inputClass} />
              </FieldRow>
              <FieldRow label="Sito Web">
                <Input value={form.website} onChange={set("website")} placeholder="https://www.club.it" className={inputClass} />
              </FieldRow>
            </div>

            <SectionHeader icon={MapPin} label="Sede Legale" />
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <FieldRow label="Indirizzo">
                  <Input value={form.legalAddress} onChange={set("legalAddress")} placeholder="Via Roma 1" className={inputClass} />
                </FieldRow>
              </div>
              <FieldRow label="Città">
                <Input value={form.legalCity} onChange={set("legalCity")} placeholder="Firenze" className={inputClass} />
              </FieldRow>
              <FieldRow label="CAP">
                <Input value={form.legalZip} onChange={set("legalZip")} placeholder="50100" maxLength={5} className={inputClass} />
              </FieldRow>
              <FieldRow label="Provincia">
                <Input value={form.legalProvince} onChange={set("legalProvince")} placeholder="FI" maxLength={2} className={`${inputClass} uppercase`} />
              </FieldRow>
            </div>

            <SectionHeader icon={MapPin} label="Sede Operativa" />
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-400 hover:text-gray-300">
              <input
                type="checkbox"
                checked={sameAddress}
                onChange={e => handleSameAddress(e.target.checked)}
                className="accent-emerald-500"
              />
              Stessa della sede legale
            </label>
            {!sameAddress && (
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <FieldRow label="Indirizzo">
                    <Input value={form.operationalAddress} onChange={set("operationalAddress")} placeholder="Via Stadio 1" className={inputClass} />
                  </FieldRow>
                </div>
                <FieldRow label="Città">
                  <Input value={form.operationalCity} onChange={set("operationalCity")} placeholder="Firenze" className={inputClass} />
                </FieldRow>
                <FieldRow label="CAP">
                  <Input value={form.operationalZip} onChange={set("operationalZip")} placeholder="50100" maxLength={5} className={inputClass} />
                </FieldRow>
                <FieldRow label="Provincia">
                  <Input value={form.operationalProvince} onChange={set("operationalProvince")} placeholder="FI" maxLength={2} className={`${inputClass} uppercase`} />
                </FieldRow>
              </div>
            )}

            <SectionHeader icon={Mail} label="Referente Principale" />
            <div className="grid grid-cols-3 gap-4">
              <FieldRow label="Nome Referente">
                <Input value={form.contactName} onChange={set("contactName")} placeholder="Mario Rossi" className={inputClass} />
              </FieldRow>
              <FieldRow label="Telefono Referente">
                <Input value={form.contactPhone} onChange={set("contactPhone")} placeholder="+39 333 000000" className={inputClass} />
              </FieldRow>
              <FieldRow label="Email Referente">
                <Input value={form.contactEmail} onChange={set("contactEmail")} type="email" placeholder="m.rossi@club.it" className={inputClass} />
              </FieldRow>
            </div>

            <SectionHeader icon={Receipt} label="Piano & Metodo di Pagamento" />
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-2">Piano abbonamento</p>
                <div className="grid grid-cols-4 gap-2">
                  {plans.map(p => (
                    <label key={p.value} className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center text-xs transition-all ${form.planName === p.value ? "border-emerald-500 bg-emerald-500/15 text-white font-semibold" : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20"}`}>
                      <input type="radio" name="plan" value={p.value} checked={form.planName === p.value} onChange={() => setForm(prev => ({ ...prev, planName: p.value }))} className="sr-only" />
                      <div className="font-bold">{p.label}</div>
                      <div className="text-gray-500 mt-0.5">{p.desc}</div>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-2">Metodo di pagamento</p>
                <div className="grid grid-cols-4 gap-2">
                  {paymentMethods.map(pm => (
                    <label key={pm.value} className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center text-xs transition-all ${form.paymentMethod === pm.value ? "border-emerald-500 bg-emerald-500/15 text-white font-semibold" : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20"}`}>
                      <input type="radio" name="payment" value={pm.value} checked={form.paymentMethod === pm.value} onChange={() => setForm(prev => ({ ...prev, paymentMethod: pm.value }))} className="sr-only" />
                      {pm.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
            )}

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={handleClose} className="text-gray-400 hover:text-white hover:bg-white/5">
                Annulla
              </Button>
              <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2">
                <Plus className="w-4 h-4" />
                {saving ? "Creazione..." : "Crea Società"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditClubDialog({ club, onClose, onUpdated }: { club: Club; onClose: () => void; onUpdated: (club: Club) => void }) {
  const inputClass = "bg-white/5 border-white/10 text-white placeholder:text-gray-600 text-sm h-9";
  const [form, setForm] = useState({
    name: club.name ?? "",
    legalName: club.legalName ?? "",
    city: club.city ?? "",
    country: club.country ?? "Italia",
    foundedYear: club.foundedYear ? String(club.foundedYear) : "",
    description: club.description ?? "",
    vatNumber: club.vatNumber ?? "",
    fiscalCode: club.fiscalCode ?? "",
    sdiCode: club.sdiCode ?? "",
    pec: club.pec ?? "",
    phone: club.phone ?? "",
    email: club.email ?? "",
    website: club.website ?? "",
    legalAddress: club.legalAddress ?? "",
    legalCity: club.legalCity ?? "",
    legalZip: club.legalZip ?? "",
    legalProvince: club.legalProvince ?? "",
    operationalAddress: club.operationalAddress ?? "",
    operationalCity: club.operationalCity ?? "",
    operationalZip: club.operationalZip ?? "",
    operationalProvince: club.operationalProvince ?? "",
    contactName: club.contactName ?? "",
    contactPhone: club.contactPhone ?? "",
    contactEmail: club.contactEmail ?? "",
    planName: club.subscription?.planName ?? "standard",
    paymentMethod: club.subscription?.paymentMethod ?? "bonifico",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(k: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Il nome è obbligatorio."); return; }
    setSaving(true); setError("");
    try {
      const updated = await apiFetch(`/platform/clubs/${club.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...form, foundedYear: form.foundedYear ? Number(form.foundedYear) : undefined }),
      });
      onUpdated({ ...club, ...updated });
    } catch {
      setError("Errore durante il salvataggio. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#111118] border-white/10 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-extrabold">
            <Pencil className="w-5 h-5 text-blue-400" />
            Modifica Società — {club.name}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <SectionHeader icon={Building2} label="Dati Principali" />
          <div className="grid grid-cols-2 gap-4">
            <FieldRow label="Nome Società *"><Input value={form.name} onChange={set("name")} required className={inputClass} /></FieldRow>
            <FieldRow label="Ragione Sociale"><Input value={form.legalName} onChange={set("legalName")} placeholder="Ragione sociale completa" className={inputClass} /></FieldRow>
            <FieldRow label="Città"><Input value={form.city} onChange={set("city")} placeholder="Es. Firenze" className={inputClass} /></FieldRow>
            <FieldRow label="Paese"><Input value={form.country} onChange={set("country")} className={inputClass} /></FieldRow>
            <FieldRow label="Anno Fondazione"><Input value={form.foundedYear} onChange={set("foundedYear")} type="number" placeholder="Es. 1926" className={inputClass} /></FieldRow>
          </div>
          <FieldRow label="Descrizione">
            <Textarea value={form.description} onChange={set("description")} rows={2} placeholder="Note o descrizione del club..." className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 text-sm resize-none" />
          </FieldRow>

          <SectionHeader icon={Receipt} label="Dati Fiscali & Fatturazione" />
          <div className="grid grid-cols-2 gap-4">
            <FieldRow label="Partita IVA"><Input value={form.vatNumber} onChange={set("vatNumber")} placeholder="IT12345678901" className={inputClass} /></FieldRow>
            <FieldRow label="Codice Fiscale"><Input value={form.fiscalCode} onChange={set("fiscalCode")} className={inputClass} /></FieldRow>
            <FieldRow label="Codice SDI"><Input value={form.sdiCode} onChange={set("sdiCode")} maxLength={7} className={inputClass} /></FieldRow>
            <FieldRow label="PEC"><Input value={form.pec} onChange={set("pec")} type="email" placeholder="pec@example.it" className={inputClass} /></FieldRow>
          </div>

          <SectionHeader icon={Phone} label="Contatti Principali" />
          <div className="grid grid-cols-3 gap-4">
            <FieldRow label="Telefono"><Input value={form.phone} onChange={set("phone")} className={inputClass} /></FieldRow>
            <FieldRow label="Email"><Input value={form.email} onChange={set("email")} type="email" className={inputClass} /></FieldRow>
            <FieldRow label="Sito Web"><Input value={form.website} onChange={set("website")} placeholder="https://..." className={inputClass} /></FieldRow>
          </div>

          <SectionHeader icon={MapPin} label="Sede Legale" />
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><FieldRow label="Indirizzo"><Input value={form.legalAddress} onChange={set("legalAddress")} className={inputClass} /></FieldRow></div>
            <FieldRow label="Città"><Input value={form.legalCity} onChange={set("legalCity")} className={inputClass} /></FieldRow>
            <FieldRow label="CAP"><Input value={form.legalZip} onChange={set("legalZip")} maxLength={5} className={inputClass} /></FieldRow>
            <FieldRow label="Provincia"><Input value={form.legalProvince} onChange={set("legalProvince")} maxLength={2} className={`${inputClass} uppercase`} /></FieldRow>
          </div>

          <SectionHeader icon={MapPin} label="Sede Operativa" />
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><FieldRow label="Indirizzo"><Input value={form.operationalAddress} onChange={set("operationalAddress")} className={inputClass} /></FieldRow></div>
            <FieldRow label="Città"><Input value={form.operationalCity} onChange={set("operationalCity")} className={inputClass} /></FieldRow>
            <FieldRow label="CAP"><Input value={form.operationalZip} onChange={set("operationalZip")} maxLength={5} className={inputClass} /></FieldRow>
            <FieldRow label="Provincia"><Input value={form.operationalProvince} onChange={set("operationalProvince")} maxLength={2} className={`${inputClass} uppercase`} /></FieldRow>
          </div>

          <SectionHeader icon={Mail} label="Referente Principale" />
          <div className="grid grid-cols-3 gap-4">
            <FieldRow label="Nome Referente"><Input value={form.contactName} onChange={set("contactName")} className={inputClass} /></FieldRow>
            <FieldRow label="Telefono"><Input value={form.contactPhone} onChange={set("contactPhone")} className={inputClass} /></FieldRow>
            <FieldRow label="Email"><Input value={form.contactEmail} onChange={set("contactEmail")} type="email" className={inputClass} /></FieldRow>
          </div>

          <SectionHeader icon={Receipt} label="Piano & Metodo di Pagamento" />
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-500 mb-2">Piano abbonamento</p>
              <div className="grid grid-cols-4 gap-2">
                {plans.map(p => (
                  <label key={p.value} className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center text-xs transition-all ${form.planName === p.value ? "border-emerald-500 bg-emerald-500/15 text-white font-semibold" : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20"}`}>
                    <input type="radio" name="edit-plan" value={p.value} checked={form.planName === p.value} onChange={() => setForm(prev => ({ ...prev, planName: p.value }))} className="sr-only" />
                    <div className="font-bold">{p.label}</div>
                    <div className="text-gray-500 mt-0.5">{p.desc}</div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2">Metodo di pagamento</p>
              <div className="grid grid-cols-4 gap-2">
                {paymentMethods.map(pm => (
                  <label key={pm.value} className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center text-xs transition-all ${form.paymentMethod === pm.value ? "border-emerald-500 bg-emerald-500/15 text-white font-semibold" : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20"}`}>
                    <input type="radio" name="edit-payment" value={pm.value} checked={form.paymentMethod === pm.value} onChange={() => setForm(prev => ({ ...prev, paymentMethod: pm.value }))} className="sr-only" />
                    {pm.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {error && <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} className="text-gray-400 hover:text-white hover:bg-white/5">Annulla</Button>
            <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white gap-2">
              <Pencil className="w-4 h-4" />
              {saving ? "Salvataggio..." : "Salva Modifiche"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ClubsTab({ clubs, onDelete, onRefresh, onCreated, onUpdated }: {
  clubs: Club[];
  onDelete: (id: number) => void;
  onRefresh: () => void;
  onCreated: (club: Club) => void;
  onUpdated: (club: Club) => void;
}) {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const filtered = clubs.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.city ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Gestione Società</h1>
          <p className="text-gray-500 text-sm mt-1">{clubs.length} società registrate sulla piattaforma</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onRefresh} variant="outline" size="sm" className="border-white/10 text-gray-300 hover:bg-white/5 gap-2">
            <RefreshCw className="w-4 h-4" />
            Aggiorna
          </Button>
          <Button onClick={() => setShowCreate(true)} size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2">
            <Plus className="w-4 h-4" />
            Nuova Società
          </Button>
        </div>
      </div>
      <CreateClubDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(club) => { onCreated(club); setShowCreate(false); }}
      />
      {editingClub && (
        <EditClubDialog
          club={editingClub}
          onClose={() => setEditingClub(null)}
          onUpdated={(updated) => { onUpdated(updated); setEditingClub(null); }}
        />
      )}

      <Input
        placeholder="Cerca società per nome o città..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 max-w-sm"
      />

      <div className="space-y-3">
        {filtered.map(club => (
          <div key={club.id} className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-extrabold text-sm shrink-0">
                  {club.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-white text-base">{club.name}</div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {[club.city, club.country].filter(Boolean).join(", ") || "Posizione non specificata"}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-2">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Users className="w-3 h-3" />{club.memberCount} staff
                    </span>
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Dumbbell className="w-3 h-3" />{club.playerCount} giocatori
                    </span>
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Trophy className="w-3 h-3" />{club.teamCount} squadre
                    </span>
                    {club.accessCode && (
                      <span className="text-xs text-gray-500">
                        Codice: <span className="font-mono text-gray-400">{club.accessCode}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {club.subscription && (
                  <Badge className={`text-xs ${
                    club.subscription.status === "active"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                  }`}>
                    {club.subscription.planName} · {club.subscription.status}
                  </Badge>
                )}
                <span className="text-xs text-gray-600">
                  {new Date(club.createdAt).toLocaleDateString("it-IT")}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingClub(club)}
                  className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 h-8 w-8 p-0"
                  title="Modifica"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(club.id)}
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8 p-0"
                  title="Elimina"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {club.recentPayments.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Ultimi Pagamenti</p>
                <div className="flex flex-wrap gap-2">
                  {club.recentPayments.map(p => (
                    <div key={p.id} className="text-xs bg-white/5 rounded-lg px-3 py-1.5 flex items-center gap-2">
                      <span className={p.status === "paid" ? "text-emerald-400" : p.status === "pending" ? "text-amber-400" : "text-red-400"}>
                        {p.status === "paid" ? "✓" : p.status === "pending" ? "⏳" : "✗"}
                      </span>
                      <span className="text-white font-medium">€{p.amount.toFixed(2)}</span>
                      <span className="text-gray-500">{p.description ?? "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-600">
            Nessuna società trovata.
          </div>
        )}
      </div>
    </div>
  );
}

function CommunicationsTab({
  announcements, clubs,
  annoTitle, setAnnoTitle,
  annoMessage, setAnnoMessage,
  annoType, setAnnoType,
  annoTargets, setAnnoTargets,
  annoSending, annoSuccess, annoError,
  onSend, onDelete,
}: {
  announcements: Announcement[];
  clubs: Club[];
  annoTitle: string; setAnnoTitle: (v: string) => void;
  annoMessage: string; setAnnoMessage: (v: string) => void;
  annoType: string; setAnnoType: (v: string) => void;
  annoTargets: "all" | number[]; setAnnoTargets: (v: "all" | number[]) => void;
  annoSending: boolean; annoSuccess: boolean; annoError: string;
  onSend: (e: React.FormEvent) => void;
  onDelete: (id: number) => void;
}) {
  const [selectedClubs, setSelectedClubs] = useState<number[]>([]);
  const [targetMode, setTargetMode] = useState<"all" | "specific">("all");

  function toggleClub(id: number) {
    const updated = selectedClubs.includes(id)
      ? selectedClubs.filter(c => c !== id)
      : [...selectedClubs, id];
    setSelectedClubs(updated);
    setAnnoTargets(updated.length > 0 ? updated : "all");
  }

  useEffect(() => {
    if (targetMode === "all") {
      setSelectedClubs([]);
      setAnnoTargets("all");
    }
  }, [targetMode, setAnnoTargets]);

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Comunicazioni</h1>
        <p className="text-gray-500 text-sm mt-1">Invia messaggi e avvisi alle società registrate</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
          <h2 className="font-semibold text-white mb-5 flex items-center gap-2">
            <Send className="w-4 h-4 text-emerald-400" />
            Nuovo Messaggio
          </h2>
          <form onSubmit={onSend} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Titolo</Label>
              <Input
                value={annoTitle}
                onChange={e => setAnnoTitle(e.target.value)}
                required
                placeholder="Es. Aggiornamento piattaforma v2.1"
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-600"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Messaggio</Label>
              <Textarea
                value={annoMessage}
                onChange={e => setAnnoMessage(e.target.value)}
                required
                rows={4}
                placeholder="Scrivi qui il testo della comunicazione..."
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Tipo</Label>
              <Select value={annoType} onValueChange={setAnnoType}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#111118] border-white/10">
                  {announcementTypes.map(t => (
                    <SelectItem key={t.value} value={t.value} className="text-white hover:bg-white/5">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300 text-sm">Destinatari</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTargetMode("all")}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                    targetMode === "all"
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                      : "bg-white/5 text-gray-400 border-white/10 hover:border-white/20"
                  }`}
                >
                  Tutte le Società
                </button>
                <button
                  type="button"
                  onClick={() => setTargetMode("specific")}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                    targetMode === "specific"
                      ? "bg-blue-500/15 text-blue-400 border-blue-500/20"
                      : "bg-white/5 text-gray-400 border-white/10 hover:border-white/20"
                  }`}
                >
                  Seleziona Società
                </button>
              </div>
              {targetMode === "specific" && (
                <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {clubs.map(c => (
                    <label key={c.id} className="flex items-center gap-3 cursor-pointer py-1.5 px-3 rounded-lg hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={selectedClubs.includes(c.id)}
                        onChange={() => toggleClub(c.id)}
                        className="accent-emerald-500"
                      />
                      <span className="text-sm text-gray-300">{c.name}</span>
                      <span className="text-xs text-gray-500">{c.city}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {annoSuccess && (
              <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                <CheckCircle className="w-4 h-4" />
                Comunicazione inviata con successo!
              </div>
            )}

            {annoError && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4" />
                {annoError}
              </div>
            )}

            <Button
              type="submit"
              disabled={annoSending}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl gap-2"
            >
              <Send className="w-4 h-4" />
              {annoSending ? "Invio in corso..." : "Invia Comunicazione"}
            </Button>
          </form>
        </div>

        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
          <h2 className="font-semibold text-white mb-5 flex items-center gap-2">
            <Bell className="w-4 h-4 text-blue-400" />
            Storico Comunicazioni
            <span className="ml-auto text-xs text-gray-500">{announcements.length} totali</span>
          </h2>
          <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
            {announcements.length === 0 && (
              <p className="text-gray-600 text-sm text-center py-8">Nessuna comunicazione inviata.</p>
            )}
            {announcements.map(a => (
              <div key={a.id} className="bg-white/5 rounded-xl p-4 relative group">
                <button
                  onClick={() => onDelete(a.id)}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-start gap-2 mb-1.5">
                  <Badge className={`text-[10px] px-2 py-0.5 ${typeStyle(a.type)}`}>
                    {typeLabel(a.type)}
                  </Badge>
                  <span className="text-[10px] text-gray-500 ml-auto pr-6">
                    {new Date(a.sentAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                </div>
                <p className="font-medium text-sm text-white">{a.title}</p>
                <p className="text-xs text-gray-400 mt-1 line-clamp-2">{a.message}</p>
                <p className="text-[10px] text-gray-600 mt-2">
                  → {a.clubName ?? "Tutte le società"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BillingTab({ clubs, onRefresh }: { clubs: Club[]; onRefresh: () => void }) {
  const withSub = clubs.filter(c => c.subscription);
  const active = withSub.filter(c => c.subscription?.status === "active");
  const expired = withSub.filter(c => c.subscription?.status !== "active");
  const totalRevenue = clubs.flatMap(c => c.recentPayments)
    .filter(p => p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Fatturazione</h1>
          <p className="text-gray-500 text-sm mt-1">Panoramica abbonamenti e pagamenti</p>
        </div>
        <Button onClick={onRefresh} variant="outline" size="sm" className="border-white/10 text-gray-300 hover:bg-white/5 gap-2">
          <RefreshCw className="w-4 h-4" />
          Aggiorna
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5">
          <div className="text-3xl font-extrabold text-white">€{totalRevenue.toFixed(2)}</div>
          <div className="text-sm text-gray-400 mt-1">Incassato (recente)</div>
        </div>
        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5">
          <div className="text-3xl font-extrabold text-emerald-400">{active.length}</div>
          <div className="text-sm text-gray-400 mt-1">Abbonamenti attivi</div>
        </div>
        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5">
          <div className="text-3xl font-extrabold text-red-400">{expired.length}</div>
          <div className="text-sm text-gray-400 mt-1">Scaduti / Inattivi</div>
        </div>
        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5">
          <div className="text-3xl font-extrabold text-gray-400">{clubs.length - withSub.length}</div>
          <div className="text-sm text-gray-400 mt-1">Senza abbonamento</div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-white text-sm uppercase tracking-wide text-gray-400">Dettaglio per Società</h2>
        {clubs.map(club => (
          <div key={club.id} className="bg-white/[0.03] border border-white/5 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-semibold text-white">{club.name}</div>
                <div className="text-xs text-gray-500">{club.city}</div>
              </div>
              {club.subscription ? (
                <div className="text-right">
                  <Badge className={`text-xs ${
                    club.subscription.status === "active"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-red-500/10 text-red-400 border-red-500/20"
                  }`}>
                    {club.subscription.planName} · {club.subscription.status}
                  </Badge>
                  {club.subscription.endDate && (
                    <div className="text-xs text-gray-500 mt-1">
                      Scade: {new Date(club.subscription.endDate).toLocaleDateString("it-IT")}
                    </div>
                  )}
                </div>
              ) : (
                <Badge className="text-xs bg-gray-500/10 text-gray-500 border-gray-500/20">Nessun piano</Badge>
              )}
            </div>
            {club.recentPayments.length > 0 ? (
              <div className="border-t border-white/5 pt-3">
                <p className="text-xs text-gray-600 mb-2 uppercase tracking-wide">Transazioni recenti</p>
                <div className="space-y-1.5">
                  {club.recentPayments.map(p => (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {p.status === "paid"
                          ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          : p.status === "pending"
                          ? <Clock className="w-3.5 h-3.5 text-amber-400" />
                          : <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
                        <span className="text-gray-300">{p.description ?? "Pagamento"}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-white">€{p.amount.toFixed(2)}</span>
                        {p.paymentDate && (
                          <span className="text-xs text-gray-500 ml-2">
                            {new Date(p.paymentDate).toLocaleDateString("it-IT")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-600 border-t border-white/5 pt-3">Nessuna transazione registrata.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
