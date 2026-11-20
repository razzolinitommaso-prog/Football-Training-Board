import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react/custom-fetch";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
export function SeniorTestCard() {
  const { role } = useAuth(),
    started = useRef(false);
  const create = useMutation({
    mutationFn: () =>
      customFetch<{ id: number }>("/api/society-management/test-player", {
        method: "POST",
        body: "{}",
      }),
  });
  const allowed = ["admin", "presidente", "director", "secretary"].includes(
    role ?? "",
  );
  useEffect(() => {
    if (allowed && !started.current) {
      started.current = true;
      create.mutate();
    }
  }, [allowed]);
  if (!allowed) return null;
  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <h3 className="font-semibold">
        Scheda dimostrativa · giocatore Prima Squadra
      </h3>
      <p className="text-sm text-muted-foreground">
        Esclusa dalle rose attive, dalle previsioni, dai riepiloghi economici
        reali e dalle comunicazioni. Puoi provare accordi e rate nella sua
        scheda.
      </p>
      {create.isSuccess ? (
        <Button asChild variant="outline">
          <a href={"/prima-squadra/players?openPlayerId=" + create.data.id}>
            Apri giocatore TEST
          </a>
        </Button>
      ) : create.isError ? (
        <>
          <p role="alert">{create.error.message}</p>
          <Button onClick={() => create.mutate()}>Riprova creazione</Button>
        </>
      ) : (
        <p>Preparazione scheda test…</p>
      )}
    </div>
  );
}
