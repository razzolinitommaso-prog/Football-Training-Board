import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight, CheckCircle2, XCircle, ArrowLeftRight, Banknote,
  Users, RefreshCw, ChevronRight, User, Loader2, Plus, Eye,
  Trash2, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Season { id: number; name: string; startDate: string; endDate: string; isActive: boolean; }

interface PlayerStatus {
  playerId: number; firstName: string; lastName: string;
  teamId: number | null; clubSection: string; position: string | null; dateOfBirth: string | null;
  statusId: number | null; status: string;
  transferAmount: number | null;
  swapPlayerData: {
    firstName?: string; lastName?: string; age?: number; height?: number; weight?: number;
    position?: string; isLoan?: boolean; clubOrigin?: string;
  } | null;
  notes: string | null;
}

interface ObservedPlayer {
  id: number; clubId: number; seasonId: number;
  firstName: string; lastName: string; dateOfBirth: string | null;
  position: string | null; height: number | null; weight: number | null;
  clubOrigin: string | null; notes: string | null;
  acquisitionStatus: string; transferAmount: number | null;
  departingPlayerData: {
    firstName?: string; lastName?: string; position?: string;
    clubDestination?: string; notes?: string;
  } | null;
}

const STATUS_OPTIONS = [
  { value: "pending",         label: "In attesa",              color: "bg-gray-100 text-gray-700 border-gray-200",       icon: "⏳" },
  { value: "confirmed",       label: "Riconfermato",           color: "bg-green-100 text-green-700 border-green-200",    icon: "✓" },
  { value: "not_confirmed",   label: "Non confermato",         color: "bg-red-100 text-red-700 border-red-200",          icon: "✗" },
  { value: "transfer_free",   label: "Trasf. gratuito",        color: "bg-blue-100 text-blue-700 border-blue-200",       icon: "→" },
  { value: "transfer_paid",   label: "Trasf. oneroso",         color: "bg-purple-100 text-purple-700 border-purple-200", icon: "€" },
  { value: "swap",            label: "Scambio",                color: "bg-amber-100 text-amber-700 border-amber-200",    icon: "⇄" },
  { value: "swap_loan",       label: "Scambio prestito",       color: "bg-orange-100 text-orange-700 border-orange-200", icon: "⇄₂" },
];

const ACQUISITION_OPTIONS = [
  { value: "pending",         label: "In attesa",              color: "bg-gray-100 text-gray-700 border-gray-200",       icon: "⏳" },
  { value: "transfer_free",   label: "Titolo gratuito",        color: "bg-blue-100 text-blue-700 border-blue-200",       icon: "→" },
  { value: "transfer_paid",   label: "Titolo oneroso",         color: "bg-purple-100 text-purple-700 border-purple-200", icon: "€" },
  { value: "swap",            label: "Scambio",                color: "bg-amber-100 text-amber-700 border-amber-200",    icon: "⇄" },
  { value: "swap_loan",       label: "Scambio prestito",       color: "bg-orange-100 text-orange-700 border-orange-200", icon: "⇄₂" },
];

const NEEDS_AMOUNT = ["transfer_paid"];
const NEEDS_SWAP_DATA = ["swap", "swap_loan"];

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options, credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

