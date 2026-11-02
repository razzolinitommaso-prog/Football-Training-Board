import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { withApi } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
type Tournament = {
  id: number;
  revision: number;
  name: string;
  location: string;
  startDate: string;
  endDate: string | null;
  teams: { id: number; name: string }[];
};
async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(withApi(url), {
    method,
    credentials: "include",
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error ?? "Operazione non riuscita");
  return data;
}
type Document = { id: number; name: string; dataUrl: string };
export default function SharedTournamentCommon({
  tournament: t,
  canManage,
}: {
  tournament: Tournament;
  canManage: boolean;
}) {
  const { club, user, role } = useAuth();
  const qc = useQueryClient(),
    [open, setOpen] = useState(false),
    [name, setName] = useState(t.name),
    [location, setLocation] = useState(t.location),
    [start, setStart] = useState(t.startDate),
    [end, setEnd] = useState(t.endDate ?? "");
  const [error, setError] = useState(""),
    [editRevision, setEditRevision] = useState(t.revision);
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["shared-tournaments"] }),
      qc.invalidateQueries({ queryKey: ["/api/matches"] }),
      qc.invalidateQueries({ queryKey: ["/api/tournament-documents"] }),
      qc.invalidateQueries({ queryKey: ["shared-program"] }),
    ]);
  };
  const edit = useMutation({
    mutationFn: () =>
      api(`/api/shared-tournaments/${t.id}`, "PATCH", {
        expectedRevision: editRevision,
        name,
        location,
        startDate: start,
        endDate: end || null,
        teamIds: t.teams.map((team) => team.id),
      }),
    onSuccess: async () => {
      await refresh();
      setOpen(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/shared-tournaments/${t.id}`, "DELETE"),
    onSuccess: async () => {
      await refresh();
      window.location.assign(window.location.pathname + "?phase=tornei");
    },
  });
  const docs = useQuery({
    queryKey: ["shared-tournament-documents", t.id, club?.id, user?.id, role],
    queryFn: () => api<Document[]>(`/api/shared-tournaments/${t.id}/documents`),
  });
  const upload = useMutation({
    mutationFn: (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(Error("File non leggibile"));
        reader.readAsDataURL(file);
      }).then((dataUrl) =>
        api(`/api/shared-tournaments/${t.id}/documents`, "POST", {
          name: file.name,
          dataUrl,
        }),
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["shared-tournament-documents", t.id] }),
  });
  const removeDoc = useMutation({
    mutationFn: (id: number) =>
      api(`/api/shared-tournaments/${t.id}/documents/${id}`, "DELETE"),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["shared-tournament-documents", t.id] }),
  });
  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <div className="flex flex-wrap gap-2">
        <span className="mr-auto text-sm font-medium">
          Dati e allegati comuni a tutte le annate
        </span>
        {canManage && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditRevision(t.revision);
                setName(t.name);
                setLocation(t.location);
                setStart(t.startDate);
                setEnd(t.endDate ?? "");
                edit.reset();
                setOpen(true);
              }}
            >
              Modifica dati comuni
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={remove.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Eliminare il torneo ${t.name} per tutte le annate? Le gare esistenti impediscono l’eliminazione automatica.`,
                  )
                )
                  remove.mutate();
              }}
            >
              Elimina torneo
            </Button>
          </>
        )}
      </div>
      {remove.isError && (
        <p role="alert" className="text-sm text-destructive">
          {remove.error.message}
        </p>
      )}
      {docs.isLoading && <p className="text-sm">Caricamento allegati…</p>}
      {docs.isError && (
        <p role="alert">
          Allegati non disponibili.{" "}
          <button onClick={() => docs.refetch()}>Riprova</button>
        </p>
      )}
      {docs.data?.map((doc) => (
        <div key={doc.id} className="flex flex-wrap items-center gap-3">
          <a
            className="text-sm text-primary underline break-all"
            href={doc.dataUrl}
            download={doc.name}
          >
            {doc.name}
          </a>
          {canManage && (
            <Button
              variant="ghost"
              size="sm"
              disabled={removeDoc.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Eliminare questo allegato comune per tutte le annate?",
                  )
                )
                  removeDoc.mutate(doc.id);
              }}
            >
              Rimuovi
            </Button>
          )}
        </div>
      ))}
      {docs.data?.length === 0 && (
        <p className="text-xs text-muted-foreground">Nessun allegato comune.</p>
      )}
      {canManage && (
        <div>
          <Label htmlFor={`shared-file-${t.id}`}>
            Aggiungi PDF o immagine comune (massimo 10 MB)
          </Label>
          <Input
            id={`shared-file-${t.id}`}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            disabled={upload.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              setError("");
              if (file) {
                if (file.size > 10 * 1024 * 1024)
                  setError("Il file supera 10 MB");
                else upload.mutate(file);
              }
            }}
          />
        </div>
      )}
      {(error || upload.isError || removeDoc.isError) && (
        <p role="alert" className="text-sm text-destructive">
          {error || upload.error?.message || removeDoc.error?.message}
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifica dati comuni</DialogTitle>
            <DialogDescription>
              Le modifiche aggiornano il torneo e i dati comuni delle gare di
              tutte le annate. Non cambiano convocazioni o schieramenti.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              edit.mutate();
            }}
          >
            <div>
              <Label htmlFor="shared-edit-name">Nome</Label>
              <Input
                id="shared-edit-name"
                required
                maxLength={180}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="shared-edit-place">Luogo</Label>
              <Input
                id="shared-edit-place"
                maxLength={500}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="shared-edit-start">Data inizio</Label>
              <Input
                id="shared-edit-start"
                required
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="shared-edit-end">Data fine</Label>
              <Input
                id="shared-edit-end"
                type="date"
                min={start}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Annate: {t.teams.map((team) => team.name).join(", ")}
            </p>
            {edit.isError && (
              <p role="alert" className="text-sm text-destructive">
                {edit.error.message}
              </p>
            )}
            <Button disabled={edit.isPending}>
              {edit.isPending ? "Salvataggio…" : "Salva per tutte le annate"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
