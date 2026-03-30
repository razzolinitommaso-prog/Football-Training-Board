import { useState } from "react";
import { useListClubMembers, useInviteClubMember, useRemoveClubMember, useUpdateClubMemberRole, useListTeams } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Mail, Pencil, FileDown, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format } from "date-fns";
import { it as itLocale } from "date-fns/locale";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import type { ClubMember } from "@workspace/api-client-react";
import { exportToExcel, mapMembersForExcel } from "@/lib/excel-export";

const CLUB_SECTIONS = ["scuola_calcio", "settore_giovanile", "prima_squadra"] as const;
type ClubSection = typeof CLUB_SECTIONS[number];

const SECTION_CONFIG: Record<ClubSection, { label: string; hex: string; bgRgb: string; badge: string }> = {
  scuola_calcio: {
    label: "Scuola Calcio",
    hex: "#38bdf8",
    bgRgb: "14,165,233",
    badge: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
  },
  settore_giovanile: {
    label: "Settore Giovanile",
    hex: "#818cf8",
    bgRgb: "99,102,241",
    badge: "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30",
  },
  prima_squadra: {
    label: "Prima Squadra",
    hex: "#fbbf24",
    bgRgb: "245,158,11",
    badge: "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30",
  },
};

const ADMIN_HEX = "#a855f7";
const ADMIN_BG_RGB = "168,85,247";

