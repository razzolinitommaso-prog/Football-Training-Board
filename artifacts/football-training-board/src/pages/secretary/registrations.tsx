import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, ClipboardList, Plus, Trash2 } from "lucide-react";
import { withApi } from "@/lib/api-base";

interface Registration { id: number; playerId: number; playerName?: string; status: string; registrationDate?: string; seasonId?: number | null; notes?: string; }
interface Player {
  id: number;
  firstName: string;
  lastName: string;
  role?: string | null;
  teamName?: string | null;
  dateOfBirth?: string | null;
  registrationStatus?: string | null;
}
interface Season { id: number; name: string; }

function playerName(player: Player): string {
  return [player.lastName, player.firstName].filter(Boolean).join(" ");
}

function sortPlayersBySurname(players: Player[]): Player[] {
  return [...players].sort((a, b) => playerName(a).localeCompare(playerName(b), "it", { sensitivity: "base", numeric: true }));
}

function registrationStatusLabel(status?: string | null): string {
  switch (status) {
    case "approved": return "Tesserato";
    case "rejected": return "Respinto";
    case "pending": return "In attesa";
    default: return "Non indicato";
  }
}

function playerSearchText(player: Player): string {
  return [
    playerName(player),
    player.teamName,
    player.role,
    player.dateOfBirth,
    registrationStatusLabel(player.registrationStatus),
  ].filter(Boolean).join(" ");
}

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(withApi(url), { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  approved: "default", pending: "secondary", rejected: "destructive",
};

export default function RegistrationsPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [playerPickerOpen, setPlayerPickerOpen] = useState(false);
  const [playerId, setPlayerId] = useState(""); const [seasonId, setSeasonId] = useState("");
  const [status, setStatus] = useState("pending"); const [regDate, setRegDate] = useState("");

  const { data: registrations = [], isLoading } = useQuery<Registration[]>({ queryKey: ["/api/registrations"], queryFn: () => apiFetch("/api/registrations") });
  const { data: players = [] } = useQuery<Player[]>({ queryKey: ["/api/players"], queryFn: () => apiFetch("/api/players") });
  const { data: seasons = [] } = useQuery<Season[]>({ queryKey: ["/api/seasons"], queryFn: () => apiFetch("/api/seasons") });

  const orderedPlayers = useMemo(() => sortPlayersBySurname(players), [players]);
  const selectedPlayer = useMemo(
    () => orderedPlayers.find((p) => String(p.id) === playerId) ?? null,
    [orderedPlayers, playerId],
  );
  const selectedSeasonId = seasonId ? Number(seasonId) : null;
  const selectedPlayerExistingRegistration = useMemo(() => {
    if (!playerId) return null;
    const pid = Number(playerId);
    return registrations.find((registration) => {
      if (registration.playerId !== pid) return false;
      if (selectedSeasonId == null) return registration.seasonId == null;
      return Number(registration.seasonId ?? 0) === selectedSeasonId;
    }) ?? null;
  }, [playerId, registrations, selectedSeasonId]);

  const create = useMutation({
    mutationFn: (d: object) => apiFetch("/api/registrations", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/registrations"] }); setOpen(false); setPlayerPickerOpen(false); setPlayerId(""); setSeasonId(""); setStatus("pending"); setRegDate(""); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const patch = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiFetch(`/api/registrations/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/registrations"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/registrations/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/registrations"] }),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardList className="w-6 h-6 text-primary" />{t.registrations}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.registrationsDesc}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />{t.addRegistration}</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{t.addRegistration}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); create.mutate({ playerId: Number(playerId), seasonId: seasonId ? Number(seasonId) : null, status, registrationDate: regDate || null }); }} className="space-y-4">
              <div className="space-y-2">
                <Label>{t.player}</Label>
                <Popover open={playerPickerOpen} onOpenChange={setPlayerPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={playerPickerOpen}
                      className="h-auto min-h-11 w-full justify-between gap-3 px-3 py-2 text-left font-normal"
                    >
                      {selectedPlayer ? (
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">{playerName(selectedPlayer)}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[selectedPlayer.teamName || "Senza squadra", selectedPlayer.role || "Ruolo non indicato"].join(" · ")}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t.selectPlayer ?? "Seleziona giocatore"}</span>
                      )}
                      <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command filter={(value, search) => {
                      const player = orderedPlayers.find((p) => String(p.id) === value);
                      if (!player) return 0;
                      return playerSearchText(player).toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                    }}>
                      <CommandInput placeholder="Cerca per nome, squadra, ruolo..." />
                      <CommandList className="max-h-72">
                        <CommandEmpty>Nessun giocatore trovato.</CommandEmpty>
                        <CommandGroup>
                          {orderedPlayers.map((p) => {
                            const name = playerName(p);
                            const existingForSeason = registrations.some((registration) => {
                              if (registration.playerId !== p.id) return false;
                              if (selectedSeasonId == null) return registration.seasonId == null;
                              return Number(registration.seasonId ?? 0) === selectedSeasonId;
                            });
                            return (
                              <CommandItem
                                key={p.id}
                                value={String(p.id)}
                                onSelect={() => {
                                  setPlayerId(String(p.id));
                                  setPlayerPickerOpen(false);
                                }}
                                className="items-start gap-3 py-2"
                              >
                                <Check className={cn("mt-1 h-4 w-4 shrink-0", playerId === String(p.id) ? "opacity-100" : "opacity-0")} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-medium">{name || `Giocatore ${p.id}`}</span>
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {[p.teamName || "Senza squadra", p.role || "Ruolo non indicato", p.dateOfBirth ? `Nato il ${p.dateOfBirth}` : null].filter(Boolean).join(" · ")}
                                  </span>
                                </span>
                                <span className="flex shrink-0 flex-col items-end gap-1">
                                  {existingForSeason && <Badge variant="secondary" className="text-[10px]">Gia inserito</Badge>}
                                  <Badge variant={p.registrationStatus === "approved" ? "default" : "outline"} className="text-[10px]">
                                    {registrationStatusLabel(p.registrationStatus)}
                                  </Badge>
                                </span>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedPlayer && (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    <div className="font-medium">{playerName(selectedPlayer)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {[selectedPlayer.teamName || "Senza squadra", selectedPlayer.role || "Ruolo non indicato", selectedPlayer.dateOfBirth ? `Nato il ${selectedPlayer.dateOfBirth}` : null].filter(Boolean).join(" · ")}
                    </div>
                    {selectedPlayerExistingRegistration && (
                      <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                        Questo giocatore ha gia un'iscrizione per la stagione selezionata.
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t.seasons}</Label>
                <Select value={seasonId} onValueChange={setSeasonId}>
                  <SelectTrigger><SelectValue placeholder={t.seasons} /></SelectTrigger>
                  <SelectContent>{seasons.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.registrationStatus}</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">{t.regPending}</SelectItem>
                      <SelectItem value="approved">{t.regApproved}</SelectItem>
                      <SelectItem value="rejected">{t.regRejected}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>{t.registrationDate}</Label><Input type="date" value={regDate} onChange={e => setRegDate(e.target.value)} /></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t.cancel}</Button>
                <Button type="submit" disabled={!playerId || !!selectedPlayerExistingRegistration || create.isPending}>{t.save}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <div className="text-center py-12 text-muted-foreground">{t.loading}</div>
        : registrations.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">{t.noRegistrations}</CardContent></Card>
        : (
          <div className="grid gap-3">
            {registrations.map((r) => (
              <Card key={r.id}>
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-semibold">{r.playerName}</p>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <Badge variant={statusVariant[r.status] ?? "secondary"}>{r.status}</Badge>
                      {r.registrationDate && <span>{r.registrationDate}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={r.status} onValueChange={(v) => patch.mutate({ id: r.id, status: v })}>
                      <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">{t.regPending}</SelectItem>
                        <SelectItem value="approved">{t.regApproved}</SelectItem>
                        <SelectItem value="rejected">{t.regRejected}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" className="text-destructive h-8 w-8" onClick={() => remove.mutate(r.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
    </div>
  );
}
