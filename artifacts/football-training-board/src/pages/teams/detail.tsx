import { useParams, Link } from "wouter";
import { useGetTeam, useListPlayers, useDeletePlayer, useUpdatePlayer } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Users, UserCheck, Pencil, Trash2, AlertTriangle, ShieldOff, UserMinus } from "lucide-react";
import { format } from "date-fns";
import { it as itLocale } from "date-fns/locale";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const STAFF_ROLE_ICONS: Record<string, string> = {
  coach: "🏅",
  fitness_coach: "💪",
  technical_director: "📋",
  athletic_director: "🏋️",
  director: "🎯",
  admin: "⚙️",
  secretary: "📝",
};

function staffRoleLabel(role: string, t: ReturnType<typeof useLanguage>["t"]) {
  const labels: Record<string, string> = {
    coach: t.coach,
    fitness_coach: t.fitnessCoach,
    technical_director: t.technicalDirector ?? "Direttore Tecnico",
    athletic_director: t.athleticDirector ?? "Direttore Sportivo",
    director: t.director ?? "Direttore",
    admin: t.admin ?? "Admin",
    secretary: t.secretary ?? "Segreteria",
  };
  return labels[role] || role;
}

function reasonLabel(reason: string | null | undefined, t: ReturnType<typeof useLanguage>["t"]) {
  if (reason === "illness") return t.illness;
  if (reason === "injury") return t.injuryReason;
  if (reason === "vacation") return t.vacationReason;
  if (reason === "other") return t.otherReason;
  return reason || "—";
}

const zRegisteredField = z.preprocess((v) => (v === "indeterminate" ? false : v), z.boolean().optional());

const editSchema = z.object({
  firstName: z.string().min(2, "Required"),
  lastName: z.string().min(2, "Required"),
  position: z.string().optional(),
  status: z.string().optional(),
  jerseyNumber: z.coerce.number().optional().nullable(),
  dateOfBirth: z.string().optional(),
  registered: zRegisteredField,
  registrationNumber: z.string().optional(),
  nationality: z.string().optional(),
  height: z.coerce.number().optional().nullable(),
  weight: z.coerce.number().optional().nullable(),
  notes: z.string().optional(),
  available: z.boolean().optional(),
  unavailabilityReason: z.string().optional(),
  expectedReturn: z.string().optional(),
});

type EditForm = z.infer<typeof editSchema>;

type Player = {
  id: number;
  firstName: string;
  lastName: string;
  teamId?: number | null;
  teamName?: string | null;
  position?: string | null;
  jerseyNumber?: number | null;
  status: string;
  dateOfBirth?: string | null;
  registered?: boolean | null;
  registrationNumber?: string | null;
  nationality?: string | null;
  height?: number | null;
  weight?: number | null;
  notes?: string | null;
  available?: boolean;
  unavailabilityReason?: string | null;
  expectedReturn?: string | null;
};

type PlayerNoteRecipient = "secretary" | "technical_director" | "coach_staff";
type PlayerNoteThreadItem = {
  id: string;
  authorRole: string;
  authorName?: string;
  recipient: PlayerNoteRecipient;
  body: string;
  createdAt: string;
  requiresResponse?: boolean;
  replyToId?: string;
  repliedAt?: string;
};

const PLAYER_NOTES_MARKER = "[FTB_PLAYER_NOTES]";

function splitPlayerNotes(raw?: string | null): { plainNote: string; thread: PlayerNoteThreadItem[] } {
  const full = (raw ?? "").trim();
  if (!full) return { plainNote: "", thread: [] };
  const idx = full.lastIndexOf(PLAYER_NOTES_MARKER);
  if (idx < 0) return { plainNote: full, thread: [] };
  const before = full.slice(0, idx).trim();
  const jsonPart = full.slice(idx + PLAYER_NOTES_MARKER.length).trim();
  try {
    const parsed = JSON.parse(jsonPart);
    if (!Array.isArray(parsed)) return { plainNote: before, thread: [] };
    return { plainNote: before, thread: parsed as PlayerNoteThreadItem[] };
  } catch {
    return { plainNote: before, thread: [] };
  }
}

function composePlayerNotes(plainNote: string, thread: PlayerNoteThreadItem[]): string {
  const cleanPlain = plainNote.trim();
  if (!thread.length) return cleanPlain;
  const encoded = `${PLAYER_NOTES_MARKER}${JSON.stringify(thread)}`;
  return cleanPlain ? `${cleanPlain}\n\n${encoded}` : encoded;
}

