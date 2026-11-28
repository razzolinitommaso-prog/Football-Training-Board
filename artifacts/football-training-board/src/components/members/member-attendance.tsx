import {downloadExport} from "@/lib/export-download";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { memberRoleLabels, trainingLocalDate } from "@workspace/api-zod";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import { exportMultiSheet } from "@/lib/excel-export";
import { buildTextPdfBlob } from "@/lib/callup-pdf";
import {
  memberApi,
  type MemberIndex,
  type MemberPerson,
} from "@/lib/member-services";
type Event = {
  id: number;
  kind: "training" | "match";
  teamId: number | null;
  teamIds: number[];
  date: string;
  title: string;
};
type Record = {
  userId: number;
  kind: string;
  eventId: number;
  status: "present" | "absent" | null;
  notes: string;
  revision: number;
};
type Register = { members: MemberPerson[]; events: Event[]; records: Record[] };
const dateLabel = (value: string) =>
  new Date(value).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const roleNames = (p: MemberPerson) =>
  p.roles
    .map((r) => memberRoleLabels[r as keyof typeof memberRoleLabels] ?? r)
    .join(" · ");
function Roll({
  event,
  people,
  initial,
  onSaved,
  onDirty,
}: {
  event: Event;
  people: MemberPerson[];
  initial: Record[];
  onSaved: () => void;
  onDirty: (value: boolean) => void;
}) {
  const initialRows = () =>
    people.map((p) => ({
      userId: p.id,
      status: initial.find((r) => r.userId === p.id)?.status ?? null,
      notes: initial.find((r) => r.userId === p.id)?.notes ?? "",
      revision: initial.find((r) => r.userId === p.id)?.revision ?? 0,
    }));
  const [original] = useState(initialRows),
    [draft, setDraft] = useState(initialRows),
    [showAll, setShowAll] = useState(false),
    { toast } = useToast(),
    cache = useQueryClient();
  const changed = draft.filter(
    (r) =>
      JSON.stringify(r) !==
      JSON.stringify(original.find((o) => o.userId === r.userId)),
  );
  useEffect(() => onDirty(changed.length > 0), [changed.length, onDirty]);
  const save = useMutation({
    mutationFn: () =>
      memberApi("/attendance", "PUT", {
        kind: event.kind,
        eventId: event.id,
        records: changed,
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["member-services"] });
      toast({ title: "Presenze membri salvate" });
      onDirty(false);
      onSaved();
    },
    onError: (e) =>
      toast({
        title: "Presenze non salvate",
        description: e.message,
        variant: "destructive",
      }),
  });
  const update = (userId: number, patch: Partial<(typeof draft)[number]>) =>
    setDraft((rows) =>
      rows.map((r) => (r.userId === userId ? { ...r, ...patch } : r)),
    );
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h3 className="font-semibold">Appello membri · {event.title}</h3>
      <p className="text-sm text-muted-foreground">
        {dateLabel(event.date)} ·{" "}
        {event.kind === "match" ? "Partita" : "Allenamento"}
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showAll}
          onChange={(e) => setShowAll(e.target.checked)}
        />
        Mostra anche membri non assegnati all’annata
      </label>
      {people
        .filter(
          (p) =>
            showAll ||
            event.teamIds.some((id) => p.teamIds.includes(id)) ||
            p.roles.some((r) =>
              [
                "director",
                "technical_director",
                "sporting_director",
                "presidente",
                "admin",
                "secretary",
              ].includes(r),
            ) ||
            initial.some((r) => r.userId === p.id),
        )
        .map((p) => {
          const r = draft.find((r) => r.userId === p.id)!;
          return (
            <div
              key={p.id}
              className="grid items-center gap-3 border-t pt-3 md:grid-cols-[minmax(0,1fr)_12rem_minmax(0,1fr)]"
            >
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{roleNames(p)}</p>
              </div>
              <label className="text-xs">
                Presenza
                <ScrollableSelect
                  aria-label={`Presenza ${p.name}`}
                  value={r.status ?? ""}
                  disabled={save.isPending}
                  onValueChange={(value) =>
                    update(p.id, {
                      status: value ? (value as "present" | "absent") : null,
                    })
                  }
                >
                  <option value="">Da registrare</option>
                  <option value="present">Presente</option>
                  <option value="absent">Assente</option>
                </ScrollableSelect>
              </label>
              <label className="text-xs">
                Nota
                <Input
                  value={r.notes}
                  maxLength={1000}
                  disabled={save.isPending}
                  onChange={(e) => update(p.id, { notes: e.target.value })}
                />
              </label>
            </div>
          );
        })}
      {save.isError && (
        <p role="alert" className="text-sm text-destructive">
          {save.error.message}
        </p>
      )}
      <Button
        type="button"
        disabled={save.isPending || !changed.length}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Salvataggio…" : "Salva presenze membri"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Una registrazione per persona e per evento, indipendentemente dal numero
        di ruoli.
      </p>
    </section>
  );
}
export function MemberAttendance({
  section,
  initialDate,
  initialEventId,
  onDirty,
}: {
  section?: string;
  initialDate?: string;
  initialEventId?: number;
  onDirty?: (dirty: boolean) => void;
}) {
  const { club, user, role } = useAuth(),
    [month, setMonth] = useState(
      initialDate?.slice(0, 7) || trainingLocalDate().slice(0, 7),
    ),
    [team, setTeam] = useState(""),
    [kind, setKind] = useState<"training" | "match">("training"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState(
      initialEventId ? String(initialEventId) : "",
    ),
    [dirty, setDirty] = useState(false),
    [sector, setSector] = useState(section ?? "");
  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const index = useQuery({
    queryKey: ["member-services", club?.id, user?.id, role, "index"],
    queryFn: () => memberApi<MemberIndex>(""),
  });
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
    from = month + "-01",
    through = validMonth
      ? new Date(
          Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
        )
          .toISOString()
          .slice(0, 10)
      : from;
  const register = useQuery({
    queryKey: [
      "member-services",
      club?.id,
      user?.id,
      role,
      "attendance",
      month,
      team,
    ],
    queryFn: () =>
      memberApi<Register>(
        `/attendance?from=${from}&through=${through}${team ? "&teamId=" + team : ""}`,
      ),
    enabled: validMonth,
  });
  const teams = (index.data?.teams ?? []).filter(
    (t) =>
      !sector || t.section.replaceAll("-", "_") === sector.replaceAll("-", "_"),
  );
  const events = (register.data?.events ?? []).filter(
    (e) =>
      e.kind === kind &&
      (!sector || teams.some((t) => e.teamIds.includes(t.id))),
  );
  const people = (register.data?.members ?? []).filter(
    (p) =>
      (!sector ||
        p.sections.some(
          (s) => s.replaceAll("-", "_") === sector.replaceAll("-", "_"),
        ) ||
        p.teamIds.some((id) => teams.some((t) => t.id === id))) &&
      `${p.name} ${roleNames(p)}`
        .toLocaleLowerCase("it")
        .includes(search.toLocaleLowerCase("it")),
  );
  const selectedEvent = events.find((e) => e.id === Number(selected));
  const change = (fn: () => void) => {
    if (
      dirty &&
      !window.confirm(
        "Cambiare vista e scartare le modifiche non salvate all’appello membri?",
      )
    )
      return;
    setDirty(false);
    setSelected("");
    fn();
  };
  const summary = people.map((p) => {
    const records = (register.data?.records ?? []).filter(
      (r) =>
        r.userId === p.id &&
        r.kind === kind &&
        events.some((e) => e.id === r.eventId),
    );
    const present = records.filter((r) => r.status === "present").length,
      absent = records.filter((r) => r.status === "absent").length;
    const assigned = events.filter(
      (e) =>
        e.teamIds.some((id) => p.teamIds.includes(id)) ||
        p.roles.some((r) =>
          [
            "director",
            "technical_director",
            "sporting_director",
            "presidente",
            "admin",
            "secretary",
          ].includes(r),
        ) ||
        records.some((r) => r.eventId === e.id),
    );
    return {
      p,
      present,
      absent,
      pending: Math.max(0, assigned.length - present - absent),
      records,
    };
  });
  const rows = summary.map((r) => ({
    Membro: r.p.name,
    Incarichi: roleNames(r.p),
    Annate: r.p.teamIds
      .map((id) => index.data?.teams.find((t) => t.id === id)?.name ?? id)
      .join(" · "),
    Presenti: r.present,
    Assenti: r.absent,
    "Appelli registrati": r.present + r.absent,
    "Da registrare": r.pending,
  }));
  const details = summary.flatMap((r) =>
    r.records.map((record) => ({
      Membro: r.p.name,
      Evento: events.find((e) => e.id === record.eventId)?.title ?? "",
      Data: dateLabel(events.find((e) => e.id === record.eventId)!.date),
      Stato:
        record.status === "present"
          ? "Presente"
          : record.status === "absent"
            ? "Assente"
            : "Da registrare",
      Note: record.notes,
    })),
  );
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Presenze membri</h1>
        <p className="text-sm text-muted-foreground">
          Allenamenti e partite · registrazione distinta dai giocatori e dai
          compensi.
        </p>
      </div>
      <div className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          Mese
          <Input
            type="month"
            value={month}
            onChange={(e) => change(() => setMonth(e.target.value))}
          />
        </label>
        <label className="text-sm">
          Settore
          <ScrollableSelect
            aria-label="Settore presenze membri"
            value={sector}
            onValueChange={(v) =>
              change(() => {
                setSector(v);
                setTeam("");
              })
            }
          >
            <option value="">Tutti i settori</option>
            <option value="scuola_calcio">Scuola Calcio</option>
            <option value="settore_giovanile">Settore Giovanile</option>
            <option value="prima_squadra">Prima Squadra</option>
          </ScrollableSelect>
        </label>
        <label className="text-sm">
          Annata
          <ScrollableSelect
            aria-label="Annata presenze membri"
            value={team}
            onValueChange={(v) => change(() => setTeam(v))}
          >
            <option value="">Tutte</option>
            {teams.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name}
              </option>
            ))}
          </ScrollableSelect>
        </label>
        <label className="text-sm">
          Cerca membro o ruolo
          <Input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["training", "match"] as const).map((k) => (
            <Button
              type="button"
              key={k}
              aria-pressed={kind === k}
              variant={kind === k ? "default" : "outline"}
              onClick={() => change(() => setKind(k))}
            >
              {k === "training" ? "Allenamenti" : "Partite"}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!rows.length}
            onClick={() =>
              exportMultiSheet(
                [
                  { name: "Riepilogo membri", rows },
                  { name: "Appelli", rows: details },
                ],
                `presenze-membri-${kind}-${month}.xlsx`,
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
                  heading: `PRESENZE MEMBRI - ${month} - ${kind === "training" ? "Allenamenti" : "Partite"}`,
                  lines: rows.flatMap((r) => [
                    r.Membro + " · " + r.Incarichi,
                    `Presenti ${r.Presenti}/${r["Appelli registrati"]} · Assenti ${r.Assenti} · Da registrare ${r["Da registrare"]}`,
                    "",
                  ]),
                },
              ]);
              void downloadExport(blob,`presenze-membri-${month}.pdf`);
            }}
          >
            Esporta PDF
          </Button>
        </div>
      </div>
      {!validMonth ? (
        <p>Seleziona un mese valido.</p>
      ) : register.isError || index.isError ? (
        <p role="alert" className="text-destructive">
          {register.error?.message ?? index.error?.message}
        </p>
      ) : register.isPending ? (
        <p>Caricamento presenze membri…</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-muted/40 text-left text-xs">
                <tr>
                  <th className="p-3">Membro e incarichi</th>
                  <th className="p-3">Annate</th>
                  <th className="p-3">Presenti / registrati</th>
                  <th className="p-3">Assenti</th>
                  <th className="p-3">Da registrare</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={r.p.id} className="border-t">
                    <td className="p-3 font-medium">
                      {r.p.name}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {roleNames(r.p)}
                      </span>
                    </td>
                    <td className="p-3">
                      {r.p.teamIds
                        .map(
                          (id) =>
                            index.data?.teams.find((t) => t.id === id)?.name,
                        )
                        .filter(Boolean)
                        .join(" · ") || "Incarico trasversale"}
                    </td>
                    <td className="p-3">
                      {r.present}/{r.present + r.absent}
                    </td>
                    <td className="p-3">{r.absent}</td>
                    <td className="p-3">{r.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="block space-y-1 text-sm">
            Apri appello membri
            <ScrollableSelect
              aria-label="Evento appello membri"
              value={selectedEvent ? selected : ""}
              onValueChange={(v) => {
                if (
                  dirty &&
                  !window.confirm(
                    "Scartare le modifiche non salvate e aprire un altro evento?",
                  )
                )
                  return;
                setDirty(false);
                setSelected(v);
              }}
            >
              <option value="">
                Seleziona {kind === "training" ? "allenamento" : "partita"}
              </option>
              {events.map((e) => (
                <option key={e.id} value={String(e.id)}>
                  {dateLabel(e.date)} · {e.title} ·{" "}
                  {index.data?.teams.find((t) => t.id === e.teamId)?.name ??
                    "Senza annata"}
                </option>
              ))}
            </ScrollableSelect>
          </label>
          {!events.length && (
            <p className="text-sm text-muted-foreground">
              Nessun evento già registrato per il periodo e i filtri
              selezionati.
            </p>
          )}
          {selectedEvent && (
            <Roll
              key={`${kind}:${selected}`}
              event={selectedEvent}
              people={register.data.members}
              initial={register.data.records.filter(
                (r) => r.kind === kind && r.eventId === selectedEvent.id,
              )}
              onDirty={setDirty}
              onSaved={() => setSelected("")}
            />
          )}
        </>
      )}
    </div>
  );
}
