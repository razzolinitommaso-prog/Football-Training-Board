import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react/custom-fetch";
import { memberRoleLabels, trainingLocalDate } from "@workspace/api-zod";
import { useAuth } from "@/hooks/use-auth";
import { setAuthToken } from "@/lib/auth-token";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
type Data = {
  group?: { id: number; name: string; manager: boolean };
  clubs: { id: number; name: string; role: string }[];
  groupClubs: { id: number; name: string }[];
  members: {
    id: number;
    name: string;
    role: string;
    effectiveDate?: string;
    notes?: string;
  }[];
  canAdmin: boolean;
  canFinance: boolean;
};
const api = <T,>(path: string, method = "GET", body?: unknown) =>
  customFetch<T>("/api/society-management" + path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
export function SocietyWorkspace() {
  const { club, role } = useAuth(),
    [open, setOpen] = useState(false),
    [pane, setPane] = useState("societies"),
    [name, setName] = useState(""),
    [fiscal, setFiscal] = useState(""),
    [existing, setExisting] = useState(""),
    [person, setPerson] = useState(""),
    [grantRole, setGrantRole] = useState("secretary"),
    [selected, setSelected] = useState<number[]>([]),
    [manager, setManager] = useState(false),
    [accessSections, setAccessSections] = useState([
      "scuola_calcio",
      "settore_giovanile",
      "prima_squadra",
    ]),
    [notes, setNotes] = useState(""),
    [day, setDay] = useState(trainingLocalDate()),
    cache = useQueryClient(),
    { toast } = useToast();
  const enabled = [
    "admin",
    "presidente",
    "director",
    "secretary",
    "sporting_director",
    "technical_director",
  ].includes(role ?? "");
  const choices = useQuery({
    queryKey: ["society-choices", club?.id, role],
    queryFn: () =>
      api<{ id: number; name: string; role: string }[]>("/choices"),
    enabled: !!role && role !== "parent",
  });
  const q = useQuery({
    queryKey: ["society-management", club?.id, role],
    queryFn: () => api<Data>(""),
    enabled: open && enabled,
  });
  const summary = useQuery({
    queryKey: ["society-management", club?.id, "summary"],
    queryFn: () => api<any[]>("/summary"),
    enabled:
      open && pane === "summary" && !!q.data?.group && !!q.data?.canFinance,
  });
  const mutate = useMutation({
    mutationFn: ({
      path,
      body,
      method,
    }: {
      path: string;
      body: unknown;
      method?: string;
    }) => api(path, method ?? "POST", body),
    onSuccess: () => {
      void cache.invalidateQueries();
      toast({ title: "Modifica salvata" });
      setNotes("");
      setName("");
    },
    onError: (e) =>
      toast({
        title: "Operazione non completata",
        description: e.message,
        variant: "destructive",
      }),
  });
  const switchClub = useMutation({
    mutationFn: (body: { clubId: number; role: string }) =>
      api<{ authToken: string }>("/switch", "POST", body),
    onSuccess: async (r) => {
      setAuthToken(r.authToken);
      await cache.cancelQueries();
      cache.clear();
      localStorage.removeItem("ftb-login-section");
      localStorage.removeItem("ftb-login-club");
      window.location.assign("/dashboard");
    },
    onError: (e) =>
      toast({
        title: "Accesso non consentito",
        description: e.message,
        variant: "destructive",
      }),
  });
  if (!role || role === "parent") return null;
  if (!enabled)
    return (
      <div className="flex flex-wrap gap-2">
        {choices.data?.map((c) => (
          <Button
            variant="outline"
            key={c.id + ":" + c.role}
            disabled={
              switchClub.isPending || (c.id === club?.id && c.role === role)
            }
            onClick={() => {
              if (
                window.confirm(
                  "Cambiare società o incarico? Salva prima le modifiche aperte.",
                )
              )
                switchClub.mutate({ clubId: c.id, role: c.role });
            }}
          >
            {c.name} ·{" "}
            {memberRoleLabels[c.role as keyof typeof memberRoleLabels] ??
              c.role}
          </Button>
        ))}
      </div>
    );
  const data = q.data;
  const people = [
    ...new Map(data?.members.map((m) => [m.id, m]) ?? []).values(),
  ];
  const write = (path: string, body: unknown, method?: string) =>
    mutate.mutate({ path, body, method });
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Società e incarichi
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Gestione società e incarichi</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Società corrente: {club?.name}. Ogni registrazione appartiene alla
            società selezionata.
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              ["societies", "Società e accessi"],
              ["members", "Incarichi ed esoneri"],
              ["summary", "Riepilogo gruppo"],
            ].map(([key, label]) => (
              <Button
                key={key}
                variant={pane === key ? "default" : "outline"}
                onClick={() => setPane(key)}
              >
                {label}
              </Button>
            ))}
          </div>
          {q.isPending ? (
            <p>Caricamento…</p>
          ) : q.error ? (
            <p role="alert">{q.error.message}</p>
          ) : (
            <>
              {pane === "societies" && (
                <div className="space-y-5">
                  <h3 className="font-semibold">
                    {data?.group?.name ??
                      "Gestione indipendente · nessun gruppo"}
                  </h3>
                  <div className="space-y-2">
                    {data?.clubs.map((c) => (
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                        key={c.id + ":" + c.role}
                      >
                        <span>
                          {c.name} ·{" "}
                          {memberRoleLabels[
                            c.role as keyof typeof memberRoleLabels
                          ] ?? c.role}
                        </span>
                        <Button
                          variant="outline"
                          disabled={
                            switchClub.isPending ||
                            (c.id === club?.id && c.role === role)
                          }
                          onClick={() => {
                            if (
                              window.confirm(
                                "Cambiare società o ruolo? Salva prima le modifiche aperte.",
                              )
                            )
                              switchClub.mutate({ clubId: c.id, role: c.role });
                          }}
                        >
                          Accedi alla società
                        </Button>
                      </div>
                    ))}
                  </div>
                  {!data?.group && data?.canAdmin && (
                    <form
                      className="space-y-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        write("/group", { name });
                      }}
                    >
                      <label>
                        Nome del gruppo
                        <Input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                          minLength={2}
                        />
                      </label>
                      <Button disabled={mutate.isPending}>
                        Crea gruppo con questa società
                      </Button>
                    </form>
                  )}
                  {data?.group?.manager && (
                    <>
                      <form
                        className="space-y-3 rounded-xl border p-4"
                        onSubmit={(e) => {
                          e.preventDefault();
                          write("/clubs", {
                            name,
                            fiscalCode: fiscal,
                            ...(existing ? { clubId: Number(existing) } : {}),
                          });
                        }}
                      >
                        <h3 className="font-semibold">
                          Aggiungi società al gruppo
                        </h3>
                        <div className="responsive-form-grid gap-3">
                          <label>
                            Denominazione
                            <Input
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              required
                              minLength={2}
                            />
                          </label>
                          <label>
                            Codice fiscale
                            <Input
                              value={fiscal}
                              onChange={(e) => setFiscal(e.target.value)}
                            />
                          </label>
                          <label>
                            ID società esistente (facoltativo)
                            <Input
                              type="number"
                              min={1}
                              value={existing}
                              onChange={(e) => setExisting(e.target.value)}
                            />
                          </label>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Per collegare una società esistente occorre esserne
                          Presidente o Amministratore. Nessun dato viene
                          trasferito.
                        </p>
                        <Button disabled={mutate.isPending}>
                          Aggiungi società
                        </Button>
                      </form>
                      <form
                        className="space-y-3 rounded-xl border p-4"
                        onSubmit={(e) => {
                          e.preventDefault();
                          write("/access", {
                            userId: Number(person),
                            clubIds: selected,
                            role: grantRole,
                            sections: accessSections,
                            groupManager: manager,
                          });
                        }}
                      >
                        <h3 className="font-semibold">
                          Abilitazioni per membro, ruolo e società
                        </h3>
                        <div className="responsive-form-grid gap-3">
                          <label>
                            Membro
                            <select
                              className="w-full rounded-md border bg-background p-2"
                              required
                              value={person}
                              onChange={(e) => setPerson(e.target.value)}
                            >
                              <option value="">Seleziona…</option>
                              {people.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Ruolo
                            <select
                              className="w-full rounded-md border bg-background p-2"
                              value={grantRole}
                              onChange={(e) => setGrantRole(e.target.value)}
                            >
                              {Object.entries(memberRoleLabels)
                                .filter(
                                  ([k]) => !["player", "other"].includes(k),
                                )
                                .map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))}
                            </select>
                          </label>
                        </div>
                        <fieldset>
                          <legend>Settori autorizzati</legend>
                          <div className="flex flex-wrap gap-4">
                            {[
                              ["scuola_calcio", "Scuola Calcio"],
                              ["settore_giovanile", "Settore Giovanile"],
                              ["prima_squadra", "Prima Squadra"],
                            ].map(([key, label]) => (
                              <label
                                key={key}
                                className="flex items-center gap-2 py-2"
                              >
                                <input
                                  type="checkbox"
                                  checked={accessSections.includes(key)}
                                  onChange={(e) =>
                                    setAccessSections((v) =>
                                      e.target.checked
                                        ? [...v, key]
                                        : v.filter((s) => s !== key),
                                    )
                                  }
                                />
                                {label}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <fieldset>
                          <legend>Società autorizzate</legend>
                          <div className="flex flex-wrap gap-4">
                            {data.groupClubs.map((c) => (
                              <label
                                key={c.id}
                                className="flex items-center gap-2 py-2"
                              >
                                <input
                                  type="checkbox"
                                  checked={selected.includes(c.id)}
                                  onChange={(e) =>
                                    setSelected((v) =>
                                      e.target.checked
                                        ? [...v, c.id]
                                        : v.filter((id) => id !== c.id),
                                    )
                                  }
                                />
                                {c.name}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <label className="flex gap-2">
                          <input
                            type="checkbox"
                            checked={manager}
                            onChange={(e) => setManager(e.target.checked)}
                          />
                          Abilita anche alla gestione del gruppo
                        </label>
                        <Button
                          disabled={
                            mutate.isPending ||
                            !selected.length ||
                            !accessSections.length
                          }
                        >
                          Aggiungi / aggiorna abilitazioni selezionate
                        </Button>
                      </form>
                    </>
                  )}
                </div>
              )}
              {pane === "members" && (
                <div className="space-y-4">
                  <p className="text-sm">
                    L'esonero riguarda solo il ruolo selezionato nella società
                    corrente. Accordi e pagamenti restano conservati: eventuali
                    revisioni si registrano in Contratti e compensi.
                  </p>
                  <label>
                    Decorrenza
                    <Input
                      type="date"
                      value={day}
                      onChange={(e) => setDay(e.target.value)}
                    />
                  </label>
                  <label>
                    Motivazione obbligatoria
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      minLength={5}
                    />
                  </label>
                  {data?.members.map((m) => (
                    <div
                      key={m.id + ":" + m.role}
                      className="flex flex-wrap justify-between gap-3 rounded-lg border p-3"
                    >
                      <div>
                        <strong>{m.name}</strong>
                        <p>
                          {memberRoleLabels[
                            m.role as keyof typeof memberRoleLabels
                          ] ?? m.role}
                        </p>
                        {m.effectiveDate && (
                          <p className="text-sm text-destructive">
                            Esonerato dal {m.effectiveDate}: {m.notes}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        disabled={mutate.isPending || notes.trim().length < 5}
                        onClick={() => {
                          if (
                            window.confirm(
                              `${m.effectiveDate ? "Ripristinare" : "Esonerare"} questo incarico? I compensi restano invariati.`,
                            )
                          )
                            write(
                              `/members/${m.id}/dismissal`,
                              {
                                role: m.role,
                                effectiveDate: day,
                                notes,
                                restore: !!m.effectiveDate,
                              },
                              "PUT",
                            );
                        }}
                      >
                        {m.effectiveDate
                          ? "Ripristina incarico"
                          : "Esonera incarico"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {pane === "summary" && (
                <div className="space-y-3">
                  <p>
                    Riepilogo delle sole società per cui possiedi un accesso
                    amministrativo. Le persone associate a società diverse sono
                    conteggiate per ciascuna associazione.
                  </p>
                  {summary.isError ? (
                    <p role="alert">{summary.error.message}</p>
                  ) : (
                    summary.data?.map((r) => (
                      <div
                        className="rounded-lg border p-3 space-y-1"
                        key={r.id}
                      >
                        <strong>{r.name}</strong>
                        <p>
                          {r.active} attivi · {r.players} anagrafiche
                        </p>
                        <p>
                          Incassato: {r.income ?? "—"} € · Uscite pagate:{" "}
                          {r.expenses ?? "—"} € · Uscite residue:{" "}
                          {r.remaining ?? "—"} €
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
