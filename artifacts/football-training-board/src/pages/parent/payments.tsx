import { useState, useEffect } from "react";
import { Banknote, CheckCircle, Clock, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string) {
  const res = await fetch(`${BASE}/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; icon: any; color: string }> = {
    paid: { label: "Pagata", icon: CheckCircle, color: "text-emerald-400" },
    pending: { label: "In sospeso", icon: Clock, color: "text-amber-400" },
    overdue: { label: "Scaduta", icon: AlertTriangle, color: "text-red-400" },
  };
  const s = map[status] ?? { label: status, icon: Clock, color: "text-muted-foreground" };
  const Icon = s.icon;
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${s.color}`}>
      <Icon className="w-3 h-3" /> {s.label}
    </span>
  );
}

export default function ParentPayments() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    apiFetch("/parent/payments")
      .then(data => {
        setPayments(data);
        if (data.length > 0) setExpanded({ [data[0].teamId]: true });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  const grouped = payments.reduce<Record<string, { teamName: string; teamId: number; items: any[] }>>((acc, p) => {
    const key = String(p.teamId ?? 0);
    if (!acc[key]) acc[key] = { teamName: p.teamName ?? "Senza squadra", teamId: p.teamId ?? 0, items: [] };
    acc[key].items.push(p);
    return acc;
  }, {});

  const groups = Object.values(grouped);

  function toggle(id: number) { setExpanded(prev => ({ ...prev, [id]: !prev[id] })); }

  const totalPending = payments.filter(p => p.status === "pending" || p.status === "overdue").length;
  const totalPaid = payments.filter(p => p.status === "paid").length;

  if (payments.length === 0) return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">Pagamenti</h1>
      <div className="text-center py-20 text-muted-foreground">
        <Banknote className="w-14 h-14 mx-auto mb-4 opacity-25" />
        <p className="font-semibold">Nessun pagamento registrato</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Pagamenti</h1>
        <p className="text-muted-foreground text-sm mt-1">{payments.length} voc{payments.length === 1 ? "e" : "i"} totali</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <CheckCircle className="w-5 h-5 text-emerald-400 mb-1" />
          <div className="text-2xl font-bold text-emerald-400">{totalPaid}</div>
          <div className="text-xs text-muted-foreground">Pagati</div>
        </div>
        <div className={`border rounded-xl p-4 ${totalPending > 0 ? "bg-red-500/10 border-red-500/20" : "bg-card"}`}>
          <AlertTriangle className={`w-5 h-5 mb-1 ${totalPending > 0 ? "text-red-400" : "text-muted-foreground"}`} />
          <div className={`text-2xl font-bold ${totalPending > 0 ? "text-red-400" : ""}`}>{totalPending}</div>
          <div className="text-xs text-muted-foreground">In sospeso</div>
        </div>
      </div>

      <div className="space-y-4">
        {groups.map(group => (
          <div key={group.teamId} className="bg-card border rounded-2xl overflow-hidden">
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => toggle(group.teamId)}
            >
              <div className="flex items-center gap-3">
                <Banknote className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-semibold">{group.teamName}</p>
                  <p className="text-xs text-muted-foreground">{group.items.length} voc{group.items.length === 1 ? "e" : "i"}</p>
                </div>
              </div>
              {expanded[group.teamId] ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>

            {expanded[group.teamId] && (
              <div className="border-t divide-y">
                {group.items.map(pmt => (
                  <div key={pmt.id} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{pmt.playerName ?? `Atleta ${pmt.playerId}`}</p>
                      <p className="text-xs text-muted-foreground">{pmt.description ?? pmt.type ?? "Pagamento"}</p>
                      {pmt.dueDate && (
                        <p className="text-xs text-muted-foreground">Scadenza: {new Date(pmt.dueDate).toLocaleDateString("it-IT")}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {pmt.amount && <p className="font-semibold text-sm">€{(pmt.amount / 100).toFixed(2)}</p>}
                      <StatusBadge status={pmt.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
