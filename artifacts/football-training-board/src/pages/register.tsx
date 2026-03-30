import { useState } from "react";
import { Link, Redirect, useLocation } from "wouter";
import {
  Shield, Building2, Receipt, Phone, Mail, MapPin, User, ChevronRight,
  CheckCircle, Eye, EyeOff, Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { LanguageToggle } from "@/components/language-toggle";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const plans = [
  { value: "standard",  label: "Standard",  desc: "3 squadre · 50 giocatori",  color: "border-gray-500/30 bg-gray-500/5 hover:border-gray-400/50" },
  { value: "advanced",  label: "Advanced",  desc: "5 squadre · 100 giocatori", color: "border-blue-500/30 bg-blue-500/5 hover:border-blue-400/50" },
  { value: "semi-pro",  label: "Semi-Pro",  desc: "10 squadre · 200 giocatori",color: "border-purple-500/30 bg-purple-500/5 hover:border-purple-400/50" },
  { value: "pro",       label: "Pro",       desc: "Illimitato",                 color: "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-400/50" },
];

const paymentMethods = [
  { value: "bonifico", label: "Bonifico Bancario" },
  { value: "carta",    label: "Carta di Credito/Debito" },
  { value: "paypal",   label: "PayPal" },
  { value: "altro",    label: "Altro" },
];

type F = Record<string, string>;

function SectionHeader({ icon: Icon, label, color = "text-emerald-400" }: { icon: any; label: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-white/10 mb-4">
      <Icon className={`w-4 h-4 ${color}`} />
      <span className="text-sm font-semibold text-white">{label}</span>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-gray-400 text-xs font-medium uppercase tracking-wide">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

const inputCls = "bg-white/5 border-white/10 text-white placeholder:text-gray-600 text-sm h-9 focus:border-emerald-500/50";

export default function Register() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const [form, setForm] = useState<F>({
    firstName: "", lastName: "", email: "", password: "",
    clubName: "", legalName: "", city: "", country: "Italia",
    foundedYear: "", description: "",
    vatNumber: "", fiscalCode: "", sdiCode: "", pec: "",
    phone: "", clubEmail: "", website: "",
    legalAddress: "", legalCity: "", legalZip: "", legalProvince: "",
    operationalAddress: "", operationalCity: "", operationalZip: "", operationalProvince: "",
    contactName: "", contactPhone: "", contactEmail: "",
    planName: "standard", paymentMethod: "bonifico",
  });
  const [sameAddress, setSameAddress] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ accessCode: string; parentCode: string } | null>(null);

  if (user) return <Redirect to="/dashboard" />;

  function set(k: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));
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
    if (!form.firstName || !form.lastName || !form.email || !form.password || !form.clubName) {
      setError("Compila tutti i campi obbligatori (*).");
      return;
    }
    if (form.password.length < 6) {
      setError("La password deve essere di almeno 6 caratteri.");
      return;
    }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName,
          clubName: form.clubName,
          clubCity: form.city || undefined,
          clubCountry: form.country || undefined,
          legalName: form.legalName || undefined,
          foundedYear: form.foundedYear ? Number(form.foundedYear) : undefined,
          description: form.description || undefined,
          vatNumber: form.vatNumber || undefined,
          fiscalCode: form.fiscalCode || undefined,
          sdiCode: form.sdiCode || undefined,
          pec: form.pec || undefined,
          phone: form.phone || undefined,
          clubEmail: form.clubEmail || undefined,
          website: form.website || undefined,
          legalAddress: form.legalAddress || undefined,
          legalCity: form.legalCity || undefined,
          legalZip: form.legalZip || undefined,
          legalProvince: form.legalProvince || undefined,
          operationalAddress: form.operationalAddress || undefined,
          operationalCity: form.operationalCity || undefined,
          operationalZip: form.operationalZip || undefined,
          operationalProvince: form.operationalProvince || undefined,
          contactName: form.contactName || undefined,
          contactPhone: form.contactPhone || undefined,
          contactEmail: form.contactEmail || undefined,
          planName: form.planName,
          paymentMethod: form.paymentMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Registrazione fallita. Riprova."); return; }
      setSuccess({ accessCode: data.clubAccessCode, parentCode: data.clubParentCode ?? "" });
    } catch {
      setError("Errore di connessione. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
        <div className="max-w-lg w-full text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white">Società registrata!</h1>
            <p className="text-gray-400 mt-2">Il tuo account è stato creato con successo. Salva e condividi questi codici.</p>
          </div>

          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 space-y-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">🎽 Codice Accesso Staff / Gestionale</p>
            <div className="flex items-center justify-center gap-3">
              <span className="font-mono text-3xl font-bold text-emerald-400 tracking-widest">{success.accessCode}</span>
              <button onClick={() => navigator.clipboard.writeText(success.accessCode)} className="text-gray-500 hover:text-gray-300" title="Copia">
                <Copy className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500">Da condividere con tecnici, segreteria e dirigenza per l'accesso al gestionale.</p>
          </div>

          {success.parentCode && (
            <div className="bg-pink-500/10 border border-pink-500/20 rounded-2xl p-6 space-y-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">👨‍👩‍👧 Codice Accesso Genitori</p>
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-3">
                  <div className="text-center">
                    <p className="text-xs text-gray-600 mb-1">Codice Club</p>
                    <span className="font-mono text-xl font-bold text-pink-400 tracking-widest">{success.accessCode}</span>
                  </div>
                  <span className="text-gray-600 text-lg">+</span>
                  <div className="text-center">
                    <p className="text-xs text-gray-600 mb-1">Codice Genitori</p>
                    <span className="font-mono text-xl font-bold text-pink-400 tracking-widest">{success.parentCode}</span>
                  </div>
                  <button onClick={() => navigator.clipboard.writeText(`Club: ${success.accessCode} | Genitori: ${success.parentCode}`)} className="text-gray-500 hover:text-gray-300" title="Copia entrambi">
                    <Copy className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500">Da condividere con i genitori degli atleti per accedere all'<strong>Area Genitori</strong>.</p>
            </div>
          )}

          <div className="bg-white/5 rounded-xl p-4 text-left text-sm text-gray-400 space-y-1">
            <p>⚠️ <strong>Attenzione:</strong> conserva questi codici in un luogo sicuro.</p>
            <p>I codici genitori sono unici per la tua società e condivisi da tutti i genitori.</p>
          </div>

          <Button onClick={() => setLocation("/dashboard")} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-11 rounded-xl">
            Vai alla Dashboard <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="absolute top-4 right-4 z-20">
        <LanguageToggle />
      </div>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-600 shadow-2xl shadow-emerald-500/30 mb-4">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Registra la tua Società</h1>
          <p className="text-gray-500 mt-2">Crea il tuo account e inizia a gestire il tuo club su FTB</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* ACCOUNT AMMINISTRATORE */}
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
            <SectionHeader icon={User} label="Account Amministratore" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Nome" required>
                <Input value={form.firstName} onChange={set("firstName")} placeholder="Mario" className={inputCls} />
              </Field>
              <Field label="Cognome" required>
                <Input value={form.lastName} onChange={set("lastName")} placeholder="Rossi" className={inputCls} />
              </Field>
              <Field label="Email" required>
                <Input value={form.email} onChange={set("email")} type="email" placeholder="mario@club.it" className={inputCls} />
              </Field>
              <Field label="Password" required>
                <div className="relative">
                  <Input value={form.password} onChange={set("password")} type={showPw ? "text" : "password"} placeholder="Min. 6 caratteri" className={`${inputCls} pr-10`} />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>
            </div>
          </div>

          {/* DATI PRINCIPALI SOCIETÀ */}
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
            <SectionHeader icon={Building2} label="Dati Principali Società" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Nome Società" required>
                <Input value={form.clubName} onChange={set("clubName")} placeholder="Es. ASD Fiorentina" className={inputCls} />
              </Field>
              <Field label="Ragione Sociale">
                <Input value={form.legalName} onChange={set("legalName")} placeholder="Ragione sociale completa" className={inputCls} />
              </Field>
              <Field label="Città">
                <Input value={form.city} onChange={set("city")} placeholder="Es. Firenze" className={inputCls} />
              </Field>
              <Field label="Paese">
                <Input value={form.country} onChange={set("country")} placeholder="Es. Italia" className={inputCls} />
              </Field>
              <Field label="Anno Fondazione">
                <Input value={form.foundedYear} onChange={set("foundedYear")} type="number" placeholder="Es. 1926" className={inputCls} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Descrizione">
                <Textarea value={form.description} onChange={set("description")} rows={2} placeholder="Descrizione del club..." className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 text-sm resize-none" />
              </Field>
            </div>
          </div>

          {/* DATI FISCALI */}
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
            <SectionHeader icon={Receipt} label="Dati Fiscali & Fatturazione" color="text-purple-400" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Partita IVA">
                <Input value={form.vatNumber} onChange={set("vatNumber")} placeholder="IT12345678901" className={inputCls} />
              </Field>
              <Field label="Codice Fiscale">
                <Input value={form.fiscalCode} onChange={set("fiscalCode")} placeholder="RSSSMN80A01H501U" className={inputCls} />
              </Field>
              <Field label="Codice SDI (Fatturazione Elettronica)">
                <Input value={form.sdiCode} onChange={set("sdiCode")} placeholder="Es. XXXXXXX (7 caratteri)" maxLength={7} className={inputCls} />
              </Field>
              <Field label="PEC">
                <Input value={form.pec} onChange={set("pec")} type="email" placeholder="pec@example.it" className={inputCls} />
              </Field>
            </div>
          </div>

          {/* CONTATTI */}
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
            <SectionHeader icon={Phone} label="Contatti Principali" color="text-blue-400" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Telefono">
                <Input value={form.phone} onChange={set("phone")} placeholder="+39 055 000000" className={inputCls} />
              </Field>
              <Field label="Email Società">
                <Input value={form.clubEmail} onChange={set("clubEmail")} type="email" placeholder="info@club.it" className={inputCls} />
              </Field>
              <Field label="Sito Web">
                <Input value={form.website} onChange={set("website")} placeholder="https://www.club.it" className={inputCls} />
              </Field>
            </div>
          </div>

          {/* SEDE LEGALE */}
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
            <SectionHeader icon={MapPin} label="Sede Legale" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Field label="Indirizzo">
                  <Input value={form.legalAddress} onChange={set("legalAddress")} placeholder="Via Roma 1" className={inputCls} />
                </Field>
              </div>
              <Field label="Città">
                <Input value={form.legalCity} onChange={set("legalCity")} placeholder="Firenze" className={inputCls} />
              </Field>
              <Field label="CAP">
                <Input value={form.legalZip} onChange={set("legalZip")} placeholder="50100" maxLength={5} className={inputCls} />
              </Field>
              <Field label="Provincia">
                <Input value={form.legalProvince} onChange={set("legalProvince")} placeholder="FI" maxLength={2} className={`${inputCls} uppercase`} />
              </Field>
            </div>
          </div>

          {/* SEDE OPERATIVA */}
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
            <SectionHeader icon={MapPin} label="Sede Operativa" color="text-amber-400" />
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-400 hover:text-gray-300 mb-4">
              <input type="checkbox" checked={sameAddress} onChange={e => handleSameAddress(e.target.checked)} className="accent-emerald-500" />
              Stessa della sede legale
            </label>
            {!sameAddress && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Field label="Indirizzo">
                    <Input value={form.operationalAddress} onChange={set("operationalAddress")} placeholder="Via Stadio 1" className={inputCls} />
                  </Field>
                </div>
                <Field label="Città">
                  <Input value={form.operationalCity} onChange={set("operationalCity")} placeholder="Firenze" className={inputCls} />
                </Field>
                <Field label="CAP">
                  <Input value={form.operationalZip} onChange={set("operationalZip")} placeholder="50100" maxLength={5} className={inputCls} />
                </Field>
                <Field label="Provincia">
                  <Input value={form.operationalProvince} onChange={set("operationalProvince")} placeholder="FI" maxLength={2} className={`${inputCls} uppercase`} />
                </Field>
              </div>
            )}
          </div>

          {/* REFERENTE */}
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
            <SectionHeader icon={Mail} label="Referente Principale" color="text-cyan-400" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Nome Referente">
                <Input value={form.contactName} onChange={set("contactName")} placeholder="Mario Rossi" className={inputCls} />
              </Field>
              <Field label="Telefono">
                <Input value={form.contactPhone} onChange={set("contactPhone")} placeholder="+39 333 000000" className={inputCls} />
              </Field>
              <Field label="Email">
                <Input value={form.contactEmail} onChange={set("contactEmail")} type="email" placeholder="m.rossi@club.it" className={inputCls} />
              </Field>
            </div>
          </div>

          {/* PIANO & PAGAMENTO */}
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
            <SectionHeader icon={Receipt} label="Piano & Metodo di Pagamento" color="text-emerald-400" />
            <div className="space-y-5">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">Scegli il Piano</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {plans.map(p => (
                    <label
                      key={p.value}
                      className={`cursor-pointer rounded-xl border-2 p-4 text-center transition-all ${
                        form.planName === p.value
                          ? "border-emerald-500 bg-emerald-500/10"
                          : p.color
                      }`}
                    >
                      <input type="radio" name="plan" value={p.value} checked={form.planName === p.value}
                        onChange={() => setForm(prev => ({ ...prev, planName: p.value }))} className="sr-only" />
                      <div className="font-bold text-white text-sm">{p.label}</div>
                      <div className="text-xs text-gray-400 mt-1">{p.desc}</div>
                      {form.planName === p.value && <div className="mt-2"><CheckCircle className="w-4 h-4 text-emerald-400 mx-auto" /></div>}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">Metodo di Pagamento</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {paymentMethods.map(pm => (
                    <label
                      key={pm.value}
                      className={`cursor-pointer rounded-xl border px-4 py-3 text-center text-sm transition-all ${
                        form.paymentMethod === pm.value
                          ? "border-emerald-500 bg-emerald-500/10 text-white font-semibold"
                          : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20"
                      }`}
                    >
                      <input type="radio" name="payment" value={pm.value} checked={form.paymentMethod === pm.value}
                        onChange={() => setForm(prev => ({ ...prev, paymentMethod: pm.value }))} className="sr-only" />
                      {pm.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between pb-8">
            <p className="text-sm text-gray-500">
              Hai già un account?{" "}
              <Link href="/login" className="text-emerald-400 hover:text-emerald-300 font-medium">Accedi</Link>
            </p>
            <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-12 px-8 rounded-xl text-base gap-2">
              {loading ? (
                <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : <ChevronRight className="w-5 h-5" />}
              {loading ? "Registrazione in corso..." : "Registra la Società"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
