import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react/custom-fetch";
import {
  playerArchiveLabels,
  memberFmDate,
  trainingLocalDate,
  type MemberContract,
} from "@workspace/api-zod";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FinanceApiProvider,
  MemberContractEditor,
  MemberExpensesPanel,
} from "@/components/members/member-finance";
import type { MemberIndex, MemberProfile } from "@/lib/member-services";
const api = <T,>(path: string, method = "GET", body?: unknown) =>
  customFetch<T>("/api" + path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
export function PlayerOperations({
  player,
}: {
  player: { id: number; clubSection?: string | null };
}) {
  const { role, club } = useAuth(),
    [show, setShow] = useState(false),
    [position, setPosition] = useState<any>(),
    [editor, setEditor] = useState<MemberContract>(),
    cache = useQueryClient(),
    { toast } = useToast();
  const manage = [
    "admin",
    "presidente",
    "director",
    "secretary",
    "sporting_director",
    "technical_director",
  ].includes(role ?? "");
  const finance =
    ["admin", "presidente", "director", "secretary"].includes(role ?? "") &&
    player.clubSection === "prima_squadra";
  const q = useQuery({
    queryKey: ["player-position", club?.id, player.id],
    queryFn: () => api<any>(`/player-positions/${player.id}`),
    enabled: show && manage,
  });
  const index = useQuery({
    queryKey: ["member-services", "player-finance", club?.id, "index"],
    queryFn: () => api<MemberIndex>("/player-finance"),
    enabled: show && finance,
  });
  const detail = useQuery({
    queryKey: ["member-services", "player-finance", club?.id, player.id],
    queryFn: () => api<MemberProfile>(`/player-finance/${player.id}/profile`),
    enabled: show && finance,
  });
  const save = useMutation({
    mutationFn: () =>
      api(`/player-positions/${player.id}`, "PUT", position ?? q.data),
    onSuccess: () => {
      setPosition(undefined);
      void cache.invalidateQueries();
      toast({
        title: "Posizione giocatore salvata",
        description:
          "Rose e conteggi aggiornati. Chiudi e riapri la scheda per rileggere i dati generali.",
      });
    },
    onError: (e) =>
      toast({
        title: "Posizione non salvata",
        description: e.message,
        variant: "destructive",
      }),
  });
  if (!manage) return null;
  const p = position ?? q.data;
  const create = () => {
    const s = index.data?.seasons.find((s) => s.isActive);
    if (!s) return;
    const from = trainingLocalDate().slice(0, 7);
    const start =
      from >= s.startDate.slice(0, 7) && from <= s.endDate.slice(0, 7)
        ? from
        : s.startDate.slice(0, 7);
    const to = s.endDate.slice(0, 7);
    setEditor({
      id: crypto.randomUUID(),
      revision: 0,
      title: "Accordo giocatore Prima Squadra",
      role: "player",
      seasonId: s.id,
      fromMonth: start,
      toMonth: to,
      contractType: "annual",
      amountMode: "monthly",
      compensationCents: 0,
      reimbursementCents: 0,
      terms: "30",
      lastPaymentDate: memberFmDate(to, "30"),
      allocations: [],
      notes: "",
      documentId: null,
      active: true,
    });
  };
  return (
    <div className="rounded-xl border p-3 space-y-3">
      <Button
        variant="outline"
        type="button"
        onClick={() => setShow((v) => !v)}
      >
        Posizione e archivio{finance ? " · Contratti e compensi" : ""}
      </Button>
      {show && (
        <>
          {q.isError ? (
            <p role="alert">{q.error.message}</p>
          ) : (
            p && (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    window.confirm(
                      "Confermi il cambio di posizione? Lo storico viene conservato.",
                    )
                  )
                    save.mutate();
                }}
              >
                <h3 className="font-semibold">Posizione nella società</h3>
                <div className="responsive-form-grid gap-3">
                  <label>
                    Stato
                    <select
                      className="w-full rounded border bg-background p-2"
                      value={p.state}
                      onChange={(e) =>
                        setPosition({ ...p, state: e.target.value })
                      }
                    >
                      <option value="active">Attivo nella società</option>
                      {Object.entries(playerArchiveLabels).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Decorrenza
                    <Input
                      type="date"
                      required
                      max={trainingLocalDate()}
                      value={p.effectiveDate?.slice(0, 10) ?? ""}
                      onChange={(e) =>
                        setPosition({ ...p, effectiveDate: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  Motivazione / note obbligatorie
                  <Textarea
                    value={p.notes}
                    required
                    minLength={3}
                    onChange={(e) =>
                      setPosition({ ...p, notes: e.target.value })
                    }
                  />
                </label>
                <p className="text-sm text-muted-foreground">
                  Attivo non significa disponibile: infortuni e blocchi
                  temporanei restano separati. Il ritiro definitivo esclude
                  anche dalle transizioni future.
                </p>
                <Button disabled={save.isPending}>Salva posizione</Button>
              </form>
            )
          )}
          {finance && (
            <FinanceApiProvider playerId={player.id}>
              <hr />
              <h3 className="font-semibold">
                Contratti, compensi e rimborsi · Prima Squadra
              </h3>
              {detail.error ? (
                <p role="alert">{detail.error.message}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={!index.data}
                      onClick={create}
                    >
                      Nuovo accordo
                    </Button>
                    {detail.data?.contracts.map((c) => (
                      <Button
                        type="button"
                        key={c.id}
                        variant="outline"
                        onClick={() => setEditor(c)}
                      >
                        {c.title}
                      </Button>
                    ))}
                  </div>
                  {editor && index.data && detail.data && (
                    <MemberContractEditor
                      key={editor.id}
                      userId={player.id}
                      initial={editor}
                      index={index.data}
                      documents={detail.data.documents}
                      onClose={() => setEditor(undefined)}
                    />
                  )}
                  <MemberExpensesPanel userId={player.id} />
                </>
              )}
            </FinanceApiProvider>
          )}
        </>
      )}
    </div>
  );
}