export default function TeamDetail() {
  const { t, language } = useLanguage();
  const { role, user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const teamId = Number(id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const locale = language === "it" ? itLocale : undefined;

  const { data: team, isLoading: teamLoading } = useGetTeam(teamId);
  const { data: players, isLoading: playersLoading } = useListPlayers({ teamId });

  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [noteDraftText, setNoteDraftText] = useState("");
  const [noteRecipient, setNoteRecipient] = useState<PlayerNoteRecipient>("secretary");
  const [noteRequiresResponse, setNoteRequiresResponse] = useState(false);
  const [noteReplyToId, setNoteReplyToId] = useState<string>("");

  const canDeletePlayer = ["admin", "presidente", "secretary", "director"].includes(role ?? "");
  const isLimitedEditor = ["coach", "fitness_coach", "athletic_director", "technical_director"].includes(role ?? "");
  const canEditFullPlayer = ["admin", "presidente", "secretary", "director"].includes(role ?? "");
  const canEdit = canEditFullPlayer || isLimitedEditor;
  const canEditAvailability = canEdit;
  const canWritePlayerNotes = isLimitedEditor || canEditFullPlayer;

  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) });
  const watchAvailable = editForm.watch("available");
  const watchRegistered = editForm.watch("registered");

  useEffect(() => {
    if (watchRegistered === false) {
      editForm.setValue("available", false);
    }
  }, [watchRegistered, editForm]);

  const updateMutation = useUpdatePlayer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/players"] });
        setEditingPlayer(null);
        toast({ title: t.editPlayer });
      },
      onError: () => toast({ title: "Errore nel salvataggio", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeletePlayer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/players"] });
        toast({ title: t.deletePlayer });
      },
    },
  });

  function openEdit(player: Player) {
    setEditingPlayer(player);
    const parsedNotes = splitPlayerNotes(player.notes ?? "");
    setNoteDraftText("");
    setNoteRecipient("secretary");
    setNoteRequiresResponse(false);
    setNoteReplyToId("");
    editForm.reset({
      firstName: player.firstName,
      lastName: player.lastName,
      position: player.position ?? undefined,
      status: player.status ?? "active",
      jerseyNumber: player.jerseyNumber ?? undefined,
      dateOfBirth: player.dateOfBirth ?? undefined,
      registered: player.registered ?? false,
      registrationNumber: player.registrationNumber ?? undefined,
      nationality: player.nationality ?? undefined,
      height: player.height ?? undefined,
      weight: player.weight ?? undefined,
      notes: composePlayerNotes(parsedNotes.plainNote, parsedNotes.thread) ?? undefined,
      available: player.available ?? true,
      unavailabilityReason: player.unavailabilityReason ?? undefined,
      expectedReturn: player.expectedReturn ?? undefined,
    });
  }

  function handleEditSubmit(data: EditForm) {
    if (!editingPlayer) return;
    const parsedNotes = splitPlayerNotes(data.notes ?? "");
    const thread = [...parsedNotes.thread];
    const nowIso = new Date().toISOString();
    if (noteDraftText.trim() && canWritePlayerNotes) {
      if (noteReplyToId) {
        const idx = thread.findIndex((n) => n.id === noteReplyToId);
        if (idx >= 0) thread[idx] = { ...thread[idx], repliedAt: nowIso };
      }
      thread.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        authorRole: role ?? "unknown",
        authorName: `${(user as any)?.firstName ?? ""} ${(user as any)?.lastName ?? ""}`.trim() || undefined,
        recipient: noteRecipient,
        body: noteDraftText.trim(),
        createdAt: nowIso,
        requiresResponse: noteRequiresResponse,
        replyToId: noteReplyToId || undefined,
      });
    }
    const registered = data.registered === true;
    const payload: Record<string, unknown> = {
      ...data,
      registered,
      notes: composePlayerNotes(parsedNotes.plainNote, thread),
    };
    if (!registered) {
      payload.available = false;
    }
    if (payload.status === "injured") {
      payload.available = false;
      payload.unavailabilityReason = "injury";
    }
    if (payload.available) {
      payload.unavailabilityReason = null;
      payload.expectedReturn = null;
    }
    if (isLimitedEditor) {
      const limitedPayload: Record<string, unknown> = {
        notes: payload.notes,
        available: payload.available,
        unavailabilityReason: payload.unavailabilityReason,
        expectedReturn: payload.expectedReturn,
        status: payload.status,
      };
      updateMutation.mutate({ id: editingPlayer.id, data: limitedPayload as any });
      return;
    }
    updateMutation.mutate({ id: editingPlayer.id, data: payload as any });
  }

  const typedPlayers = (players as Player[] | undefined) ?? [];
  const staff = (team as any)?.assignedStaff as { userId: number; name: string; role: string }[] | undefined;

  if (teamLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="text-center py-20">
        <ShieldOff className="w-16 h-16 text-muted mx-auto mb-4" />
        <h3 className="text-xl font-semibold">Squadra non trovata</h3>
        <Link href="/teams">
          <Button variant="outline" className="mt-4"><ArrowLeft className="w-4 h-4 mr-2" />Torna alle squadre</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <Link href="/teams">
          <button type="button" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" />
            Torna alle squadre
          </button>
        </Link>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl shrink-0">
              {team.name.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-3xl font-display font-bold tracking-tight">{team.name}</h1>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {team.ageGroup && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                    {team.ageGroup}
                  </span>
                )}
                {team.category && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border text-muted-foreground">
                    {team.category}
                  </span>
                )}
                {(team as any).seasonName && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                    {(team as any).seasonName}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              <span className="font-semibold text-foreground">{typedPlayers.length}</span> giocatori
            </div>
          </div>
        </div>
      </div>

      {/* Staff assegnato */}
      {staff && staff.length > 0 && (
        <div className="bg-card border rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <UserCheck className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">{t.assignedStaff}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {staff.map((s: any) => {
              const licenseMap: Record<string, string> = {
                UEFA_A: "UEFA A", UEFA_B: "UEFA B", UEFA_C: "UEFA C",
                UEFA_Pro: "UEFA Pro", Grassroots: "Grassroots",
              };
              const staffRoleLabelMap: Record<string, string> = {
                primo_allenatore: t.firstCoach,
                secondo_allenatore: t.secondCoach,
                collaboratore: t.collaborator,
                stagista: t.intern,
                preparatore_principale: t.mainFitnessCoach,
                assistente_preparatore: t.assistantFitnessCoach,
              };
              return (
                <div key={s.userId} className="flex items-start gap-3 p-4 rounded-xl bg-muted/30 border border-border/60 hover:bg-muted/50 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-xl shrink-0 mt-0.5">
                    {STAFF_ROLE_ICONS[s.role] ?? "👤"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground">{s.name}</p>
                    <p className="text-xs text-muted-foreground mb-2">{staffRoleLabel(s.role, t)}</p>

                    <div className="flex flex-wrap gap-1.5">
                      {/* Incarico specifico */}
                      {s.staffRole && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground border">
                          {staffRoleLabelMap[s.staffRole] ?? s.staffRole}
                        </span>
                      )}

                      {/* Licenza allenatore */}
                      {s.licenseType && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                          🪪 {licenseMap[s.licenseType] ?? s.licenseType}
                        </span>
                      )}

                      {/* Specializzazione preparatore */}
                      {s.specialization && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                          💪 {s.specialization}
                        </span>
                      )}

                      {/* Laurea Scienze Motorie */}
                      {s.degreeScienzeMoto && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          🎓 Sc. Motorie{s.degreeScienzeMotoType ? ` (${s.degreeScienzeMotoType})` : ""}
                        </span>
                      )}

                      {/* Tesserato */}
                      {s.registered && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          ✓ Tesserato{s.registrationNumber ? ` #${s.registrationNumber}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rosa giocatori */}
      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Rosa</h2>
            <span className="text-sm text-muted-foreground ml-1">({typedPlayers.length} giocatori)</span>
          </div>
        </div>

        {playersLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : typedPlayers.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <UserMinus className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nessun giocatore in rosa</p>
            <p className="text-sm mt-1">Aggiungi giocatori dalla sezione Giocatori</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
                <tr>
                  <th className="px-5 py-3">Giocatore</th>
                  <th className="px-5 py-3">Ruolo</th>
                  <th className="px-5 py-3">Data di nascita</th>
                  <th className="px-5 py-3">Altezza</th>
                  <th className="px-5 py-3">Disponibilità</th>
                  <th className="px-5 py-3">Tesserato</th>
                  {canEdit && <th className="px-5 py-3 text-right">Azioni</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {typedPlayers.map(player => (
                  <tr key={player.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs border shadow-sm shrink-0 ${
                          player.available === false
                            ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
                            : "bg-secondary text-secondary-foreground"
                        }`}>
                          {player.jerseyNumber ? `#${player.jerseyNumber}` : `${player.firstName[0]}${player.lastName[0]}`}
                        </div>
                        <div>
                          <div className="font-semibold">{player.firstName} {player.lastName}</div>
                          {player.nationality && <div className="text-xs text-muted-foreground">{player.nationality}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono bg-muted px-2 py-0.5 rounded text-xs">{player.position || "—"}</span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">
                      {player.dateOfBirth
                        ? format(new Date(player.dateOfBirth), "dd MMM yyyy", { locale })
                        : "—"}
                      {player.dateOfBirth && (
                        <span className="ml-1 text-[10px] text-primary font-medium">
                          ({new Date().getFullYear() - new Date(player.dateOfBirth).getFullYear()} anni)
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {player.height ? `${player.height} cm` : "—"}
                    </td>
                    <td className="px-5 py-3">
                      {player.available === false ? (
                        <div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
                            <AlertTriangle className="w-3 h-3" />
                            {t.notAvailable}
                          </span>
                          {player.unavailabilityReason && (
                            <div className="text-[11px] text-muted-foreground mt-0.5">{reasonLabel(player.unavailabilityReason, t)}</div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                          {t.available}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        player.registered
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {player.registered ? t.registered : "—"}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => openEdit(player)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            disabled={!canDeletePlayer}
                            onClick={() => {
                              if (!canDeletePlayer) return;
                              if (confirm(t.removePlayer)) deleteMutation.mutate({ id: player.id });
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Player Dialog */}
      <Dialog open={!!editingPlayer} onOpenChange={(o) => !o && setEditingPlayer(null)}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.editPlayer}</DialogTitle>
          </DialogHeader>
          {editingPlayer && (
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.firstName} <span className="text-destructive">*</span></Label>
                  <Input {...editForm.register("firstName")} disabled={!canEditFullPlayer} />
                </div>
                <div className="space-y-2">
                  <Label>{t.lastName} <span className="text-destructive">*</span></Label>
                  <Input {...editForm.register("lastName")} disabled={!canEditFullPlayer} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.position}</Label>
                  <Controller control={editForm.control} name="position" render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || ""} disabled={!canEditFullPlayer}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GK">{t.goalkeeper}</SelectItem>
                        <SelectItem value="DEF">{t.defender}</SelectItem>
                        <SelectItem value="MID">{t.midfielder}</SelectItem>
                        <SelectItem value="FWD">{t.forward}</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="space-y-2">
                  <Label>{t.jerseyNumber}</Label>
                  <Input type="number" {...editForm.register("jerseyNumber")} disabled={!canEditFullPlayer} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.dateOfBirth}</Label>
                  <Input type="date" {...editForm.register("dateOfBirth")} disabled={!canEditFullPlayer} />
                </div>
                <div className="space-y-2">
                  <Label>{t.nationality}</Label>
                  <Input {...editForm.register("nationality")} disabled={!canEditFullPlayer} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.height} (cm)</Label>
                  <Input type="number" {...editForm.register("height")} disabled={!canEditFullPlayer} />
                </div>
                <div className="space-y-2">
                  <Label>{t.weight} (kg)</Label>
                  <Input type="number" {...editForm.register("weight")} disabled={!canEditFullPlayer} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t.status}</Label>
                <Controller control={editForm.control} name="status" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value || "active"}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">{t.active}</SelectItem>
                      <SelectItem value="injured">{t.injured}</SelectItem>
                      <SelectItem value="inactive">{t.inactive}</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-2">
                <Label>{t.notes}</Label>
                {(() => {
                  const parsed = splitPlayerNotes(editForm.watch("notes") ?? "");
                  return (
                    <div className="space-y-2">
                      <Textarea
                        value={parsed.plainNote}
                        onChange={(e) => editForm.setValue("notes", composePlayerNotes(e.target.value, parsed.thread))}
                        disabled={!canWritePlayerNotes}
                        placeholder="Nota generale sul giocatore..."
                      />
                      {parsed.thread.length > 0 && (
                        <div className="space-y-1 max-h-36 overflow-auto rounded border p-2 bg-muted/20">
                          {parsed.thread.map((n) => (
                            <div key={n.id} className="text-xs rounded border px-2 py-1 bg-background">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{n.authorName || n.authorRole}</span>
                                <span className="text-muted-foreground">{new Date(n.createdAt).toLocaleString("it-IT")}</span>
                              </div>
                              <div className="text-muted-foreground mt-0.5">
                                A: {n.recipient === "secretary" ? "Segreteria" : n.recipient === "technical_director" ? "Direttore tecnico" : "Allenatori/Preparatori"}
                              </div>
                              <p className="mt-1">{n.body}</p>
                              {n.requiresResponse && !n.repliedAt && (
                                <span className="inline-flex mt-1 text-[10px] rounded border px-1.5 py-0.5">In attesa risposta</span>
                              )}
                              {n.repliedAt && (
                                <span className="inline-flex mt-1 text-[10px] rounded border px-1.5 py-0.5 bg-muted">Risposta ricevuta</span>
                              )}
                              {!!n.requiresResponse && !n.repliedAt && canWritePlayerNotes && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[10px] mt-1"
                                  onClick={() => setNoteReplyToId(n.id)}
                                >
                                  Rispondi
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {canWritePlayerNotes && (
                        <div className="space-y-2 rounded border p-2 bg-muted/20">
                          <Label className="text-xs">Nuova comunicazione</Label>
                          <Textarea
                            value={noteDraftText}
                            onChange={(e) => setNoteDraftText(e.target.value)}
                            placeholder="Scrivi una comunicazione sul giocatore..."
                          />
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Select value={noteRecipient} onValueChange={(v) => setNoteRecipient(v as PlayerNoteRecipient)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="secretary">Segreteria</SelectItem>
                                <SelectItem value="technical_director">Direttore tecnico</SelectItem>
                                <SelectItem value="coach_staff">Allenatori/Preparatori</SelectItem>
                              </SelectContent>
                            </Select>
                            <div className="flex items-center gap-2 px-2">
                              <Checkbox checked={noteRequiresResponse} onCheckedChange={(v) => setNoteRequiresResponse(v === true)} />
                              <Label className="text-xs">Richiesta risposta</Label>
                            </div>
                          </div>
                          {noteReplyToId && (
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                              <span>Risposta a nota in attesa</span>
                              <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setNoteReplyToId("")}>
                                Annulla
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Tesseramento */}
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center gap-2">
                  <ShieldOff className="w-4 h-4 text-primary" />
                  <h4 className="font-semibold text-sm">{t.registered ?? "Tesseramento"}</h4>
                </div>
                <div className="flex items-center gap-3">
                  <Controller control={editForm.control} name="registered" render={({ field }) => (
                    <Switch
                      id="registered"
                      checked={field.value === true}
                      onCheckedChange={(c) => field.onChange(c === true)}
                      disabled={!canEditFullPlayer}
                    />
                  )} />
                  <Label htmlFor="registered" className={`cursor-pointer font-medium ${watchRegistered ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                    {watchRegistered ? (t.registered ?? "Tesserato") : "Non tesserato"}
                  </Label>
                  {!watchRegistered && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 ml-1">
                      <AlertTriangle className="w-3 h-3" />
                      imposta automaticamente non disponibile
                    </span>
                  )}
                </div>
              </div>

              {/* Disponibilità */}
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <h4 className="font-semibold text-sm">{t.playerAvailability}</h4>
                  {!canEditAvailability && <span className="text-xs text-muted-foreground ml-auto italic">(permessi insufficienti)</span>}
                </div>
                <div className="flex items-center gap-3">
                  <Controller control={editForm.control} name="available" render={({ field }) => (
                    <Switch id="avail" checked={field.value ?? true} onCheckedChange={field.onChange} disabled={!canEditAvailability} />
                  )} />
                  <Label htmlFor="avail" className={`cursor-pointer font-medium ${watchAvailable !== false ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {watchAvailable !== false ? t.available : t.notAvailable}
                  </Label>
                </div>
                {watchAvailable === false && (
                  <div className="space-y-3 pl-2 border-l-2 border-red-200 dark:border-red-800">
                    <div className="space-y-2">
                      <Label>{t.unavailabilityReason}</Label>
                      <Controller control={editForm.control} name="unavailabilityReason" render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value || ""} disabled={!canEditAvailability}>
                          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="illness">{t.illness}</SelectItem>
                            <SelectItem value="injury">{t.injuryReason}</SelectItem>
                            <SelectItem value="vacation">{t.vacationReason}</SelectItem>
                            <SelectItem value="other">{t.otherReason}</SelectItem>
                          </SelectContent>
                        </Select>
                      )} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t.expectedReturn}</Label>
                      <Input type="date" {...editForm.register("expectedReturn")} disabled={!canEditAvailability} />
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setEditingPlayer(null)}>{t.cancel}</Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? t.saving : t.saveChanges}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
