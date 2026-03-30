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
import { FileText, Plus, Trash2, AlertTriangle } from "lucide-react";

interface Doc { id: number; playerId: number; playerName?: string; type: string; expiryDate?: string; notes?: string; }
interface Player { id: number; firstName: string; lastName: string; }

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

const DOC_TYPES = ["medicalCertificate", "idCard", "passport", "transferDoc"] as const;

function isExpiring(date?: string) {
  if (!date) return false;
  const exp = new Date(date); const now = new Date();
  const diff = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diff <= 30 && diff >= 0;
}

function isExpired(date?: string) {
  if (!date) return false;
  return new Date(date) < new Date();
}

export default function DocumentsPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [playerId, setPlayerId] = useState(""); const [type, setType] = useState("");
  const [expiryDate, setExpiryDate] = useState(""); const [notes, setNotes] = useState("");

  const { data: docs = [], isLoading } = useQuery<Doc[]>({ queryKey: ["/api/player-documents"], queryFn: () => apiFetch("/api/player-documents") });
  const { data: players = [] } = useQuery<Player[]>({ queryKey: ["/api/players"], queryFn: () => apiFetch("/api/players") });

  const create = useMutation({
    mutationFn: (d: object) => apiFetch("/api/player-documents", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/player-documents"] }); setOpen(false); setPlayerId(""); setType(""); setExpiryDate(""); setNotes(""); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/player-documents/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/player-documents"] }),
  });

  const expiring = docs.filter(d => isExpiring(d.expiryDate));
  const expired = docs.filter(d => isExpired(d.expiryDate) && !isExpiring(d.expiryDate));

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="w-6 h-6 text-primary" />{t.documents}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.documentsDesc}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />{t.addDocument}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t.addDocument}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); create.mutate({ playerId: Number(playerId), type, expiryDate: expiryDate || null, notes: notes || null }); }} className="space-y-4">
              <div className="space-y-2">
                <Label>{t.player}</Label>
                <Select value={playerId} onValueChange={setPlayerId}>
                  <SelectTrigger><SelectValue placeholder={t.selectPlayer ?? "Select player"} /></SelectTrigger>
                  <SelectContent>{players.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.firstName} {p.lastName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t.documentType}</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue placeholder={t.documentType} /></SelectTrigger>
                  <SelectContent>{DOC_TYPES.map(d => <SelectItem key={d} value={d}>{t[d as keyof typeof t] as string}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>{t.expiryDate}</Label><Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} /></div>
              <div className="space-y-2"><Label>{t.notes}</Label><Input value={notes} onChange={e => setNotes(e.target.value)} /></div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t.cancel}</Button>
                <Button type="submit" disabled={!playerId || !type || create.isPending}>{t.save}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {(expiring.length > 0 || expired.length > 0) && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm font-medium">
              <AlertTriangle className="w-4 h-4" />
              {expiring.length > 0 && <span>{expiring.length} documents expiring soon.</span>}
              {expired.length > 0 && <span>{expired.length} documents expired.</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? <div className="text-center py-12 text-muted-foreground">{t.loading}</div>
        : docs.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">{t.noDocuments}</CardContent></Card>
        : (
          <div className="grid gap-3">
            {docs.map((d) => {
              const expiring_ = isExpiring(d.expiryDate);
              const expired_ = isExpired(d.expiryDate) && !expiring_;
              return (
                <Card key={d.id} className={expired_ ? "border-red-300" : expiring_ ? "border-amber-300" : ""}>
                  <CardContent className="py-4 flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold">{d.playerName}</p>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <Badge variant="outline">{t[d.type as keyof typeof t] as string ?? d.type}</Badge>
                        {d.expiryDate && (
                          <span className={expired_ ? "text-red-500 font-medium" : expiring_ ? "text-amber-600 font-medium" : ""}>
                            {t.expiryDate}: {d.expiryDate} {expired_ ? "⚠️" : expiring_ ? "⚡" : ""}
                          </span>
                        )}
                        {d.notes && <span>{d.notes}</span>}
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" className="text-destructive h-8 w-8" onClick={() => remove.mutate(d.id)}><Trash2 className="w-4 h-4" /></Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
    </div>
  );
}