function buildStripStyle(isAdmin: boolean, secs: ClubSection[]): string {
  if (isAdmin) return ADMIN_HEX;
  if (secs.length === 1) return SECTION_CONFIG[secs[0]]?.hex ?? SECTION_CONFIG.scuola_calcio.hex;
  const stops = secs.map((s, i) => {
    const pct = Math.round((i / (secs.length - 1)) * 100);
    return `${SECTION_CONFIG[s]?.hex ?? "#38bdf8"} ${pct}%`;
  });
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

function buildBgStyle(isAdmin: boolean, secs: ClubSection[]): string {
  if (isAdmin) return `rgba(${ADMIN_BG_RGB},0.22)`;
  if (secs.length === 1) return `rgba(${SECTION_CONFIG[secs[0]]?.bgRgb ?? SECTION_CONFIG.scuola_calcio.bgRgb},0.20)`;
  const n = secs.length;
  const stops: string[] = [];
  secs.forEach((s, i) => {
    const from = Math.round((i / n) * 100);
    const to = Math.round(((i + 1) / n) * 100);
    const rgb = SECTION_CONFIG[s]?.bgRgb ?? "14,165,233";
    stops.push(`rgba(${rgb},0.20) ${from}%`, `rgba(${rgb},0.20) ${to}%`);
  });
  return `linear-gradient(120deg, ${stops.join(", ")})`;
}

const inviteSchema = z.object({
  firstName: z.string().min(2, "Required"),
  lastName: z.string().min(2, "Required"),
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Min 6 chars"),
  role: z.enum(["coach", "secretary", "technical_director", "athletic_director", "fitness_coach", "director", "admin"]),
  clubSection: z.array(z.enum(CLUB_SECTIONS)).min(1, "Seleziona almeno una sezione").default(["scuola_calcio"]),
  registered: z.boolean().optional(),
  registrationNumber: z.string().optional(),
  phone: z.string().optional(),
  licenseType: z.string().optional(),
  specialization: z.string().optional(),
  degreeScienzeMoto: z.boolean().optional(),
  degreeScienzeMotoType: z.string().optional(),
});

const editSchema = z.object({
  firstName: z.string().min(2, "Minimo 2 caratteri"),
  lastName: z.string().min(2, "Minimo 2 caratteri"),
  email: z.string().email("Email non valida"),
  newPassword: z.string().optional(),
  role: z.enum(["coach", "secretary", "technical_director", "athletic_director", "fitness_coach", "director", "admin"]),
  clubSection: z.array(z.enum(CLUB_SECTIONS)).min(1, "Seleziona almeno una sezione").default(["scuola_calcio"]),
  staffRole: z.string().optional(),
  registered: z.boolean().optional(),
  registrationNumber: z.string().optional(),
  phone: z.string().optional(),
  licenseType: z.string().optional(),
  specialization: z.string().optional(),
  degreeScienzeMoto: z.boolean().optional(),
  degreeScienzeMotoType: z.string().optional(),
  teamIds: z.array(z.number()).optional(),
});

export default function MembersList() {
  const { t, language } = useLanguage();
  const { role } = useAuth();
  const { data: members, isLoading } = useListClubMembers();
  const { data: teams } = useListTeams();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<ClubMember | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [licenseFilter, setLicenseFilter] = useState("all");
  const [staffRoleFilter, setStaffRoleFilter] = useState("all");
  const [degreeFilter, setDegreeFilter] = useState("all");
  const [registeredFilter, setRegisteredFilter] = useState("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canExport = role === "admin" || role === "secretary" || role === "director";

  const handleExportMembers = () => {
    if (!members?.length) return;
    exportToExcel(mapMembersForExcel(members as any[]), "Staff_FTB", "Staff");
  };

  const inviteMutation = useInviteClubMember({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/clubs/me/members"] });
        setIsInviteOpen(false);
        toast({ title: t.inviteMember });
        inviteForm.reset();
      },
      onError: (err) => {
        toast({ title: "Error", description: (err as any).data?.error || "Could not invite member", variant: "destructive" });
      }
    }
  });

  const updateMutation = useUpdateClubMemberRole({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/clubs/me/members"] });
        setEditingMember(null);
        toast({ title: t.saveChanges });
      },
      onError: (err) => {
        toast({ title: "Error", description: (err as any).data?.error || "Could not update member", variant: "destructive" });
      }
    }
  });

  const removeMutation = useRemoveClubMember({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/clubs/me/members"] });
        toast({ title: t.removeMember });
      }
    }
  });

  const [sectionFilter, setSectionFilter] = useState("all");

  const inviteForm = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: "coach", clubSection: ["scuola_calcio"], registered: false }
  });

  const editForm = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
  });

  const watchedInviteRole = inviteForm.watch("role");
  const watchedEditRole = editForm.watch("role");
  const watchedEditDegreeScienzeMoto = editForm.watch("degreeScienzeMoto");
  const watchedInviteDegreeScienzeMoto = inviteForm.watch("degreeScienzeMoto");

  function openEdit(member: ClubMember) {
    setEditingMember(member);
    editForm.reset({
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      newPassword: "",
      role: member.role as any,
      clubSection: (Array.isArray(member.clubSection) ? member.clubSection : [member.clubSection ?? "scuola_calcio"]) as ClubSection[],
      staffRole: member.staffRole ?? undefined,
      registered: member.registered ?? false,
      registrationNumber: member.registrationNumber ?? undefined,
      phone: member.phone ?? undefined,
      licenseType: member.licenseType ?? undefined,
      specialization: member.specialization ?? undefined,
      degreeScienzeMoto: member.degreeScienzeMoto ?? false,
      degreeScienzeMotoType: member.degreeScienzeMotoType ?? undefined,
      teamIds: member.teamAssignments?.map(a => a.teamId) ?? [],
    });
  }

  const roleLabel = (role: string) => {
    const map: Record<string, string> = {
      admin: t.admin, coach: t.coach, secretary: t.secretary,
      technical_director: t.technicalDirector, athletic_director: t.athleticDirector,
      fitness_coach: t.fitnessCoach, director: t.director,
    };
    return map[role] ?? role.replace(/_/g, " ");
  };

  const roleBadgeClass = (role: string) => {
    const map: Record<string, string> = {
      admin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
      coach: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      secretary: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
      technical_director: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
      athletic_director: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      fitness_coach: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      director: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    };
    return map[role] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
  };

  const staffRoleOptions = (role: string) => {
    if (role === "coach" || role === "technical_director") {
      return [
        { value: "primo_allenatore", label: t.firstCoach },
        { value: "secondo_allenatore", label: t.secondCoach },
        { value: "collaboratore", label: t.collaborator },
        { value: "stagista", label: t.intern },
      ];
    }
    if (role === "fitness_coach" || role === "athletic_director") {
      return [
        { value: "preparatore_principale", label: t.mainFitnessCoach },
        { value: "assistente_preparatore", label: t.assistantFitnessCoach },
        { value: "collaboratore", label: t.collaborator },
        { value: "stagista", label: t.intern },
      ];
    }
    return [];
  };

  const locale = language === "it" ? itLocale : undefined;
  const showCoachInviteFields = watchedInviteRole === "coach";
  const showFitnessInviteFields = watchedInviteRole === "fitness_coach" || watchedInviteRole === "athletic_director";
  const showEditStaffRole = staffRoleOptions(watchedEditRole).length > 0;
  const showEditCoachFields = watchedEditRole === "coach";
  const showEditFitnessFields = watchedEditRole === "fitness_coach" || watchedEditRole === "athletic_director";
  const showEditTeams = watchedEditRole === "coach" || watchedEditRole === "fitness_coach" || watchedEditRole === "athletic_director" || watchedEditRole === "technical_director";

  function toggleTeam(teamId: number) {
    const current = editForm.getValues("teamIds") ?? [];
    if (current.includes(teamId)) {
      editForm.setValue("teamIds", current.filter(id => id !== teamId));
    } else {
      editForm.setValue("teamIds", [...current, teamId]);
    }
  }

  const allStaffRoleOptions = [
    { value: "primo_allenatore", label: t.firstCoach },
    { value: "secondo_allenatore", label: t.secondCoach },
    { value: "collaboratore", label: t.collaborator },
    { value: "stagista", label: t.intern },
    { value: "preparatore_principale", label: t.mainFitnessCoach },
    { value: "assistente_preparatore", label: t.assistantFitnessCoach },
  ];

  const memberActiveFilterCount = [
    sectionFilter !== "all",
    roleFilter !== "all",
    licenseFilter !== "all",
    staffRoleFilter !== "all",
    degreeFilter !== "all",
    registeredFilter !== "all",
  ].filter(Boolean).length;

  const ROLE_ORDER: Record<string, number> = {
    admin: 0,
    director: 1,
    secretary: 2,
    technical_director: 3,
    athletic_director: 4,
    coach: 5,
    fitness_coach: 6,
  };

  const LICENSE_ORDER: Record<string, number> = {
    UEFA_Pro: 0,
    UEFA_A: 1,
    UEFA_B: 2,
    UEFA_C: 3,
    Grassroots: 4,
    "Licenza D": 5,
  };

  const filteredMembers = members?.filter(m => {
    const q = search.toLowerCase();
    if (q && !`${m.firstName} ${m.lastName} ${m.email}`.toLowerCase().includes(q)) return false;
    if (sectionFilter !== "all") {
      const memberSections: string[] = Array.isArray(m.clubSection)
        ? m.clubSection
        : [m.clubSection ?? "scuola_calcio"];
      if (!memberSections.includes(sectionFilter)) return false;
    }
    if (roleFilter !== "all" && m.role !== roleFilter) return false;
    if (licenseFilter !== "all" && m.licenseType !== licenseFilter) return false;
    if (staffRoleFilter !== "all" && m.staffRole !== staffRoleFilter) return false;
    if (degreeFilter === "yes" && !m.degreeScienzeMoto) return false;
    if (degreeFilter === "no" && m.degreeScienzeMoto) return false;
    if (registeredFilter === "yes" && !m.registered) return false;
    if (registeredFilter === "no" && m.registered) return false;
    return true;
  })?.sort((a, b) => {
    const roleA = ROLE_ORDER[a.role] ?? 99;
    const roleB = ROLE_ORDER[b.role] ?? 99;
    if (roleA !== roleB) return roleA - roleB;
    const licA = LICENSE_ORDER[a.licenseType ?? ""] ?? 99;
    const licB = LICENSE_ORDER[b.licenseType ?? ""] ?? 99;
    if (licA !== licB) return licA - licB;
    return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "it");
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">{t.staffAndMembers}</h1>
          <p className="text-muted-foreground mt-1">{t.membersDesc}</p>
        </div>

        <div className="flex items-center gap-2">
          {canExport && (
            <Button variant="outline" onClick={handleExportMembers} disabled={!members?.length} className="gap-2">
              <FileDown className="w-4 h-4" />
              Esporta Excel
            </Button>
          )}
          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all">
              <Plus className="w-5 h-5 mr-2" />
              {t.inviteMember}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{t.inviteStaffMember}</DialogTitle>
            </DialogHeader>
            <form onSubmit={inviteForm.handleSubmit((data) => inviteMutation.mutate({ data }))} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.firstName}</Label>
                  <Input {...inviteForm.register("firstName")} />
                </div>
                <div className="space-y-2">
                  <Label>{t.lastName}</Label>
                  <Input {...inviteForm.register("lastName")} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t.email}</Label>
                <Input type="email" {...inviteForm.register("email")} />
              </div>
              <div className="space-y-2">
                <Label>{t.initialPassword}</Label>
                <Input type="password" {...inviteForm.register("password")} />
                <p className="text-xs text-muted-foreground">{t.canChangePassword}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.role}</Label>
                  <Controller control={inviteForm.control} name="role" render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="coach">{t.coach}</SelectItem>
                        <SelectItem value="secretary">{t.secretary}</SelectItem>
                        <SelectItem value="technical_director">{t.technicalDirector}</SelectItem>
                        <SelectItem value="athletic_director">{t.athleticDirector}</SelectItem>
                        <SelectItem value="fitness_coach">{t.fitnessCoach}</SelectItem>
                        <SelectItem value="director">{t.director}</SelectItem>
                        <SelectItem value="admin">{t.admin}</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Sezioni di appartenenza</Label>
                  <Controller control={inviteForm.control} name="clubSection" render={({ field }) => (
                    <div className="flex flex-wrap gap-3">
                      {CLUB_SECTIONS.map(sec => (
                        <label key={sec} className="flex items-center gap-2 cursor-pointer select-none">
                          <Checkbox
                            checked={field.value?.includes(sec) ?? false}
                            onCheckedChange={(checked) => {
                              const current = field.value ?? [];
                              field.onChange(checked ? [...current, sec] : current.filter(s => s !== sec));
                            }}
                          />
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${SECTION_CONFIG[sec].badge}`}>
                            {SECTION_CONFIG[sec].label}
                          </span>
                        </label>
                      ))}
                    </div>
                  )} />
                  {inviteForm.formState.errors.clubSection && (
                    <p className="text-xs text-destructive">{inviteForm.formState.errors.clubSection.message as string}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.registrationNumber}</Label>
                  <Input {...inviteForm.register("registrationNumber")} />
                </div>
                <div className="space-y-2">
                  <Label>{t.phone}</Label>
                  <Input type="tel" {...inviteForm.register("phone")} />
                </div>
              </div>
              {showCoachInviteFields && (
                <div className="space-y-2">
                  <Label>{t.licenseType}</Label>
                  <Select onValueChange={(v) => inviteForm.setValue("licenseType", v)}>
                    <SelectTrigger><SelectValue placeholder="Select license" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UEFA_A">UEFA A</SelectItem>
                      <SelectItem value="UEFA_B">UEFA B</SelectItem>
                      <SelectItem value="UEFA_C">UEFA C</SelectItem>
                      <SelectItem value="UEFA_Pro">UEFA Pro</SelectItem>
                      <SelectItem value="Grassroots">Grassroots</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {showFitnessInviteFields && (
                <div className="space-y-2">
                  <Label>{t.specialization}</Label>
                  <Select onValueChange={(v) => inviteForm.setValue("specialization", v)}>
                    <SelectTrigger><SelectValue placeholder="Select specialization" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="strength">Strength</SelectItem>
                      <SelectItem value="endurance">Endurance</SelectItem>
                      <SelectItem value="recovery">Recovery</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {(showCoachInviteFields || showFitnessInviteFields) && (
                <div className="flex items-center gap-3">
                  <Controller control={inviteForm.control} name="registered" render={({ field }) => (
                    <Checkbox id="invReg" checked={field.value ?? false} onCheckedChange={field.onChange} />
                  )} />
                  <Label htmlFor="invReg" className="cursor-pointer">{t.registered}</Label>
                </div>
              )}
              {/* Laurea in Scienze Motorie */}
              <div className="space-y-2 pt-1 border-t border-border/50">
                <div className="flex items-center gap-3">
                  <Controller control={inviteForm.control} name="degreeScienzeMoto" render={({ field }) => (
                    <Checkbox id="invDegree" checked={field.value ?? false} onCheckedChange={(v) => {
                      field.onChange(v);
                      if (!v) inviteForm.setValue("degreeScienzeMotoType", undefined);
                    }} />
                  )} />
                  <Label htmlFor="invDegree" className="cursor-pointer text-sm">Laurea in Scienze Motorie</Label>
                </div>
                {watchedInviteDegreeScienzeMoto && (
                  <div className="pl-7 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Tipologia corso</Label>
                    <Controller control={inviteForm.control} name="degreeScienzeMotoType" render={({ field }) => (
                      <div className="flex flex-wrap gap-2">
                        {["L-22", "LM-67", "LM-68", "LM-45"].map(tipo => (
                          <button
                            key={tipo}
                            type="button"
                            onClick={() => field.onChange(field.value === tipo ? undefined : tipo)}
                            className={`px-3 py-1 text-xs rounded-full border font-medium transition-colors ${field.value === tipo ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"}`}
                          >
                            {tipo}
                          </button>
                        ))}
                      </div>
                    )} />
                  </div>
                )}
              </div>
              <DialogFooter className="pt-4">
                <Button type="submit" disabled={inviteMutation.isPending} className="w-full">
                  <Mail className="w-4 h-4 mr-2" />
                  {inviteMutation.isPending ? t.sendingInvite : t.sendInvite}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Edit Member Dialog */}
      <Dialog open={!!editingMember} onOpenChange={(open) => { if (!open) setEditingMember(null); }}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.editMember}</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit((data) => {
            if (!editingMember) return;
            const payload: any = { ...data };
            if (!payload.newPassword) delete payload.newPassword;
            updateMutation.mutate({ userId: editingMember.id, data: payload });
          })} className="space-y-4 pt-2">

            {/* Dati anagrafici */}
            <div className="p-3 rounded-lg bg-muted/40 border space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dati anagrafici</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t.firstName}</Label>
                  <Input {...editForm.register("firstName")} />
                  {editForm.formState.errors.firstName && <p className="text-xs text-destructive">{editForm.formState.errors.firstName.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>{t.lastName}</Label>
                  <Input {...editForm.register("lastName")} />
                  {editForm.formState.errors.lastName && <p className="text-xs text-destructive">{editForm.formState.errors.lastName.message}</p>}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t.email}</Label>
                <Input type="email" {...editForm.register("email")} />
                {editForm.formState.errors.email && <p className="text-xs text-destructive">{editForm.formState.errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Nuova password <span className="text-muted-foreground font-normal">(lascia vuoto per non cambiare)</span></Label>
                <Input type="password" autoComplete="new-password" placeholder="••••••••" {...editForm.register("newPassword")} />
                {editForm.formState.errors.newPassword && <p className="text-xs text-destructive">{editForm.formState.errors.newPassword.message}</p>}
              </div>
            </div>

            {/* Ruolo e qualifiche */}
            <div className="p-3 rounded-lg bg-muted/40 border space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ruolo e qualifiche</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t.role}</Label>
                  <Controller control={editForm.control} name="role" render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="coach">{t.coach}</SelectItem>
                        <SelectItem value="secretary">{t.secretary}</SelectItem>
                        <SelectItem value="technical_director">{t.technicalDirector}</SelectItem>
                        <SelectItem value="athletic_director">{t.athleticDirector}</SelectItem>
                        <SelectItem value="fitness_coach">{t.fitnessCoach}</SelectItem>
                        <SelectItem value="director">{t.director}</SelectItem>
                        <SelectItem value="admin">{t.admin}</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Sezioni di appartenenza</Label>
                  <Controller control={editForm.control} name="clubSection" render={({ field }) => (
                    <div className="flex flex-wrap gap-3">
                      {CLUB_SECTIONS.map(sec => (
                        <label key={sec} className="flex items-center gap-2 cursor-pointer select-none">
                          <Checkbox
                            checked={field.value?.includes(sec) ?? false}
                            onCheckedChange={(checked) => {
                              const current = field.value ?? [];
                              field.onChange(checked ? [...current, sec] : current.filter(s => s !== sec));
                            }}
                          />
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${SECTION_CONFIG[sec].badge}`}>
                            {SECTION_CONFIG[sec].label}
                          </span>
                        </label>
                      ))}
                    </div>
                  )} />
                  {editForm.formState.errors.clubSection && (
                    <p className="text-xs text-destructive">{editForm.formState.errors.clubSection.message as string}</p>
                  )}
                </div>
              </div>
              {showEditStaffRole && (
                <div className="space-y-2">
                  <Label>{t.staffRoleLabel}</Label>
                  <Controller control={editForm.control} name="staffRole" render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {staffRoleOptions(watchedEditRole).map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t.registrationNumber}</Label>
                  <Input {...editForm.register("registrationNumber")} />
                </div>
                <div className="space-y-2">
                  <Label>{t.phone}</Label>
                  <Input type="tel" {...editForm.register("phone")} />
                </div>
              </div>
              {showEditCoachFields && (
                <div className="space-y-2">
                  <Label>{t.licenseType}</Label>
                  <Controller control={editForm.control} name="licenseType" render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <SelectTrigger><SelectValue placeholder="Licenza" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UEFA_A">UEFA A</SelectItem>
                        <SelectItem value="UEFA_B">UEFA B</SelectItem>
                        <SelectItem value="UEFA_C">UEFA C</SelectItem>
                        <SelectItem value="UEFA_Pro">UEFA Pro</SelectItem>
                        <SelectItem value="Grassroots">Grassroots</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                </div>
              )}
              {showEditFitnessFields && (
                <div className="space-y-2">
                  <Label>{t.specialization}</Label>
                  <Controller control={editForm.control} name="specialization" render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <SelectTrigger><SelectValue placeholder="Specializzazione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="strength">Forza</SelectItem>
                        <SelectItem value="endurance">Resistenza</SelectItem>
                        <SelectItem value="recovery">Recupero</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                </div>
              )}
              <div className="flex items-center gap-3">
                <Controller control={editForm.control} name="registered" render={({ field }) => (
                  <Checkbox id="editReg" checked={field.value ?? false} onCheckedChange={field.onChange} />
                )} />
                <Label htmlFor="editReg" className="cursor-pointer">{t.registered}</Label>
              </div>

              {/* Laurea in Scienze Motorie */}
              <div className="space-y-2 pt-1 border-t border-border/50">
                <div className="flex items-center gap-3">
                  <Controller control={editForm.control} name="degreeScienzeMoto" render={({ field }) => (
                    <Checkbox id="editDegree" checked={field.value ?? false} onCheckedChange={(v) => {
                      field.onChange(v);
                      if (!v) editForm.setValue("degreeScienzeMotoType", undefined);
                    }} />
                  )} />
                  <Label htmlFor="editDegree" className="cursor-pointer text-sm">Laurea in Scienze Motorie</Label>
                </div>
                {watchedEditDegreeScienzeMoto && (
                  <div className="pl-7 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Tipologia corso</Label>
                    <Controller control={editForm.control} name="degreeScienzeMotoType" render={({ field }) => (
                      <div className="flex flex-wrap gap-2">
                        {["L-22", "LM-67", "LM-68", "LM-45"].map(tipo => (
                          <button
                            key={tipo}
                            type="button"
                            onClick={() => field.onChange(field.value === tipo ? undefined : tipo)}
                            className={`px-3 py-1 text-xs rounded-full border font-medium transition-colors ${field.value === tipo ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"}`}
                          >
                            {tipo}
                          </button>
                        ))}
                      </div>
                    )} />
                  </div>
                )}
              </div>
            </div>

            {showEditTeams && teams && teams.length > 0 && (
              <div className="space-y-2">
                <Label>{t.assignedTeams}</Label>
                <div className="border rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto bg-muted/30">
                  <Controller control={editForm.control} name="teamIds" render={({ field }) => (
                    <>
                      {[...teams].sort((a, b) => a.name.localeCompare(b.name, "it")).map(team => (
                        <div key={team.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`team-${team.id}`}
                            checked={(field.value ?? []).includes(team.id)}
                            onCheckedChange={() => toggleTeam(team.id)}
                          />
                          <Label htmlFor={`team-${team.id}`} className="cursor-pointer font-normal text-sm">
                            {team.name}
                            {team.ageGroup && <span className="text-muted-foreground ml-1">({team.ageGroup})</span>}
                          </Label>
                        </div>
                      ))}
                    </>
                  )} />
                </div>
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button variant="outline" type="button" onClick={() => setEditingMember(null)}>
                {t.cancel ?? "Cancel"}
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t.saving : t.saveChanges}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Filter bar */}
      <div className="space-y-2">
        <div className="bg-card border rounded-xl shadow-sm p-2 flex items-center gap-2 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          <Search className="w-5 h-5 text-muted-foreground ml-2 shrink-0" />
          <Input
            placeholder="Cerca per nome, cognome o email..."
            className="border-0 focus-visible:ring-0 shadow-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground px-2 text-sm">✕</button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {/* Sezione */}
          <div className="flex flex-col gap-1 bg-card border rounded-lg px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Sezione</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {[
                { v: "all", l: "Tutte" },
                { v: "scuola_calcio", l: "Scuola Calcio" },
                { v: "settore_giovanile", l: "Settore Giovanile" },
                { v: "prima_squadra", l: "Prima Squadra" },
              ].map(o => (
                <button key={o.v} type="button" onClick={() => setSectionFilter(o.v)}
                  className={`px-2.5 py-0.5 text-[11px] rounded font-medium transition-colors ${sectionFilter === o.v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Ruolo */}
            <div className="flex flex-col gap-1 bg-card border rounded-lg px-3 py-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Ruolo</span>
              <div className="flex flex-wrap gap-1">
                {[
                  { v: "all", l: "Tutti" },
                  { v: "coach", l: t.coach },
                  { v: "fitness_coach", l: t.fitnessCoach },
                  { v: "technical_director", l: "Dir. Tecnico" },
                  { v: "athletic_director", l: "Dir. Sportivo" },
                  { v: "secretary", l: t.secretary },
                  { v: "director", l: t.director },
                  { v: "admin", l: t.admin },
                ].map(o => (
                  <button key={o.v} type="button" onClick={() => setRoleFilter(o.v)}
                    className={`px-2.5 py-0.5 text-[11px] rounded font-medium transition-colors ${roleFilter === o.v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>

            {/* Licenza */}
            <div className="flex flex-col gap-1 bg-card border rounded-lg px-3 py-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Licenza Allenatore</span>
              <div className="flex flex-wrap gap-1">
                {[
                  { v: "all", l: "Tutte" },
                  { v: "UEFA_A", l: "UEFA A" },
                  { v: "UEFA_B", l: "UEFA B" },
                  { v: "UEFA_C", l: "UEFA C" },
                  { v: "UEFA_Pro", l: "UEFA Pro" },
                  { v: "Grassroots", l: "Grassroots" },
                ].map(o => (
                  <button key={o.v} type="button" onClick={() => setLicenseFilter(o.v)}
                    className={`px-2.5 py-0.5 text-[11px] rounded font-medium transition-colors ${licenseFilter === o.v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Incarico */}
            <div className="flex flex-col gap-1 bg-card border rounded-lg px-3 py-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Incarico</span>
              <Select value={staffRoleFilter} onValueChange={setStaffRoleFilter}>
                <SelectTrigger className="h-7 text-[11px] focus:ring-0 mt-0.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  {allStaffRoleOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Laurea Scienze Motorie */}
            <div className="flex flex-col gap-1 bg-card border rounded-lg px-3 py-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">🎓 Sc. Motorie</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {[{ v: "all", l: "Tutti" }, { v: "yes", l: "Sì" }, { v: "no", l: "No" }].map(o => (
                  <button key={o.v} type="button" onClick={() => setDegreeFilter(o.v)}
                    className={`px-2.5 py-0.5 text-[11px] rounded font-medium transition-colors ${degreeFilter === o.v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>

            {/* Tesserato */}
            <div className="flex flex-col gap-1 bg-card border rounded-lg px-3 py-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Tesserato</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {[{ v: "all", l: "Tutti" }, { v: "yes", l: "Sì" }, { v: "no", l: "No" }].map(o => (
                  <button key={o.v} type="button" onClick={() => setRegisteredFilter(o.v)}
                    className={`px-2.5 py-0.5 text-[11px] rounded font-medium transition-colors ${registeredFilter === o.v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Reset */}
          {memberActiveFilterCount > 0 && (
            <button type="button" onClick={() => { setSectionFilter("all"); setRoleFilter("all"); setLicenseFilter("all"); setStaffRoleFilter("all"); setDegreeFilter("all"); setRegisteredFilter("all"); }}
              className="self-start px-2 py-1 text-[11px] text-destructive font-medium hover:underline">
              Azzera filtri ({memberActiveFilterCount})
            </button>
          )}
        </div>

        {/* Result count */}
        {!isLoading && filteredMembers !== undefined && filteredMembers.length !== members?.length && (
          <p className="text-xs text-muted-foreground px-1">
            {filteredMembers.length} di {members?.length} membro/i
          </p>
        )}
      </div>

      {/* Members list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {isLoading ? (
          Array(4).fill(0).map((_, i) => (
            <div key={i} className="bg-card border border-border/50 rounded-xl p-5 flex items-center gap-4 shadow-sm">
              <div className="h-14 w-14 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                <div className="h-3 w-48 bg-muted animate-pulse rounded" />
              </div>
            </div>
          ))
        ) : filteredMembers?.length === 0 ? (
          <div className="col-span-2 text-center py-16 text-muted-foreground">
            <p className="font-medium">Nessun membro trovato</p>
            <p className="text-sm mt-1">Prova a modificare i filtri di ricerca</p>
          </div>
        ) : filteredMembers?.map(member => {
          const isAdmin = member.role === "admin";
          const memberSecs: ClubSection[] = Array.isArray(member.clubSection) && member.clubSection.length > 0
            ? (member.clubSection as ClubSection[])
            : ["scuola_calcio" as ClubSection];
          const stripStyle = buildStripStyle(isAdmin, memberSecs);
          const bgStyle = buildBgStyle(isAdmin, memberSecs);
          return (
          <div key={member.id} className="relative border border-border/50 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow" style={{ background: bgStyle }}>
            <div className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ background: stripStyle }} />
            <div className="flex items-start gap-4 p-5 pl-[18px] w-full">
            <Avatar className="h-14 w-14 border-2 border-primary/20 shrink-0">
              <AvatarFallback className="bg-primary/5 text-primary text-lg font-bold">
                {member.firstName[0]}{member.lastName[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-foreground truncate">{member.firstName} {member.lastName}</h3>
              <p className="text-sm text-muted-foreground truncate">{member.email}</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                {t.joined} {format(new Date(member.joinedAt), "MMM yyyy", { locale })}
              </p>
              <div className="flex flex-col gap-1.5 mt-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {memberSecs.map(s => (
                    <span key={s} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-black/10 dark:bg-white/12 text-foreground/75 border border-black/8 dark:border-white/10">
                      {SECTION_CONFIG[s]?.label ?? s}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-black/10 dark:bg-white/12 text-foreground/75 border border-black/8 dark:border-white/10">
                    {roleLabel(member.role)}
                  </span>
                  {member.staffRole && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-black/10 dark:bg-white/12 text-foreground/75 border border-black/8 dark:border-white/10">
                      {staffRoleOptions(member.role).find(o => o.value === member.staffRole)?.label ?? member.staffRole}
                    </span>
                  )}
                  {member.licenseType && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-black/10 dark:bg-white/12 text-foreground/75 border border-black/8 dark:border-white/10">
                      🪪 {{"UEFA_A":"UEFA A","UEFA_B":"UEFA B","UEFA_C":"UEFA C","UEFA_Pro":"UEFA Pro","Grassroots":"Grassroots"}[member.licenseType] ?? member.licenseType}
                    </span>
                  )}
                  {member.degreeScienzeMoto && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-black/10 dark:bg-white/12 text-foreground/75 border border-black/8 dark:border-white/10">
                      🎓 Sc. Motorie{member.degreeScienzeMotoType ? ` (${member.degreeScienzeMotoType})` : ""}
                    </span>
                  )}
                  {member.registered && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-black/10 dark:bg-white/12 text-foreground/75 border border-black/8 dark:border-white/10">
                      {t.registered}
                    </span>
                  )}
                </div>
              </div>
              {(member.teamAssignments && member.teamAssignments.length > 0) && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {member.teamAssignments.map(a => (
                    <span key={a.id} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                      {a.teamName}
                    </span>
                  ))}
                </div>
              )}
              {member.phone && (
                <p className="text-xs text-muted-foreground mt-1">{member.phone}</p>
              )}
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-primary"
                onClick={() => openEdit(member)}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => { if (confirm(t.removeMember)) removeMutation.mutate({ userId: member.id }) }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
