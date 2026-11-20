import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  memberFmDate,
  memberRoleLabels,
  trainingLocalDate,
  type MemberContract,
} from "@workspace/api-zod";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import {
  memberApi,
  memberDay,
  memberMoney,
  type MemberIndex,
  type MemberProfile,
  type MemberExpenses,
} from "@/lib/member-services";
import {
  MemberAttachment,
  MemberContractEditor,
  MemberDocumentButton,
  MemberExpensesPanel,
} from "./member-finance";
import { MemberKitPanel } from "./member-kit";

function ProfileForm({
  userId,
  data,
  onDirty,
}: {
  userId: number;
  data: MemberProfile;
  onDirty: (dirty: boolean) => void;
}) {
  const [profile, setProfile] = useState(data.profile),
    cache = useQueryClient(),
    { toast } = useToast();
  const dirty = JSON.stringify(profile) !== JSON.stringify(data.profile);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  const save = useMutation({
    mutationFn: () => memberApi(`/${userId}/profile`, "PUT", profile),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["member-services"] });
      toast({ title: "Scheda membro salvata" });
    },
    onError: (e) =>
      toast({
        title: "Scheda non salvata",
        description: e.message,
        variant: "destructive",
      }),
  });
  const expired =
    !!profile.medicalUntil && profile.medicalUntil < trainingLocalDate();
  return (
    <form
      className="space-y-3 rounded-xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-semibold">
          Certificato medico e documenti del membro
        </h3>
        <span
          className={`text-sm ${expired ? "text-destructive" : "text-muted-foreground"}`}
        >
          {!profile.medicalUntil
            ? "Scadenza da inserire"
            : expired
              ? "Certificato scaduto"
              : "Valido fino al " + memberDay(profile.medicalUntil)}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Data rilascio
          <Input
            type="date"
            value={profile.medicalFrom ?? ""}
            disabled={!data.canFinance || save.isPending}
            onChange={(e) =>
              setProfile((p) => ({ ...p, medicalFrom: e.target.value || null }))
            }
          />
        </label>
        <label className="text-sm">
          Scadenza
          <Input
            type="date"
            value={profile.medicalUntil ?? ""}
            disabled={!data.canFinance || save.isPending}
            onChange={(e) =>
              setProfile((p) => ({
                ...p,
                medicalUntil: e.target.value || null,
              }))
            }
          />
        </label>
      </div>
      <label className="block text-sm">
        Certificato allegato
        <ScrollableSelect
          aria-label="Certificato allegato membro"
          value={
            profile.medicalDocumentId ? String(profile.medicalDocumentId) : ""
          }
          disabled={!data.canFinance || save.isPending}
          onValueChange={(v) =>
            setProfile((p) => ({
              ...p,
              medicalDocumentId: v ? Number(v) : null,
            }))
          }
        >
          <option value="">Nessun certificato selezionato</option>
          {data.documents
            .filter((d) => d.kind === "medical")
            .map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.fileName}
              </option>
            ))}
        </ScrollableSelect>
      </label>
      {profile.medicalDocumentId && (
        <MemberDocumentButton
          userId={userId}
          id={profile.medicalDocumentId}
          label="Scarica certificato"
        />
      )}
      {data.canFinance && (
        <MemberAttachment
          userId={userId}
          kind="medical"
          onUploaded={(id) =>
            setProfile((p) => ({ ...p, medicalDocumentId: id }))
          }
        />
      )}
      <label className="block text-sm">
        Note del membro
        <Textarea
          rows={3}
          maxLength={3000}
          value={profile.notes}
          disabled={!data.canFinance || save.isPending}
          onChange={(e) => setProfile((p) => ({ ...p, notes: e.target.value }))}
        />
      </label>
      {save.isError && (
        <p role="alert" className="text-sm text-destructive">
          {save.error.message}
        </p>
      )}
      {data.canFinance && (
        <Button type="submit" disabled={!dirty || save.isPending}>
          {save.isPending ? "Salvataggio…" : "Salva scheda membro"}
        </Button>
      )}
    </form>
  );
}
export function MemberWorkspace({
  memberId,
  open,
  onOpenChange,
}: {
  memberId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { club, user, role } = useAuth(),
    [pane, setPane] = useState("profile"),
    [editor, setEditor] = useState<MemberContract>(),
    [dirty, setDirty] = useState(false);
  const index = useQuery({
    queryKey: ["member-services", club?.id, user?.id, role, "index"],
    queryFn: () => memberApi<MemberIndex>(""),
    enabled: open,
  });
  const detail = useQuery({
    queryKey: [
      "member-services",
      club?.id,
      user?.id,
      role,
      "profile",
      memberId,
    ],
    queryFn: () => memberApi<MemberProfile>(`/${memberId}/profile`),
    enabled: open && !!memberId,
  });
  const expenses = useQuery({
    queryKey: ["member-services", club?.id, user?.id, role, "expenses"],
    queryFn: () => memberApi<MemberExpenses>("/expenses"),
    enabled: open && detail.data?.canFinance === true,
  });
  useEffect(() => {
    setPane("profile");
    setEditor(undefined);
    setDirty(false);
  }, [memberId, open]);
  const close = (next: boolean) => {
    if (
      !next &&
      (dirty || editor) &&
      !window.confirm(
        "Chiudere la scheda? Le modifiche non salvate saranno scartate.",
      )
    )
      return;
    onOpenChange(next);
  };
  const ownDues = (expenses.data?.dues ?? []).filter(
      (d) => d.userId === memberId,
    ),
    total = ownDues.reduce((n, d) => n + d.amountCents, 0),
    paid = ownDues.reduce((n, d) => n + d.paidCents, 0),
    monthly = ownDues
      .filter((d) => d.month === trainingLocalDate().slice(0, 7))
      .reduce((n, d) => n + d.amountCents, 0);
  const byTeam = new Map<number, number>();
  for (const due of ownDues) {
    if (!due.details.allocations.length)
      byTeam.set(0, (byTeam.get(0) ?? 0) + due.amountCents);
    else
      for (const a of due.details.allocations)
        byTeam.set(a.teamId, (byTeam.get(a.teamId) ?? 0) + a.amountCents);
  }
  const create = () => {
    const season =
      index.data?.seasons.find((s) => s.isActive) ?? index.data?.seasons[0];
    if (!season) return;
    const from = trainingLocalDate().slice(0, 7),
      start =
        from >= season.startDate.slice(0, 7) &&
        from <= season.endDate.slice(0, 7)
          ? from
          : season.startDate.slice(0, 7),
      end = season.endDate.slice(0, 7);
    setEditor({
      id: crypto.randomUUID(),
      revision: 0,
      title: "Nuovo incarico",
      role: "coach",
      seasonId: season.id,
      fromMonth: start,
      toMonth: end,
      contractType: "annual",
      amountMode: "monthly",
      compensationCents: 0,
      reimbursementCents: 0,
      terms: "30",
      lastPaymentDate: memberFmDate(end, "30"),
      allocations: [],
      notes: "",
      documentId: null,
      active: true,
    });
    setPane("contracts");
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[94svh] w-[calc(100vw-1rem)] overflow-y-auto p-3 sm:max-w-6xl sm:p-6">
        <DialogHeader>
          <DialogTitle>
            Scheda membro · {detail.data?.person.name ?? "Caricamento…"}
          </DialogTitle>
        </DialogHeader>
        {detail.isError || index.isError ? (
          <p role="alert" className="text-destructive">
            {detail.error?.message ?? index.error?.message}
          </p>
        ) : !detail.data || !index.data ? (
          <p>Caricamento scheda…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              {detail.data.person.roles.map((r) => (
                <span key={r} className="rounded-full border px-2 py-1">
                  {memberRoleLabels[r as keyof typeof memberRoleLabels] ?? r}
                </span>
              ))}
            </div>
            <p className="break-words text-sm text-muted-foreground">
              {detail.data.person.email} ·{" "}
              {detail.data.person.phone ?? "Telefono non inserito"}
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                ["profile", "Dati e certificato"],
                ["contracts", "Ruoli e contratti"],
                ...(detail.data.canFinance
                  ? [["expenses", "Piano uscite"]]
                  : []),
                ["kit", "KIT e magazzino"],
              ].map(([key, label]) => (
                <Button
                  type="button"
                  key={key}
                  size="sm"
                  aria-pressed={pane === key}
                  variant={pane === key ? "default" : "outline"}
                  onClick={() => setPane(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <section hidden={pane !== "profile"} className="space-y-4">
              <ProfileForm
                key={`${memberId}:${detail.data.profile.revision}`}
                userId={memberId!}
                data={detail.data}
                onDirty={setDirty}
              />
              {detail.data.canFinance && (
                <>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ["Mensile corrente", monthly],
                      ["Totale registrato", total],
                      ["Pagato", paid],
                      ["Residuo", total - paid],
                    ].map(([label, n]) => (
                      <div
                        key={label}
                        className="rounded-xl border p-3 text-sm"
                      >
                        {label}
                        <strong className="mt-1 block text-xl tabular-nums">
                          {memberMoney(Number(n))}
                        </strong>
                      </div>
                    ))}
                  </div>
                  {expenses.isError && (
                    <p role="alert" className="text-destructive">
                      {expenses.error.message}
                    </p>
                  )}
                  <div className="rounded-xl border p-4">
                    <h3 className="font-semibold">
                      Costi per annata · rate registrate
                    </h3>
                    <div className="mt-2 space-y-2">
                      {[...byTeam].map(([id, cents]) => (
                        <div
                          key={id}
                          className="flex justify-between gap-3 border-b pb-2 text-sm"
                        >
                          <span>
                            {id
                              ? (index.data.teams.find((t) => t.id === id)
                                  ?.name ?? "Annata " + id)
                              : "Incarichi trasversali"}
                          </span>
                          <strong className="tabular-nums">
                            {memberMoney(cents)}
                          </strong>
                        </div>
                      ))}
                      {!byTeam.size && (
                        <p className="text-sm text-muted-foreground">
                          Nessun piano economico registrato.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>
            <section hidden={pane !== "contracts"} className="space-y-4">
              <div className="flex flex-wrap justify-between gap-3">
                <h3 className="font-semibold">Incarichi del membro</h3>
                {detail.data.canFinance && (
                  <Button
                    type="button"
                    onClick={create}
                    disabled={!index.data.seasons.length || !!editor}
                  >
                    Aggiungi incarico
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Gli incarichi descrivono ruoli, annate e accordi. I profili e i
                permessi di accesso esistenti non vengono ampliati
                automaticamente.
              </p>
              {!detail.data.canFinance ? (
                <div className="space-y-2">
                  {detail.data.person.duties.map((d) => (
                    <div key={d.id} className="rounded-lg border p-3 text-sm">
                      {d.title} ·{" "}
                      {memberRoleLabels[
                        d.role as keyof typeof memberRoleLabels
                      ] ?? d.role}{" "}
                      · {d.fromMonth} – {d.toMonth}
                      {!d.active ? " · archiviato" : ""}
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Importi e contratti sono riservati a Presidente, DG e
                    Segreteria.
                  </p>
                </div>
              ) : (
                <>
                  {!index.data.seasons.length && (
                    <p className="text-sm text-amber-700">
                      Crea prima la stagione nella sezione Stagioni.
                    </p>
                  )}
                  {detail.data.contracts.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                    >
                      <div>
                        <p className="font-medium">
                          {c.title} · {memberRoleLabels[c.role]}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {c.fromMonth} – {c.toMonth} · {c.terms} gg FM ·
                          termine ultimo {memberDay(c.lastPaymentDate)}
                          {!c.active ? " · archiviato" : ""}
                        </p>
                        <p className="text-sm">
                          {c.amountMode === "monthly"
                            ? "Mensile"
                            : "Totale periodo"}
                          :{" "}
                          {memberMoney(
                            c.compensationCents + c.reimbursementCents,
                          )}{" "}
                          · compenso {memberMoney(c.compensationCents)} +
                          rimborso {memberMoney(c.reimbursementCents)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!!editor}
                        onClick={() => setEditor(c)}
                      >
                        Modifica accordo
                      </Button>
                    </div>
                  ))}
                  {editor && (
                    <MemberContractEditor
                      key={`${editor.id}:${editor.revision}`}
                      userId={memberId!}
                      initial={editor}
                      index={index.data}
                      documents={detail.data.documents}
                      onClose={() => setEditor(undefined)}
                    />
                  )}
                </>
              )}
            </section>
            {detail.data.canFinance && (
              <section hidden={pane !== "expenses"}>
                <MemberExpensesPanel userId={memberId!} />
              </section>
            )}
            <section hidden={pane !== "kit"}>
              <MemberKitPanel userId={memberId!} slots={detail.data.kitSlots} />
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
