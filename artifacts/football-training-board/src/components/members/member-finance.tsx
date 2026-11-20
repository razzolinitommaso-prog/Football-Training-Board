import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  memberContractInput,
  memberFmDate,
  memberInstallments,
  memberRoleLabels,
  trainingLocalDate,
  type MemberContract,
} from "@workspace/api-zod";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocumentFilePicker } from "@/components/document-file-picker";
import { readDocumentFile, downloadDocument } from "@/lib/document-files";
import { exportMultiSheet } from "@/lib/excel-export";
import { buildTextPdfBlob } from "@/lib/callup-pdf";
import {
  memberApi,
  memberAmountText,
  memberDay,
  memberMoney,
  memberMethodLabels,
  parseMemberMoney,
  type MemberIndex,
  type MemberProfile,
  type MemberDue,
  type MemberExpenses,
} from "@/lib/member-services";

export function MemberMoneyInput({
  value,
  onChange,
  disabled,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <label className="min-w-0 space-y-1 text-sm">
      {label}
      <Input
        aria-label={label}
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          const n = parseMemberMoney(value);
          if (Number.isFinite(n)) onChange(memberAmountText(n));
        }}
      />
    </label>
  );
}
export function MemberAttachment({
  userId,
  kind,
  onUploaded,
}: {
  userId: number;
  kind: "medical" | "contract" | "receipt";
  onUploaded: (id: number) => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    { toast } = useToast(),
    cache = useQueryClient();
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Scegli un documento.");
      return memberApi<{ id: number }>(`/${userId}/documents`, "POST", {
        kind,
        ...(await readDocumentFile(file)),
      });
    },
    onSuccess: (r) => {
      onUploaded(r.id);
      setFile(null);
      void cache.invalidateQueries({ queryKey: ["member-services"] });
      toast({
        title: "Documento caricato",
        description: "Salva la scheda o l’incarico per collegarlo.",
      });
    },
    onError: (e) =>
      toast({
        title: "Documento non caricato",
        description: e.message,
        variant: "destructive",
      }),
  });
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <DocumentFilePicker
        file={file}
        onChange={setFile}
        disabled={upload.isPending}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!file || upload.isPending}
        onClick={() => upload.mutate()}
      >
        {upload.isPending ? "Caricamento…" : "Carica documento"}
      </Button>
      {upload.isError && (
        <p role="alert" className="text-sm text-destructive">
          {upload.error.message}
        </p>
      )}
    </div>
  );
}
export function MemberDocumentButton({
  userId,
  id,
  label,
}: {
  userId: number;
  id: number;
  label: string;
}) {
  const { toast } = useToast(),
    [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const f = await memberApi<{ fileData: string; fileName: string }>(
            `/${userId}/documents/${id}`,
          );
          downloadDocument(f.fileData, f.fileName);
        } catch (e) {
          toast({
            title: "Documento non disponibile",
            description: (e as Error).message,
            variant: "destructive",
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Preparazione…" : label}
    </Button>
  );
}

export function MemberContractEditor({
  userId,
  initial,
  index,
  documents,
  onClose,
}: {
  userId: number;
  initial: MemberContract;
  index: MemberIndex;
  documents: MemberProfile["documents"];
  onClose: () => void;
}) {
  const [c, setC] = useState(initial),
    [compensation, setCompensation] = useState(
      memberAmountText(initial.compensationCents),
    ),
    [reimbursement, setReimbursement] = useState(
      memberAmountText(initial.reimbursementCents),
    ),
    [error, setError] = useState("");
  const { toast } = useToast(),
    cache = useQueryClient();
  const patch = (p: Partial<MemberContract>) => setC((v) => ({ ...v, ...p }));
  const save = useMutation({
    mutationFn: (body: MemberContract) =>
      memberApi(`/${userId}/contracts/${body.id}`, "PUT", body),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["member-services"] });
      toast({ title: "Incarico e piano uscite salvati" });
      onClose();
    },
    onError: (e) => setError(e.message),
  });
  const candidate = {
    ...c,
    compensationCents: parseMemberMoney(compensation),
    reimbursementCents: parseMemberMoney(reimbursement),
  };
  const parsed = memberContractInput.safeParse(candidate),
    plan = parsed.success ? memberInstallments(parsed.data) : [];
  const validMonths = /^\d{4}-\d{2}$/.test(c.toMonth),
    autoLast = validMonths ? memberFmDate(c.toMonth, c.terms) : "";
  const teams = index.teams.filter((t) => t.seasonId === c.seasonId);
  return (
    <form
      className="space-y-4 rounded-xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        if (!parsed.success) {
          setError(parsed.error.issues.map((i) => i.message).join(" · "));
          return;
        }
        save.mutate(parsed.data);
      }}
    >
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="text-lg font-semibold">
          {c.revision ? "Modifica incarico" : "Nuovo incarico"}
        </h3>
        <Button
          type="button"
          variant="ghost"
          disabled={save.isPending}
          onClick={onClose}
        >
          Chiudi senza salvare
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          Descrizione
          <Input
            value={c.title}
            maxLength={150}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </label>
        <label className="space-y-1 text-sm">
          Ruolo
          <ScrollableSelect
            aria-label="Ruolo incarico"
            value={c.role}
            onValueChange={(value) =>
              patch({ role: value as MemberContract["role"] })
            }
          >
            {Object.entries(memberRoleLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </ScrollableSelect>
        </label>
        <label className="space-y-1 text-sm">
          Stagione
          <ScrollableSelect
            aria-label="Stagione incarico"
            value={String(c.seasonId || "")}
            onValueChange={(v) => {
              const s = index.seasons.find((s) => s.id === Number(v));
              if (s)
                patch({
                  seasonId: s.id,
                  fromMonth: s.startDate.slice(0, 7),
                  toMonth: s.endDate.slice(0, 7),
                  lastPaymentDate: memberFmDate(s.endDate.slice(0, 7), c.terms),
                  allocations: [],
                });
            }}
          >
            <option value="">Seleziona stagione</option>
            {index.seasons.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </ScrollableSelect>
        </label>
        <label className="space-y-1 text-sm">
          Tipologia contratto
          <ScrollableSelect
            aria-label="Tipologia contratto"
            value={c.contractType}
            onValueChange={(v) => {
              patch({ contractType: v as MemberContract["contractType"] });
              if (v === "volunteer") setCompensation("0,00");
            }}
          >
            <option value="volunteer">Volontario</option>
            <option value="annual">A compenso annuale</option>
            <option value="other">Altro</option>
          </ScrollableSelect>
        </label>
        <label className="space-y-1 text-sm">
          Dal mese
          <Input
            type="month"
            value={c.fromMonth}
            onChange={(e) => patch({ fromMonth: e.target.value })}
          />
        </label>
        <label className="space-y-1 text-sm">
          Al mese
          <Input
            type="month"
            value={c.toMonth}
            onChange={(e) => {
              patch({
                toMonth: e.target.value,
                ...(e.target.value
                  ? { lastPaymentDate: memberFmDate(e.target.value, c.terms) }
                  : {}),
              });
            }}
          />
        </label>
        <label className="space-y-1 text-sm">
          Importi inseriti come
          <ScrollableSelect
            aria-label="Modalità importi"
            value={c.amountMode}
            onValueChange={(v) =>
              patch({ amountMode: v as "monthly" | "total" })
            }
          >
            <option value="monthly">Mensile</option>
            <option value="total">Totale concordato del periodo</option>
          </ScrollableSelect>
        </label>
        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          {plan.length
            ? `${plan.length} mesi · ${memberMoney(plan.reduce((n, p) => n + p.amountCents, 0))}`
            : "Completa il periodo e gli importi per il riepilogo."}
        </div>
        <MemberMoneyInput
          label={
            c.amountMode === "monthly"
              ? "Compenso mensile (€)"
              : "Compenso totale (€)"
          }
          value={compensation}
          onChange={setCompensation}
          disabled={c.contractType === "volunteer"}
        />
        <MemberMoneyInput
          label={
            c.amountMode === "monthly"
              ? "Rimborso mensile (€)"
              : "Rimborso totale (€)"
          }
          value={reimbursement}
          onChange={setReimbursement}
        />
        <label className="space-y-1 text-sm">
          Termini pagamento
          <ScrollableSelect
            aria-label="Termini pagamento"
            value={c.terms}
            onValueChange={(v) =>
              patch({
                terms: v as "30" | "60" | "90",
                ...(c.toMonth
                  ? { lastPaymentDate: memberFmDate(c.toMonth, v) }
                  : {}),
              })
            }
          >
            <option value="30">30 gg FM</option>
            <option value="60">60 gg FM</option>
            <option value="90">90 gg FM</option>
          </ScrollableSelect>
        </label>
        <label className="space-y-1 text-sm">
          Termine ultimo pagamento
          <Input
            type="date"
            value={c.lastPaymentDate}
            onChange={(e) => patch({ lastPaymentDate: e.target.value })}
          />
          <span className="block text-xs text-muted-foreground">
            Ultima rata calcolata: {memberDay(autoLast)}
          </span>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        FM: fine del mese successivo, secondo o terzo rispetto alla competenza.
        I rimborsi sono distinti dal compenso; il pagamento di rate con rimborso
        richiede un giustificativo.
      </p>
      <fieldset className="space-y-2 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">
          Ripartizione del costo per annata
        </legend>
        {!c.allocations.length && (
          <p className="text-sm text-muted-foreground">
            Incarico trasversale, non attribuito a una specifica annata.
            Seleziona le annate per ripartire il costo.
          </p>
        )}
        {teams.map((t) => {
          const allocation = c.allocations.find((a) => a.teamId === t.id);
          return (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!allocation}
                  onChange={(e) =>
                    patch({
                      allocations: e.target.checked
                        ? [
                            ...c.allocations,
                            {
                              teamId: t.id,
                              share: c.allocations.length ? 1 : 10000,
                            },
                          ]
                        : c.allocations.filter((a) => a.teamId !== t.id),
                    })
                  }
                />
                {t.name}
              </label>
              {allocation && (
                <label className="flex items-center gap-2 text-sm">
                  Quota %
                  <Input
                    className="w-24"
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={allocation.share / 100}
                    onChange={(e) =>
                      patch({
                        allocations: c.allocations.map((a) =>
                          a.teamId === t.id
                            ? {
                                ...a,
                                share: Math.round(Number(e.target.value) * 100),
                              }
                            : a,
                        ),
                      })
                    }
                  />
                </label>
              )}
            </div>
          );
        })}
        <p className="text-xs">
          Totale quote: {c.allocations.reduce((n, a) => n + a.share, 0) / 100}%
          · richiesto 100% se ripartito.
        </p>
      </fieldset>
      <label className="block space-y-1 text-sm">
        Note dell’accordo
        <Textarea
          rows={3}
          maxLength={3000}
          value={c.notes}
          onChange={(e) => patch({ notes: e.target.value })}
        />
      </label>
      <label className="block space-y-1 text-sm">
        Documento contratto
        <ScrollableSelect
          aria-label="Documento contratto"
          value={c.documentId ? String(c.documentId) : ""}
          onValueChange={(v) => patch({ documentId: v ? Number(v) : null })}
        >
          <option value="">Nessun allegato selezionato</option>
          {documents
            .filter((d) => d.kind === "contract")
            .map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.fileName}
              </option>
            ))}
        </ScrollableSelect>
      </label>
      {c.documentId && (
        <MemberDocumentButton
          userId={userId}
          id={c.documentId}
          label="Scarica contratto"
        />
      )}
      <MemberAttachment
        userId={userId}
        kind="contract"
        onUploaded={(id) => patch({ documentId: id })}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={c.active}
          onChange={(e) => patch({ active: e.target.checked })}
        />
        Incarico attivo · disattivando si annullano solo le rate senza pagamenti
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={save.isPending}>
        {save.isPending
          ? "Salvataggio…"
          : "Salva incarico e aggiorna piano uscite"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Le rate già pagate, anche parzialmente, conservano importo e scadenza.
        Per una nuova decorrenza crea un altro incarico.
      </p>
    </form>
  );
}

