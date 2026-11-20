import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { suggestKitSlots, describeKitVariant } from "@workspace/api-zod";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import {
  memberApi,
  type MemberKit,
  type MemberKitLine,
} from "@/lib/member-services";
type Item = {
  id: number;
  name: string;
  size: string | null;
  code: string;
  category: string | null;
  notes: string | null;
  kitSlots: string[] | null;
  quantityAvailable: number;
  quantityReserved: number;
};
const statuses: Record<string, string> = {
  pending: "Da ordinare",
  reserved: "Riservato",
  ordered: "Ordinato",
  arrived: "Arrivato",
  delivered: "Consegnato",
  canceled: "Annullato",
};
export function MemberKitRequests({ userId }: { userId?: number }) {
  const { club, user, role } = useAuth(),
    cache = useQueryClient(),
    { toast } = useToast(),
    canEdit = role === "secretary";
  const [view, setView] = useState("open");
  const query = useQuery({
    queryKey: ["member-services", club?.id, user?.id, role, "kit-requests"],
    queryFn: () => memberApi<MemberKitLine[]>("/kit-requests"),
  });
  const save = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      memberApi(`/kit-requests/${id}`, "PATCH", { status }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["member-services"] });
      void cache.invalidateQueries({ queryKey: ["/api/warehouse-items"] });
      toast({ title: "Richiesta KIT membro aggiornata" });
    },
    onError: (e) =>
      toast({
        title: "Richiesta non aggiornata",
        description: e.message,
        variant: "destructive",
      }),
  });
  const rows = (query.data ?? []).filter(
    (r) =>
      (!userId || r.userId === userId) &&
      (view === "all" ||
        (!r.archived && !["delivered", "canceled"].includes(r.status))),
  );
  return (
    <div className="space-y-3 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Richieste KIT membri · magazzino</h3>
        <ScrollableSelect
          aria-label="Stato richieste KIT membri"
          value={view}
          onValueChange={setView}
        >
          <option value="open">Aperte</option>
          <option value="all">Tutte, comprese consegne e storico</option>
        </ScrollableSelect>
      </div>
      {query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {query.error.message}
        </p>
      ) : query.isPending ? (
        <p>Caricamento richieste…</p>
      ) : !rows.length ? (
        <p className="text-sm text-muted-foreground">
          Nessuna richiesta per questa vista.
        </p>
      ) : (
        rows.map((line) => {
          const next =
            line.status === "pending"
              ? "ordered"
              : line.status === "ordered"
                ? "arrived"
                : ["reserved", "arrived"].includes(line.status)
                  ? "delivered"
                  : null;
          return (
            <div
              key={line.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {line.name} · {line.itemName}
                </p>
                <p className="text-xs text-muted-foreground">
                  Richiesta #{line.id} · {line.size || "Taglia non indicata"} ·
                  quantità {line.quantity} · {statuses[line.status]}
                  {line.archived ? " · storico" : ""}
                </p>
              </div>
              {canEdit && !line.archived && (
                <div className="flex flex-wrap gap-2">
                  {next && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={save.isPending}
                      onClick={() => {
                        if (
                          next !== "delivered" ||
                          window.confirm(
                            `Confermare la consegna di ${line.quantity} pezzi a ${line.name}? La giacenza e la riserva saranno scaricate una sola volta.`,
                          )
                        )
                          save.mutate({ id: line.id, status: next });
                      }}
                    >
                      {next === "ordered"
                        ? "Segna ordinato"
                        : next === "arrived"
                          ? "Registra arrivo"
                          : "Consegna e scarica"}
                    </Button>
                  )}
                  {!["delivered", "canceled"].includes(line.status) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={save.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Annullare la richiesta e liberare gli eventuali pezzi riservati?",
                          )
                        )
                          save.mutate({ id: line.id, status: "canceled" });
                      }}
                    >
                      Annulla richiesta
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
      <p className="text-xs text-muted-foreground">
        La richiesta riserva solo i pezzi presenti. L’arrivo aumenta la giacenza
        e la riserva; la consegna le scarica entrambe. Magazzino condiviso con i
        giocatori.
      </p>
    </div>
  );
}
function MemberKitSlot({
  userId,
  slot,
  label,
  row,
  items,
  requests,
  canEdit,
}: {
  userId: number;
  slot: string;
  label: string;
  row?: MemberKit["rows"][number];
  items: Item[];
  requests: MemberKitLine[];
  canEdit: boolean;
}) {
  const [itemId, setItemId] = useState(row ? String(row.itemId) : ""),
    [quantity, setQuantity] = useState(String(row?.quantity ?? 1)),
    cache = useQueryClient(),
    { toast } = useToast();
  const variants = items.filter((item) =>
    (item.kitSlots ?? suggestKitSlots(item)).includes(slot),
  );
  const lines = requests.filter(
    (r) => r.slot === slot && !r.archived && r.status !== "canceled",
  );
  const save = useMutation({
    mutationFn: (action: "save" | "request" | "new-cycle") =>
      action === "save"
        ? memberApi(`/${userId}/kit/${encodeURIComponent(slot)}`, "PUT", {
            itemId: Number(itemId),
            quantity: Number(quantity),
            revision: row?.revision ?? 0,
          })
        : memberApi(
            `/${userId}/kit/${encodeURIComponent(slot)}/${action}`,
            "POST",
            action === "request" ? { revision: row?.revision } : {},
          ),
    onSuccess: (_, action) => {
      void cache.invalidateQueries({ queryKey: ["member-services"] });
      void cache.invalidateQueries({ queryKey: ["/api/warehouse-items"] });
      toast({
        title:
          action === "save"
            ? "Voce KIT salvata"
            : action === "request"
              ? "Richiesta al magazzino registrata"
              : "Nuova dotazione pronta",
        description:
          action === "new-cycle"
            ? "La consegna precedente resta nello storico."
            : undefined,
      });
    },
    onError: (e) =>
      toast({
        title: "KIT non aggiornato",
        description: e.message,
        variant: "destructive",
      }),
  });
  const changed =
      itemId !== String(row?.itemId ?? "") ||
      Number(quantity) !== (row?.quantity ?? 1),
    allDelivered =
      lines.length > 0 && lines.every((r) => r.status === "delivered");
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium">{label}</h4>
        <span className="text-xs text-muted-foreground">
          {lines.length
            ? lines
                .map((l) => `${statuses[l.status]}: ${l.quantity}`)
                .join(" · ")
            : row
              ? "Collegato · non richiesto"
              : "Non registrato"}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem]">
        <label className="min-w-0 text-xs">
          Articolo e taglia
          <ScrollableSelect
            aria-label={`Articolo ${label}`}
            className="w-full"
            value={itemId}
            disabled={!canEdit || save.isPending}
            onValueChange={setItemId}
          >
            <option value="">Seleziona una variante del catalogo</option>
            {row && !variants.some((v) => v.id === row.itemId) && (
              <option value={String(row.itemId)}>
                {row.itemName} · {row.size} · storico
              </option>
            )}
            {variants.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {describeKitVariant(item)} · disponibili{" "}
                {Math.max(0, item.quantityAvailable - item.quantityReserved)}
              </option>
            ))}
          </ScrollableSelect>
        </label>
        <label className="text-xs">
          Quantità
          <Input
            type="number"
            min={1}
            max={1000}
            step={1}
            value={quantity}
            disabled={!canEdit || save.isPending}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={save.isPending || !itemId || !changed}
            onClick={() => save.mutate("save")}
          >
            Salva voce
          </Button>
          {row && !lines.length && (
            <Button
              type="button"
              size="sm"
              disabled={save.isPending || changed}
              onClick={() => save.mutate("request")}
            >
              Richiedi al magazzino
            </Button>
          )}
          {allDelivered && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={save.isPending || changed}
              onClick={() => {
                if (
                  window.confirm(
                    "Preparare una nuova dotazione per questa voce? Le consegne precedenti resteranno nello storico.",
                  )
                )
                  save.mutate("new-cycle");
              }}
            >
              Nuova dotazione
            </Button>
          )}
        </div>
      )}
      {save.isError && (
        <p role="alert" className="text-xs text-destructive">
          {save.error.message}
        </p>
      )}
    </div>
  );
}
export function MemberKitPanel({
  userId,
  slots,
}: {
  userId: number;
  slots: { key: string; label: string }[];
}) {
  const { club, user, role } = useAuth();
  const kit = useQuery({
    queryKey: ["member-services", club?.id, user?.id, role, "kit", userId],
    queryFn: () => memberApi<MemberKit>(`/${userId}/kit`),
  });
  const catalog = useQuery({
    queryKey: ["member-services", club?.id, user?.id, role, "kit-catalog"],
    queryFn: () => memberApi<Item[]>("/kit-catalog"),
  });
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-muted/40 p-3 text-sm">
        {slots.length
          ? "Dotazione unica personale secondo i ruoli attivi. Gli articoli GARA sono esclusi. Dirigenti e collaboratori: rappresentanza; allenamento solo per incarichi sportivi abilitati."
          : "Presidente e Segreteria sono esclusi dalle nuove dotazioni KIT. Le consegne e richieste precedenti rimangono nello storico."}
      </p>
      {kit.isError || catalog.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {kit.error?.message ?? catalog.error?.message}
        </p>
      ) : kit.isPending || catalog.isPending ? (
        <p>Caricamento dotazione…</p>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {slots.map((slot) => (
              <MemberKitSlot
                key={`${userId}:${slot.key}:${kit.data.rows.find((r) => r.slot === slot.key)?.revision ?? 0}`}
                userId={userId}
                slot={slot.key}
                label={slot.label}
                row={kit.data.rows.find((r) => r.slot === slot.key)}
                requests={kit.data.requests}
                items={catalog.data}
                canEdit={kit.data.canEdit}
              />
            ))}
          </div>
          {kit.data.rows.some((r) => !slots.some((s) => s.key === r.slot)) && (
            <details className="rounded-lg border p-3">
              <summary>Voci precedenti, non previste dai ruoli attuali</summary>
              {kit.data.rows
                .filter((r) => !slots.some((s) => s.key === r.slot))
                .map((r) => (
                  <p key={r.slot} className="mt-2 text-sm">
                    {r.itemName} · {r.size} · quantità {r.quantity}
                  </p>
                ))}
            </details>
          )}
        </>
      )}
      <MemberKitRequests userId={userId} />
    </div>
  );
}
