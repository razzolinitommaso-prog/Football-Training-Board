import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react/custom-fetch";
import { KIT_REQUEST_STATUS, PAYMENT_KIT_SLOTS, paymentKitSlot, type KitRequestLine, type KitRow } from "@workspace/api-zod";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import { paymentStatus, paymentStatuses, paymentStatusTone, type PaymentKitArticle } from "@/lib/payment-summary";
import { trainingLocalDate } from "@workspace/api-zod";

type Order = { payment: { id: number; playerId: number; amount: number; status: string; dueDate?: string | null }; article: PaymentKitArticle; row: KitRow | null; requests: KitRequestLine[] };
const money = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
export const kitOrderCacheKeys = ["/api/player-payment-kit-order", "/api/player-payments", "/api/equipment", "/api/warehouse-kit-requests", "/api/warehouse-items", "/api/parent/kit"];

export function PaymentKitOrderButton({ paymentId, initiallyOpen = false, label = "Gestisci kit e Magazzino" }: { paymentId: number; initiallyOpen?: boolean; label?: string }) {
  const [open, setOpen] = useState(initiallyOpen);
  return <><Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>{label}</Button>
    {open && <PaymentKitOrderDialog paymentId={paymentId} onClose={() => setOpen(false)} />}</>;
}

export function PaymentKitOrderDialog({ paymentId, onClose }: { paymentId: number; onClose: () => void }) {
  const { club, user, role } = useAuth();
  const canEdit = role === "secretary";
  const cache = useQueryClient();
  const [slot, setSlot] = useState<string>();
  const [quantity, setQuantity] = useState<string>();
  const [delivery, setDelivery] = useState<number>();
  const query = useQuery({ queryKey: ["/api/player-payment-kit-order", club?.id, user?.id, role, paymentId],
    queryFn: () => customFetch<Order>(`/api/player-payments/${paymentId}/kit-order`), refetchOnWindowFocus: true });
  const order = query.data;
  const row = order?.row;
  const slotKey = slot ?? row?.slotKey ?? (order ? paymentKitSlot(order.article) : "other");
  const pieces = quantity ?? row?.quantity ?? "1";
  const requests = order?.requests ?? [];
  const changed = !row || String(row.quantity) !== pieces || row.slotKey !== slotKey;
  const state = order && paymentStatus(order.payment, trainingLocalDate());
  const save = useMutation({ mutationFn: ({ path, body }: { path: string; body: object }) => customFetch(path, { method: path.includes("/warehouse-kit-requests/") ? "PATCH" : "POST", body: JSON.stringify(body) }),
    onSuccess: async () => { setDelivery(undefined); await Promise.all(kitOrderCacheKeys.map(key => cache.invalidateQueries({ queryKey: [key] }))); } });
  const action = (path: string, body: object) => { if (!save.isPending) save.mutate({ path, body }); };
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>Articolo kit · Pagamento e Magazzino</DialogTitle></DialogHeader>
      {query.isPending && <p className="text-sm">Caricamento articolo e richiesta…</p>}
      {query.isError && <p role="alert" className="text-sm text-destructive">{query.error.message} <button type="button" className="underline" onClick={() => void query.refetch()}>Riprova</button></p>}
      {order && <div className="space-y-4">
        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <p className="font-semibold">{order.article.name}</p>
          <p className="text-sm text-muted-foreground">{[order.article.size && `Taglia ${order.article.size}`, order.article.code].filter(Boolean).join(" · ")}</p>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className={"rounded-full border px-2 py-0.5 " + paymentStatusTone[state!]}>{paymentStatuses[state!]}</span><strong>{money.format(order.payment.amount)}</strong></div>
          <p className="text-xs text-muted-foreground">Pagamento e consegna hanno stati distinti. Le operazioni qui aggiornano anche la scheda giocatore.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
          <label className="text-sm">Voce nella scheda Kit<ScrollableSelect aria-label="Voce nella scheda Kit" className="mt-1 w-full" value={slotKey} disabled={!canEdit || save.isPending || !!requests.length} onValueChange={setSlot}>
            <option value="other">Articolo aggiuntivo</option>{PAYMENT_KIT_SLOTS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
          </ScrollableSelect></label>
          <label className="text-sm">Pezzi<Input className="mt-1" type="number" min={1} max={1000} step={1} value={pieces} disabled={!canEdit || save.isPending || !!requests.length} onChange={event => setQuantity(event.target.value)} /></label>
        </div>
        {canEdit && changed && <Button type="button" disabled={save.isPending || !Number.isSafeInteger(Number(pieces)) || Number(pieces) < 1 || Number(pieces) > 1000}
          onClick={() => action(`/api/player-payments/${paymentId}/kit-order`, { slotKey, quantity: Number(pieces) })}>{row ? "Aggiorna articolo nel kit" : "Allinea articolo alla scheda Kit"}</Button>}
        {row && <p className="text-xs text-emerald-700">Articolo registrato nella scheda giocatore. Il pagamento esistente è conservato.</p>}
        <section className="space-y-3 rounded-lg border p-3" aria-label="Stato richiesta Magazzino">
          <h3 className="text-sm font-semibold">Richiesta, ordine e consegna</h3>
          {requests.length === 0 ? <>
            <p className="text-sm text-muted-foreground">Nessuna richiesta inviata. I pezzi disponibili saranno riservati; quelli mancanti andranno in «Da ordinare».</p>
            {canEdit && <Button type="button" disabled={save.isPending || changed} onClick={() => action("/api/warehouse-kit-requests", { playerId: order.payment.playerId, rowKey: row!.key, itemIds: [Number(row!.listItemId)], quantity: Number(row!.quantity) })}>Richiedi a Magazzino</Button>}
          </> : <ul className="divide-y">{requests.map(line => <li key={line.id} className="space-y-2 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{KIT_REQUEST_STATUS[line.status]}</span><strong>{line.quantity} {line.quantity === 1 ? "pezzo" : "pezzi"}</strong></div>
            {canEdit && <div className="flex flex-wrap gap-2">
              {line.status === "pending" && <Button type="button" size="sm" disabled={save.isPending} onClick={() => action(`/api/warehouse-kit-requests/${line.id}`, { status: "ordered" })}>Segna ordinato</Button>}
              {line.status === "ordered" && <Button type="button" size="sm" disabled={save.isPending} onClick={() => action(`/api/warehouse-kit-requests/${line.id}`, { status: "arrived" })}>Registra arrivo</Button>}
              {["reserved", "arrived"].includes(line.status) && delivery !== line.id && <Button type="button" size="sm" disabled={save.isPending} onClick={() => setDelivery(line.id)}>Registra consegna</Button>}
              {["pending", "reserved"].includes(line.status) && delivery !== line.id && <Button type="button" size="sm" variant="outline" disabled={save.isPending} onClick={() => action(`/api/warehouse-kit-requests/${line.id}`, { status: "canceled" })}>Annulla richiesta</Button>}
              {delivery === line.id && <div className="w-full space-y-2 rounded-lg bg-muted p-3"><p className="text-sm">Confermi la consegna di {line.quantity} pezzi? La giacenza sarà scaricata.</p><div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={save.isPending} onClick={() => action(`/api/warehouse-kit-requests/${line.id}`, { status: "delivered" })}>Conferma consegna e scarico</Button><Button type="button" variant="outline" size="sm" disabled={save.isPending} onClick={() => setDelivery(undefined)}>Annulla</Button></div></div>}
            </div>}
          </li>)}</ul>}
        </section>
        {save.isError && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
        {save.isPending && <p role="status" className="text-sm">Aggiornamento in corso…</p>}
      </div>}
    </DialogContent>
  </Dialog>;
}
