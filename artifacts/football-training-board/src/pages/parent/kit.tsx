import { useEffect, useState } from "react";
import { CheckCircle2, Package, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { withApi } from "@/lib/api-base";

async function apiFetch(path: string) {
  const res = await fetch(withApi(`/api${path}`), { credentials: "include" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function parseKit(raw: string | null | undefined) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function ParentKit() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/parent/kit")
      .then(setItems)
      .catch((error) => { if (import.meta.env.DEV) console.error(error); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>;

  const rows = items.flatMap((item) => parseKit(item.trainingKit).map((row: any) => ({ ...row, playerName: item.playerName, teamName: item.teamName })))
    .filter((row) => row.listItemId || row.price || row.quantity);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Kit</h1>
        <p className="mt-1 text-sm text-muted-foreground">Materiale assegnato o in preparazione. I prezzi restano riservati alla societa.</p>
      </div>

      {rows.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <Package className="mx-auto mb-4 h-14 w-14 opacity-25" />
          <p className="font-semibold">Nessun kit registrato</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => {
            const ready = row.arrived === true;
            return (
              <div key={`${row.key}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4">
                <div className="min-w-0">
                  <p className="font-semibold">{row.label ?? "Articolo kit"}</p>
                  <p className="text-xs text-muted-foreground">{row.teamName ?? row.playerName}</p>
                  <p className="text-xs text-muted-foreground">{row.quantity ? `${row.quantity} pz` : "1 pz"}</p>
                </div>
                <Badge variant={ready ? "default" : "secondary"} className="gap-1">
                  {ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  {ready ? "Pronto" : "In preparazione"}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