export function MemberExpensesPanel({
  userId,
  onOpenMember,
}: {
  userId?: number;
  onOpenMember?: (id: number) => void;
}) {
  const { club, user, role } = useAuth(),
    cache = useQueryClient(),
    { toast } = useToast();
  const data = useQuery({
    queryKey: ["member-services", club?.id, user?.id, role, "expenses"],
    queryFn: () => memberApi<MemberExpenses>("/expenses"),
  });
  const [search, setSearch] = useState(""),
    [month, setMonth] = useState(""),
    [state, setState] = useState("all"),
    [selected, setSelected] = useState<MemberDue>(),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(trainingLocalDate()),
    [method, setMethod] = useState("bank_transfer"),
    [notes, setNotes] = useState(""),
    [documentId, setDocumentId] = useState<number | null>(null),
    [paymentId, setPaymentId] = useState("");
  const pay = useMutation({
    mutationFn: () =>
      memberApi(`/expenses/${selected!.id}/pay`, "POST", {
        id: paymentId,
        amountCents: parseMemberMoney(amount),
        paidDate: date,
        method,
        notes,
        documentId,
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["member-services"] });
      setSelected(undefined);
      toast({
        title: "Uscita registrata",
        description: "Il piano e il grafico pagamenti sono aggiornati.",
      });
    },
    onError: (e) =>
      toast({
        title: "Pagamento non registrato",
        description: e.message,
        variant: "destructive",
      }),
  });
  const today = trainingLocalDate(),
    dues = (data.data?.dues ?? []).filter(
      (d) =>
        (!userId || d.userId === userId) &&
        (!month || d.month === month) &&
        `${d.name} ${d.details.title}`
          .toLocaleLowerCase("it")
          .includes(search.toLocaleLowerCase("it")) &&
        (state === "all" ||
          (state === "paid" && d.paidCents === d.amountCents) ||
          (state === "pending" &&
            d.paidCents < d.amountCents &&
            d.dueDate >= today) ||
          (state === "overdue" &&
            d.paidCents < d.amountCents &&
            d.dueDate < today)),
    );
  const rows = dues.map((d) => ({
    Membro: d.name,
    Incarico: d.details.title,
    Competenza: d.month,
    "Scadenza FM": memberDay(d.dueDate),
    Totale: memberMoney(d.amountCents),
    Pagato: memberMoney(d.paidCents),
    Residuo: memberMoney(d.amountCents - d.paidCents),
  }));
  const total = dues.reduce((n, d) => n + d.amountCents, 0),
    paid = dues.reduce((n, d) => n + d.paidCents, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Compensi e rimborsi membri · uscite
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!rows.length}
            onClick={() =>
              exportMultiSheet(
                [{ name: "Uscite membri", rows }],
                "uscite-membri.xlsx",
              )
            }
          >
            Esporta Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!rows.length}
            onClick={() => {
              const blob = buildTextPdfBlob([
                {
                  heading: "USCITE MEMBRI",
                  lines: rows.flatMap((r) => [
                    r.Membro + " · " + r.Incarico,
                    `Competenza ${r.Competenza} · Scadenza ${r["Scadenza FM"]}`,
                    `Totale ${r.Totale} · Pagato ${r.Pagato} · Residuo ${r.Residuo}`,
                    "",
                  ]),
                },
              ]);
              const url = URL.createObjectURL(blob),
                a = document.createElement("a");
              a.href = url;
              a.download = "uscite-membri.pdf";
              a.click();
              window.setTimeout(() => URL.revokeObjectURL(url), 30000);
            }}
          >
            Esporta PDF
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          Cerca membro o incarico
          <Input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="text-sm">
          Mese di competenza
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Situazione
          <ScrollableSelect
            aria-label="Situazione uscite membri"
            value={state}
            onValueChange={setState}
          >
            <option value="all">Tutte</option>
            <option value="paid">Pagate</option>
            <option value="pending">Da pagare · non scadute</option>
            <option value="overdue">Scadute</option>
          </ScrollableSelect>
        </label>
      </div>
      {data.isError ? (
        <p role="alert" className="text-destructive">
          {data.error.message}
        </p>
      ) : data.isPending ? (
        <p>Caricamento uscite…</p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ["Totale registrato", total],
              ["Pagato", paid],
              ["Residuo", total - paid],
            ].map(([label, n]) => (
              <div key={label} className="rounded-xl border p-3 text-sm">
                {label}
                <strong className="mt-1 block text-lg tabular-nums">
                  {memberMoney(Number(n))}
                </strong>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {dues.length ? (
              dues.map((d) => {
                const remaining = d.amountCents - d.paidCents,
                  status =
                    remaining === 0
                      ? "Pagato"
                      : d.dueDate < today
                        ? "Scaduto"
                        : "Da pagare · non scaduto";
                return (
                  <div
                    key={d.id}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${remaining === 0 ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20" : d.dueDate < today ? "border-red-300 bg-red-50/50 dark:bg-red-950/20" : "border-amber-300 bg-amber-50/40 dark:bg-amber-950/20"}`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {d.name} · {d.details.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Competenza {d.month} · {d.details.terms} gg FM · termine{" "}
                        {memberDay(d.dueDate)}
                      </p>
                      <p className="text-xs">
                        {status} · Pagato {memberMoney(d.paidCents)} · Residuo{" "}
                        {memberMoney(remaining)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="tabular-nums">
                        {memberMoney(d.amountCents)}
                      </strong>
                      {onOpenMember && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onOpenMember(d.userId)}
                        >
                          Scheda membro
                        </Button>
                      )}
                      {remaining > 0 && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            setSelected(d);
                            setAmount(memberAmountText(remaining));
                            setDate(today);
                            setMethod("bank_transfer");
                            setNotes("");
                            setDocumentId(null);
                            setPaymentId(crypto.randomUUID());
                            pay.reset();
                          }}
                        >
                          Registra uscita
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">
                Nessuna rata per i filtri selezionati. Crea un incarico nella
                scheda membro.
              </p>
            )}
          </div>
          {!!userId && (
            <details className="rounded-xl border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Ricevute e pagamenti registrati
              </summary>
              <div className="mt-3 space-y-2">
                {data.data.receipts
                  .filter((r) => r.userId === userId)
                  .map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm"
                    >
                      <span>
                        {memberDay(r.paidDate)} · {memberMethodLabels[r.method]}{" "}
                        · {r.month} · {memberMoney(r.amountCents)}
                      </span>
                      {r.documentId && (
                        <MemberDocumentButton
                          userId={r.userId}
                          id={r.documentId}
                          label="Scarica ricevuta"
                        />
                      )}
                    </div>
                  ))}
              </div>
            </details>
          )}
        </>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !pay.isPending) setSelected(undefined);
        }}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registra uscita · {selected?.name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <>
              <p className="text-sm">
                {selected.details.title} · {selected.month} · termine{" "}
                {memberDay(selected.dueDate)}
              </p>
              <MemberMoneyInput
                label="Importo pagato (€)"
                value={amount}
                onChange={setAmount}
              />
              <label className="text-sm">
                Data effettiva
                <Input
                  type="date"
                  max={today}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Metodo
                <ScrollableSelect
                  aria-label="Metodo pagamento membro"
                  value={method}
                  onValueChange={setMethod}
                >
                  {Object.entries(memberMethodLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </ScrollableSelect>
              </label>
              <label className="text-sm">
                Note
                <Textarea
                  value={notes}
                  maxLength={1500}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                {documentId
                  ? "Giustificativo caricato."
                  : selected.details.reimbursementCents > 0
                    ? "Allega il giustificativo del rimborso prima di pagare."
                    : "Ricevuta facoltativa."}
              </p>
              <MemberAttachment
                userId={selected.userId}
                kind="receipt"
                onUploaded={setDocumentId}
              />
              {pay.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {pay.error.message}
                </p>
              )}
              <Button
                type="button"
                disabled={
                  pay.isPending ||
                  !(parseMemberMoney(amount) > 0) ||
                  parseMemberMoney(amount) >
                    selected.amountCents - selected.paidCents ||
                  (selected.details.reimbursementCents > 0 && !documentId)
                }
                onClick={() => pay.mutate()}
              >
                {pay.isPending ? "Registrazione…" : "Conferma pagamento"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
