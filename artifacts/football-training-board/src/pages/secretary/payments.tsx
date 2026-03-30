import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Banknote, Plus, Trash2, Euro } from "lucide-react";

interface Payment { id: number; playerId: number; playerName?: string; amount: number; status: string; dueDate?: string; paymentDate?: string; description?: string; }
interface Player { id: number; firstName: string; lastName: string; }

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  paid: "default", pending: "secondary", overdue: "destructive",
};

export default function PaymentsPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [playerId, setPlayerId] = useState(""); const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("pending"); const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");

  const { data: payments = [], isLoading } = useQuery<Payment[]>({ queryKey: ["/api/player-payments"], queryFn: () => apiFetch("/api/player-payments") });
  const { data: players = [] } = useQuery<Player[]>({ queryKey: ["/api/players"], queryFn: () => apiFetch("/api/players") });

  const create = useMutation({
    mutationFn: (d: object) => apiFetch("/api/player-payments", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/player-payments"] }); setOpen(false); setPlayerId(""); setAmount(""); setStatus("pending"); setDueDate(""); setDescription(""); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const patch = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiFetch(`/api/player-payments/${id}`, { method: "PATCH", body: JSON.stringify({ status, paymentDate: status === "paid" ? new Date().toISOString().split("T")[0] : null }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/player-payments"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/player-payments/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/player-payments"] }),
  });

  const total = payments.reduce((acc, p) => acc + p.amount, 0);
  const collected = payments.filter(p => p.status === "paid").reduce((acc, p) => acc + p.amount, 0);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Banknote className="w-6 h-6 text-primary" />{t.payments}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.paymentsDesc}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />{t.addPayment}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t.addPayment}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); create.mutate({ playerId: Number(playerId), amount: Number(amount), status, dueDate: dueDate || null, description: description || null }); }} className="space-y-4">
              <div className="space-y-2">
                <Label>{t.player}</Label>
                <Select value={playerId} onValueChange={setPlayerId}>
                  <SelectTrigger><SelectValue placeholder={t.selectPlayer ?? "Select player"} /></SelectTrigger>
                  <SelectContent>{players.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.firstName} {p.lastName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>{t.amount}</Label><Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required /></div>
                <div className="space-y-2"><Label>{t.dueDate}</Label><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.paymentStatus}</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">{t.pending}</SelectItem>
                      <SelectItem value="paid">{t.paid}</SelectItem>
                      <SelectItem value="overdue">{t.overdue}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>{t.description}</Label><Input value={description} onChange={e => setDescription(e.target.value)} /></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t.cancel}</Button>
                <Button type="submit" disabled={!playerId || !amount || create.isPending}>{t.save}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {payments.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[{ label: t.amount, value: `€${total.toFixed(2)}`, cls: "" }, { label: t.paid, value: `€${collected.toFixed(2)}`, cls: "text-green-600" }, { label: t.overdue, value: `€${(total - collected).toFixed(2)}`, cls: "text-red-500" }].map(stat => (
            <Card key={stat.label}><CardContent className="py-4 text-center"><p className="text-xs text-muted-foreground">{stat.label}</p><p className={`text-xl font-bold ${stat.cls}`}>{stat.value}</p></CardContent></Card>
          ))}
        </div>
      )}

      {isLoading ? <div className="text-center py-12 text-muted-foreground">{t.loading}</div>
        : payments.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">{t.noPayments}</CardContent></Card>
        : (
          <div className="grid gap-3">
            {payments.map((p) => (
              <Card key={p.id}>
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-semibold">{p.playerName}</p>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground flex items-center gap-1"><Euro className="w-3 h-3" />{p.amount.toFixed(2)}</span>
                      <Badge variant={statusVariant[p.status] ?? "secondary"}>{p.status}</Badge>
                      {p.dueDate && <span>{t.dueDate}: {p.dueDate}</span>}
                      {p.description && <span>{p.description}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={p.status} onValueChange={(v) => patch.mutate({ id: p.id, status: v })}>
                      <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">{t.pending}</SelectItem>
                        <SelectItem value="paid">{t.paid}</SelectItem>
                        <SelectItem value="overdue">{t.overdue}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" className="text-destructive h-8 w-8" onClick={() => remove.mutate(p.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
    </div>
  );
}