function calcAge(dateOfBirth: string | null) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function StatusBadge({ status, options = STATUS_OPTIONS }: { status: string; options?: typeof STATUS_OPTIONS }) {
  const opt = options.find(o => o.value === status) ?? options[0];
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${opt.color}`}>
      {opt.icon} {opt.label}
    </span>
  );
}

function PlayerRow({ player, teams, onEdit }: {
  player: PlayerStatus;
  teams: { id: number; name: string }[];
  onEdit: (p: PlayerStatus) => void;
}) {
  const teamName = teams.find(t => t.id === player.teamId)?.name ?? "—";
  const age = calcAge(player.dateOfBirth);
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 border-b last:border-b-0 transition-colors cursor-pointer"
      onClick={() => onEdit(player)}
    >
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <User className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{player.firstName} {player.lastName}</div>
        <div className="text-xs text-muted-foreground flex gap-2 flex-wrap">
          <span>{teamName}</span>
          {player.position && <span>· {player.position}</span>}
          {age !== null && <span>· {age} anni</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <StatusBadge status={player.status} />
        {player.transferAmount != null && (
          <span className="text-xs font-semibold text-purple-700">€{player.transferAmount.toLocaleString()}</span>
        )}
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  );
}

function ObservedRow({ player, onEdit, onDelete }: {
  player: ObservedPlayer;
  onEdit: (p: ObservedPlayer) => void;
  onDelete: (id: number) => void;
}) {
  const age = calcAge(player.dateOfBirth);
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 border-b last:border-b-0 transition-colors">
      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
        <Eye className="w-4 h-4 text-amber-600" />
      </div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onEdit(player)}>
        <div className="font-medium text-sm truncate">{player.firstName} {player.lastName}</div>
        <div className="text-xs text-muted-foreground flex gap-2 flex-wrap">
          {player.clubOrigin && <span className="flex items-center gap-0.5"><Building2 className="w-3 h-3" />{player.clubOrigin}</span>}
          {player.position && <span>· {player.position}</span>}
          {age !== null && <span>· {age} anni</span>}
          {player.height && <span>· {player.height}cm</span>}
          {player.weight && <span>/ {player.weight}kg</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <StatusBadge status={player.acquisitionStatus} options={ACQUISITION_OPTIONS} />
        {player.transferAmount != null && (
          <span className="text-xs font-semibold text-purple-700">€{player.transferAmount.toLocaleString()}</span>
        )}
        <Button
          variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-600"
          onClick={e => { e.stopPropagation(); onDelete(player.id); }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
        <ChevronRight className="w-4 h-4 text-muted-foreground cursor-pointer" onClick={() => onEdit(player)} />
      </div>
    </div>
  );
}

function EditPlayerDialog({ player, seasonId, open, onClose, teams }: {
  player: PlayerStatus | null; seasonId: number; open: boolean; onClose: () => void;
  teams: { id: number; name: string }[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [status, setStatus] = useState("pending");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [swapFirst, setSwapFirst] = useState("");
  const [swapLast, setSwapLast] = useState("");
  const [swapAge, setSwapAge] = useState("");
  const [swapHeight, setSwapHeight] = useState("");
  const [swapWeight, setSwapWeight] = useState("");
  const [swapPos, setSwapPos] = useState("");
  const [swapClubOrigin, setSwapClubOrigin] = useState("");

  useEffect(() => {
    if (player) {
      setStatus(player.status);
      setAmount(player.transferAmount?.toString() ?? "");
      setNotes(player.notes ?? "");
      setSwapFirst(player.swapPlayerData?.firstName ?? "");
      setSwapLast(player.swapPlayerData?.lastName ?? "");
      setSwapAge(player.swapPlayerData?.age?.toString() ?? "");
      setSwapHeight(player.swapPlayerData?.height?.toString() ?? "");
      setSwapWeight(player.swapPlayerData?.weight?.toString() ?? "");
      setSwapPos(player.swapPlayerData?.position ?? "");
      setSwapClubOrigin(player.swapPlayerData?.clubOrigin ?? "");
    }
  }, [player]);

  const saveMutation = useMutation({
    mutationFn: () => apiFetch(`/api/seasons/${seasonId}/player-status`, {
      method: "POST",
      body: JSON.stringify({
        playerId: player?.playerId, status,
        transferAmount: NEEDS_AMOUNT.includes(status) && amount ? parseInt(amount) : null,
        swapPlayerData: NEEDS_SWAP_DATA.includes(status) ? {
          firstName: swapFirst || undefined, lastName: swapLast || undefined,
          age: swapAge ? parseInt(swapAge) : undefined,
          height: swapHeight ? parseInt(swapHeight) : undefined,
          weight: swapWeight ? parseInt(swapWeight) : undefined,
          position: swapPos || undefined, isLoan: status === "swap_loan",
          clubOrigin: swapClubOrigin || undefined,
        } : null,
        notes: notes || null,
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/seasons", seasonId, "player-status"] });
      toast({ title: "Stato aggiornato" });
      onClose();
    },
    onError: () => toast({ title: "Errore", variant: "destructive" }),
  });

  if (!player) return null;
  const teamName = teams.find(t => t.id === player.teamId)?.name ?? "—";
  const needsAmount = NEEDS_AMOUNT.includes(status);
  const needsSwap = NEEDS_SWAP_DATA.includes(status);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{player.firstName} {player.lastName}</DialogTitle>
          <p className="text-sm text-muted-foreground">{teamName}{player.position ? ` · ${player.position}` : ""}</p>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">Stato stagione</Label>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all text-left",
                    status === opt.value
                      ? `${opt.color} ring-2 ring-offset-1 ring-current`
                      : "bg-muted/30 hover:bg-muted/60 border-transparent text-muted-foreground"
                  )}
                >
                  <span>{opt.icon}</span>
                  <span className="text-xs">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {needsAmount && (
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Importo (€)</Label>
              <Input type="number" placeholder="Es. 15000" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
          )}

          {needsSwap && (
            <div className="space-y-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="text-xs font-semibold uppercase text-amber-700 mb-1">
                Dati giocatore in arrivo {status === "swap_loan" ? "(prestito)" : ""}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs mb-1 block">Nome</Label>
                  <Input placeholder="Nome" value={swapFirst} onChange={e => setSwapFirst(e.target.value)} />
                </div>
                <div><Label className="text-xs mb-1 block">Cognome</Label>
                  <Input placeholder="Cognome" value={swapLast} onChange={e => setSwapLast(e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Squadra / Società di provenienza</Label>
                <Input placeholder="Es. A.C. Firenze" value={swapClubOrigin} onChange={e => setSwapClubOrigin(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs mb-1 block">Età</Label>
                  <Input type="number" placeholder="Es. 14" value={swapAge} onChange={e => setSwapAge(e.target.value)} />
                </div>
                <div><Label className="text-xs mb-1 block">Altezza (cm)</Label>
                  <Input type="number" placeholder="168" value={swapHeight} onChange={e => setSwapHeight(e.target.value)} />
                </div>
                <div><Label className="text-xs mb-1 block">Peso (kg)</Label>
                  <Input type="number" placeholder="60" value={swapWeight} onChange={e => setSwapWeight(e.target.value)} />
                </div>
              </div>
              <div><Label className="text-xs mb-1 block">Ruolo</Label>
                <Input placeholder="Es. Centrocampista" value={swapPos} onChange={e => setSwapPos(e.target.value)} />
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Note</Label>
            <Textarea placeholder="Note aggiuntive..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="resize-none" />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Annulla</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="flex-1">
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salva
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ObservedPlayerDialog({ player, seasonId, open, onClose }: {
  player: ObservedPlayer | null; seasonId: number; open: boolean; onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isNew = player === null;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [position, setPosition] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [clubOrigin, setClubOrigin] = useState("");
  const [notes, setNotes] = useState("");
  const [acquisitionStatus, setAcquisitionStatus] = useState("pending");
  const [transferAmount, setTransferAmount] = useState("");
  const [depFirst, setDepFirst] = useState("");
  const [depLast, setDepLast] = useState("");
  const [depPos, setDepPos] = useState("");
  const [depDest, setDepDest] = useState("");
  const [depNotes, setDepNotes] = useState("");

  useEffect(() => {
    if (player) {
      setFirstName(player.firstName);
      setLastName(player.lastName);
      setDateOfBirth(player.dateOfBirth ?? "");
      setPosition(player.position ?? "");
      setHeight(player.height?.toString() ?? "");
      setWeight(player.weight?.toString() ?? "");
      setClubOrigin(player.clubOrigin ?? "");
      setNotes(player.notes ?? "");
      setAcquisitionStatus(player.acquisitionStatus);
      setTransferAmount(player.transferAmount?.toString() ?? "");
      setDepFirst(player.departingPlayerData?.firstName ?? "");
      setDepLast(player.departingPlayerData?.lastName ?? "");
      setDepPos(player.departingPlayerData?.position ?? "");
      setDepDest(player.departingPlayerData?.clubDestination ?? "");
      setDepNotes(player.departingPlayerData?.notes ?? "");
    } else {
      setFirstName(""); setLastName(""); setDateOfBirth(""); setPosition("");
      setHeight(""); setWeight(""); setClubOrigin(""); setNotes("");
      setAcquisitionStatus("pending"); setTransferAmount("");
      setDepFirst(""); setDepLast(""); setDepPos(""); setDepDest(""); setDepNotes("");
    }
  }, [player, open]);

  const buildBody = () => ({
    firstName, lastName,
    dateOfBirth: dateOfBirth || null,
    position: position || null,
    height: height ? parseInt(height) : null,
    weight: weight ? parseInt(weight) : null,
    clubOrigin: clubOrigin || null,
    notes: notes || null,
    acquisitionStatus,
    transferAmount: NEEDS_AMOUNT.includes(acquisitionStatus) && transferAmount ? parseInt(transferAmount) : null,
    departingPlayerData: NEEDS_SWAP_DATA.includes(acquisitionStatus) ? {
      firstName: depFirst || undefined,
      lastName: depLast || undefined,
      position: depPos || undefined,
      clubDestination: depDest || undefined,
      notes: depNotes || undefined,
    } : null,
  });

  const createMutation = useMutation({
    mutationFn: () => apiFetch(`/api/seasons/${seasonId}/observed-players`, {
      method: "POST", body: JSON.stringify(buildBody()),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/seasons", seasonId, "observed-players"] });
      toast({ title: "Giocatore aggiunto" });
      onClose();
    },
    onError: () => toast({ title: "Errore", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: () => apiFetch(`/api/seasons/${seasonId}/observed-players/${player!.id}`, {
      method: "PATCH", body: JSON.stringify(buildBody()),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/seasons", seasonId, "observed-players"] });
      toast({ title: "Aggiornato" });
      onClose();
    },
    onError: () => toast({ title: "Errore", variant: "destructive" }),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;
  const needsAmount = NEEDS_AMOUNT.includes(acquisitionStatus);
  const needsDep = NEEDS_SWAP_DATA.includes(acquisitionStatus);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[580px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Aggiungi giocatore in osservazione" : `${player?.firstName} ${player?.lastName}`}</DialogTitle>
          <p className="text-sm text-muted-foreground">Scheda osservazione — dati del giocatore target</p>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Dati giocatore in arrivo */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
            <div className="text-xs font-semibold uppercase text-blue-700 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Dati giocatore osservato
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs mb-1 block">Nome *</Label>
                <Input placeholder="Nome" value={firstName} onChange={e => setFirstName(e.target.value)} />
              </div>
              <div><Label className="text-xs mb-1 block">Cognome *</Label>
                <Input placeholder="Cognome" value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs mb-1 block">Data di nascita</Label>
                <Input type="date" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} />
              </div>
              <div><Label className="text-xs mb-1 block">Ruolo / Posizione</Label>
                <Input placeholder="Es. Portiere" value={position} onChange={e => setPosition(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs mb-1 block">Altezza (cm)</Label>
                <Input type="number" placeholder="Es. 178" value={height} onChange={e => setHeight(e.target.value)} />
              </div>
              <div><Label className="text-xs mb-1 block">Peso (kg)</Label>
                <Input type="number" placeholder="Es. 70" value={weight} onChange={e => setWeight(e.target.value)} />
              </div>
            </div>
            <div><Label className="text-xs mb-1 block flex items-center gap-1"><Building2 className="w-3 h-3" /> Squadra / Società di provenienza</Label>
              <Input placeholder="Es. S.S. Lazio U17" value={clubOrigin} onChange={e => setClubOrigin(e.target.value)} />
            </div>
          </div>

          <Separator />

          {/* Modalità di acquisizione — stessa scheda con eccezione: riguarda il giocatore in partenza */}
          <div>
            <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">Modalità di acquisizione</Label>
            <p className="text-xs text-muted-foreground mb-3">
              Per scambio / titolo oneroso / gratuito: indica il giocatore <strong>in partenza</strong> dalla società.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ACQUISITION_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setAcquisitionStatus(opt.value)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all text-left",
                    acquisitionStatus === opt.value
                      ? `${opt.color} ring-2 ring-offset-1 ring-current`
                      : "bg-muted/30 hover:bg-muted/60 border-transparent text-muted-foreground"
                  )}
                >
                  <span>{opt.icon}</span>
                  <span className="text-xs">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {needsAmount && (
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Importo (€)</Label>
              <Input type="number" placeholder="Es. 20000" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} />
            </div>
          )}

          {needsDep && (
            <div className="space-y-3 bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="text-xs font-semibold uppercase text-red-700 mb-1">
                Giocatore in partenza dalla società
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs mb-1 block">Nome</Label>
                  <Input placeholder="Nome" value={depFirst} onChange={e => setDepFirst(e.target.value)} />
                </div>
                <div><Label className="text-xs mb-1 block">Cognome</Label>
                  <Input placeholder="Cognome" value={depLast} onChange={e => setDepLast(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs mb-1 block">Ruolo</Label>
                  <Input placeholder="Es. Attaccante" value={depPos} onChange={e => setDepPos(e.target.value)} />
                </div>
                <div><Label className="text-xs mb-1 block">Destinazione</Label>
                  <Input placeholder="Es. A.C. Fiorentina" value={depDest} onChange={e => setDepDest(e.target.value)} />
                </div>
              </div>
              <div><Label className="text-xs mb-1 block">Note</Label>
                <Input placeholder="Note accordo..." value={depNotes} onChange={e => setDepNotes(e.target.value)} />
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Note osservazione</Label>
            <Textarea placeholder="Valutazioni, note tecniche, rapporti scout..." value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="resize-none" />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Annulla</Button>
            <Button
              onClick={() => isNew ? createMutation.mutate() : updateMutation.mutate()}
              disabled={isPending || !firstName || !lastName}
              className="flex-1"
            >
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isNew ? "Aggiungi" : "Salva"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const CLUB_SECTIONS = [
  { key: "scuola_calcio",     label: "Scuola Calcio" },
  { key: "settore_giovanile", label: "Settore Giovanile" },
  { key: "prima_squadra",     label: "Prima Squadra" },
];

export default function SeasonTransitionPage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [fromSeasonId, setFromSeasonId] = useState<number | null>(null);
  const [toSeasonId, setToSeasonId] = useState<number | null>(null);
  const [editPlayer, setEditPlayer] = useState<PlayerStatus | null>(null);
  const [editObserved, setEditObserved] = useState<ObservedPlayer | null | "new">(null);
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);

  const { data: seasons = [] } = useQuery<Season[]>({
    queryKey: ["/api/seasons"],
    queryFn: () => apiFetch("/api/seasons"),
  });

  useEffect(() => {
    if (!fromSeasonId && seasons.length > 0) {
      const active = seasons.find(s => s.isActive) ?? seasons[seasons.length - 1];
      if (active) setFromSeasonId(active.id);
    }
  }, [seasons, fromSeasonId]);

  const { data: teams = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/teams"],
    queryFn: () => apiFetch("/api/teams"),
  });

  const { data: playerStatuses = [], isLoading: loadingStatuses } = useQuery<PlayerStatus[]>({
    queryKey: ["/api/seasons", fromSeasonId, "player-status"],
    queryFn: () => apiFetch(`/api/seasons/${fromSeasonId}/player-status`),
    enabled: !!fromSeasonId,
  });

  const { data: observedPlayers = [], isLoading: loadingObserved } = useQuery<ObservedPlayer[]>({
    queryKey: ["/api/seasons", fromSeasonId, "observed-players"],
    queryFn: () => apiFetch(`/api/seasons/${fromSeasonId}/observed-players`),
    enabled: !!fromSeasonId,
  });

  const promoteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/seasons/${fromSeasonId}/promote`, {
      method: "POST", body: JSON.stringify({ toSeasonId }),
    }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/teams"] });
      qc.invalidateQueries({ queryKey: ["/api/players"] });
      toast({
        title: "Promozione completata",
        description: data.promoted?.map((r: any) => `${r.oldTeam} → ${r.newTeam}: ${r.playersPromoted} giocatori`).join(", "),
      });
      setPromoteDialogOpen(false);
    },
    onError: () => toast({ title: "Errore promozione", variant: "destructive" }),
  });

  const deleteObservedMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/seasons/${fromSeasonId}/observed-players/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/seasons", fromSeasonId, "observed-players"] });
      toast({ title: "Rimosso" });
    },
    onError: () => toast({ title: "Errore", variant: "destructive" }),
  });

  const playersBySection = useMemo(() => {
    const map: Record<string, PlayerStatus[]> = {};
    for (const s of CLUB_SECTIONS) map[s.key] = [];
    for (const p of playerStatuses) {
      const sec = p.clubSection in map ? p.clubSection : "scuola_calcio";
      map[sec].push(p);
    }
    return map;
  }, [playerStatuses]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of playerStatuses) counts[p.status] = (counts[p.status] ?? 0) + 1;
    return counts;
  }, [playerStatuses]);

  const canAdmin = role === "admin" || role === "secretary";
  const fromSeason = seasons.find(s => s.id === fromSeasonId);
  const toSeason = seasons.find(s => s.id === toSeasonId);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <RefreshCw className="w-6 h-6 text-primary" />
          Transizione Stagionale
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestisci conferme, trasferimenti, promozioni e giocatori in osservazione
        </p>
      </div>

      {/* Season selectors */}
      <div className="flex flex-wrap items-center gap-3 bg-muted/40 border rounded-xl p-4">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium whitespace-nowrap">Stagione di partenza:</Label>
          <Select value={fromSeasonId?.toString() ?? ""} onValueChange={v => setFromSeasonId(Number(v))}>
            <SelectTrigger className="w-[150px] h-8 text-sm"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
            <SelectContent>
              {seasons.map(s => (
                <SelectItem key={s.id} value={s.id.toString()}>{s.name}{s.isActive ? " ★" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground" />
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium whitespace-nowrap">Stagione destinazione:</Label>
          <Select value={toSeasonId?.toString() ?? ""} onValueChange={v => setToSeasonId(Number(v))}>
            <SelectTrigger className="w-[150px] h-8 text-sm"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
            <SelectContent>
              {seasons.filter(s => s.id !== fromSeasonId).map(s => (
                <SelectItem key={s.id} value={s.id.toString()}>{s.name}{s.isActive ? " ★" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canAdmin && fromSeasonId && toSeasonId && (
          <Button size="sm" variant="outline" onClick={() => setPromoteDialogOpen(true)} className="ml-auto gap-2">
            <RefreshCw className="w-4 h-4" />
            Promuovi squadre
          </Button>
        )}
      </div>

      {/* Stats */}
      {fromSeasonId && playerStatuses.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Riconfermati",  key: "confirmed",    icon: <CheckCircle2 className="w-4 h-4 text-green-600" />,  bg: "bg-green-50 border-green-200" },
            { label: "Non confermati",key: "not_confirmed",icon: <XCircle className="w-4 h-4 text-red-600" />,          bg: "bg-red-50 border-red-200" },
            { label: "Trasferimenti", key: "transfer",     icon: <Banknote className="w-4 h-4 text-purple-600" />,      bg: "bg-purple-50 border-purple-200" },
            { label: "Scambi",        key: "swap",         icon: <ArrowLeftRight className="w-4 h-4 text-amber-600" />, bg: "bg-amber-50 border-amber-200" },
          ].map(card => {
            let count = 0;
            if (card.key === "transfer") count = (stats.transfer_free ?? 0) + (stats.transfer_paid ?? 0);
            else if (card.key === "swap") count = (stats.swap ?? 0) + (stats.swap_loan ?? 0);
            else count = stats[card.key] ?? 0;
            return (
              <div key={card.key} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${card.bg}`}>
                {card.icon}
                <div>
                  <div className="text-xl font-bold leading-none">{count}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{card.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Main Tabs */}
      {fromSeasonId && (
        <Tabs defaultValue="scuola_calcio">
          <TabsList className="flex-wrap h-auto">
            {CLUB_SECTIONS.map(s => (
              <TabsTrigger key={s.key} value={s.key} className="gap-1.5">
                {s.label}
                <Badge variant="secondary" className="text-xs px-1.5 h-4">{playersBySection[s.key]?.length ?? 0}</Badge>
              </TabsTrigger>
            ))}
            <TabsTrigger value="osservazione" className="gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              In osservazione
              <Badge variant="secondary" className="text-xs px-1.5 h-4">{observedPlayers.length}</Badge>
            </TabsTrigger>
          </TabsList>

          {CLUB_SECTIONS.map(s => (
            <TabsContent key={s.key} value={s.key} className="mt-4">
              <Card>
                <CardHeader className="py-3 px-4 border-b">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    {s.label} — {playersBySection[s.key]?.length ?? 0} giocatori
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {loadingStatuses ? (
                    <div className="py-12 text-center text-muted-foreground text-sm">Caricamento...</div>
                  ) : playersBySection[s.key]?.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-sm">Nessun giocatore in questa sezione.</div>
                  ) : (
                    playersBySection[s.key].map(p => (
                      <PlayerRow key={p.playerId} player={p} teams={teams} onEdit={setEditPlayer} />
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}

          {/* Observed players tab */}
          <TabsContent value="osservazione" className="mt-4">
            <Card>
              <CardHeader className="py-3 px-4 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Eye className="w-4 h-4 text-amber-600" />
                    Giocatori in osservazione — {observedPlayers.length}
                  </CardTitle>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setEditObserved("new")}>
                    <Plus className="w-3.5 h-3.5" />
                    Aggiungi
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loadingObserved ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">Caricamento...</div>
                ) : observedPlayers.length === 0 ? (
                  <div className="py-16 text-center">
                    <Eye className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Nessun giocatore in osservazione.</p>
                    <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => setEditObserved("new")}>
                      <Plus className="w-3.5 h-3.5" /> Aggiungi il primo
                    </Button>
                  </div>
                ) : (
                  observedPlayers.map(p => (
                    <ObservedRow
                      key={p.id} player={p}
                      onEdit={setEditObserved}
                      onDelete={id => deleteObservedMutation.mutate(id)}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {!fromSeasonId && (
        <div className="text-center py-16 text-muted-foreground">
          <RefreshCw className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Seleziona una stagione di partenza per iniziare.</p>
        </div>
      )}

      {/* Edit existing player dialog */}
      <EditPlayerDialog
        player={editPlayer}
        seasonId={fromSeasonId ?? 0}
        open={!!editPlayer}
        onClose={() => setEditPlayer(null)}
        teams={teams}
      />

      {/* Observed player dialog (new or edit) */}
      <ObservedPlayerDialog
        player={editObserved === "new" ? null : (editObserved as ObservedPlayer | null)}
        seasonId={fromSeasonId ?? 0}
        open={editObserved !== null}
        onClose={() => setEditObserved(null)}
      />

      {/* Promote dialog */}
      <Dialog open={promoteDialogOpen} onOpenChange={setPromoteDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>Conferma promozione stagionale</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Verranno create nuove squadre per la stagione <strong>{toSeason?.name}</strong> con le categorie successive,
              e i giocatori <strong>riconfermati</strong> dalla stagione <strong>{fromSeason?.name}</strong> saranno spostati nelle nuove annate.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              ⚠ Solo i giocatori con stato "Riconfermato" saranno spostati.
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPromoteDialogOpen(false)} className="flex-1">Annulla</Button>
              <Button onClick={() => promoteMutation.mutate()} disabled={promoteMutation.isPending} className="flex-1">
                {promoteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Promuovi
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
