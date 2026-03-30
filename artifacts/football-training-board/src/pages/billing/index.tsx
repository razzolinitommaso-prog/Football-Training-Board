import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Zap, Users, UsersRound, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface Subscription { id: number; planName: string; status: string; startDate: string; endDate?: string; maxTeams: number; maxPlayers: number; currentTeams: number; currentPlayers: number; }
interface BillingPayment { id: number; amount: number; status: string; paymentDate?: string; description?: string; }

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

const PLANS = [
  { key: "basic", teams: 3, players: 50, price: "Free" },
  { key: "pro", teams: 10, players: 200, price: "€29/mo" },
  { key: "elite", teams: 99, players: 9999, price: "€99/mo" },
];

export default function BillingPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showSetup, setShowSetup] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("basic");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);

  const { data: sub, isLoading } = useQuery<Subscription | null>({ queryKey: ["/api/billing/subscription"], queryFn: () => apiFetch("/api/billing/subscription") });
  const { data: billingPayments = [] } = useQuery<BillingPayment[]>({ queryKey: ["/api/billing/payments"], queryFn: () => apiFetch("/api/billing/payments") });

  const setupSub = useMutation({
    mutationFn: (d: object) => apiFetch("/api/billing/subscription", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/billing/subscription"] }); setShowSetup(false); toast({ title: t.upgradePlan }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const planLabels: Record<string, string> = { basic: t.planBasic, pro: t.planPro, elite: t.planElite };
  const planColors: Record<string, string> = { basic: "text-slate-600", pro: "text-blue-600", elite: "text-amber-600" };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CreditCard className="w-6 h-6 text-primary" />{t.billing}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.billingDesc}</p>
        </div>
        <Button onClick={() => setShowSetup(true)} variant="outline">
          <Zap className="w-4 h-4 mr-2" />{sub ? t.upgradePlan : t.setupSubscription}
        </Button>
      </div>

      {isLoading ? <div className="text-center py-12 text-muted-foreground">{t.loading}</div>
        : !sub ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground space-y-4">
            <p>{t.noSubscription}</p>
            <Button onClick={() => setShowSetup(true)}>{t.setupSubscription}</Button>
          </CardContent></Card>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>{t.currentPlan}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className={`text-3xl font-bold ${planColors[sub.planName] ?? ""}`}>{planLabels[sub.planName] ?? sub.planName}</span>
                    <Badge variant={sub.status === "active" ? "default" : "secondary"}>{sub.status}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>{t.subscriptionStart}: {sub.startDate}</p>
                    {sub.endDate && <p>{t.subscriptionEnd}: {sub.endDate}</p>}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>{t.planUsage}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1"><UsersRound className="w-3 h-3" />{t.teamsUsed}</span>
                      <span>{sub.currentTeams} / {sub.maxTeams}</span>
                    </div>
                    <Progress value={(sub.currentTeams / sub.maxTeams) * 100} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{t.playersUsed}</span>
                      <span>{sub.currentPlayers} / {sub.maxPlayers}</span>
                    </div>
                    <Progress value={(sub.currentPlayers / sub.maxPlayers) * 100} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle>{t.billingPayments}</CardTitle></CardHeader>
              <CardContent>
                {billingPayments.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-4">{t.noBillingPayments}</p>
                ) : (
                  <div className="divide-y">
                    {billingPayments.map(bp => (
                      <div key={bp.id} className="flex items-center justify-between py-3 text-sm">
                        <div>
                          <p className="font-medium">{bp.description ?? "Billing Payment"}</p>
                          {bp.paymentDate && <p className="text-xs text-muted-foreground">{bp.paymentDate}</p>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">€{bp.amount.toFixed(2)}</span>
                          <Badge variant={bp.status === "paid" ? "default" : "secondary"}>{bp.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

      <Dialog open={showSetup} onOpenChange={setShowSetup}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{sub ? t.upgradePlan : t.setupSubscription}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3">
              {PLANS.map(plan => (
                <div key={plan.key} onClick={() => setSelectedPlan(plan.key)}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${selectedPlan === plan.key ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold capitalize">{planLabels[plan.key]}</p>
                      <p className="text-sm text-muted-foreground">{plan.teams} teams · {plan.players} players</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold">{plan.price}</span>
                      {selectedPlan === plan.key && <CheckCircle2 className="w-5 h-5 text-primary" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label>{t.startDate}</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowSetup(false)}>{t.cancel}</Button>
              <Button onClick={() => setupSub.mutate({ planName: selectedPlan, startDate })} disabled={setupSub.isPending}>
                {sub ? t.upgradePlan : t.setupSubscription}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
