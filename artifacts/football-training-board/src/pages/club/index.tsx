import { useGetMyClub, useUpdateMyClub } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef, useState } from "react";
import { Shield, MapPin, Calendar, Check, Upload, X, Palette } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

const PRESET_COLORS = [
  "#1a56db", "#0e9f6e", "#e3a008", "#e02424", "#7e3af2",
  "#ff6700", "#0694a2", "#c81e1e", "#057a55", "#1c64f2",
  "#ffffff", "#f3f4f6", "#111827", "#374151", "#6b7280",
  "#fbbf24", "#34d399", "#60a5fa", "#f87171", "#a78bfa",
];

const clubSchema = z.object({
  name: z.string().min(2, "Nome società obbligatorio"),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  foundedYear: z.coerce.number().optional().nullable(),
  description: z.string().optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  primaryColor: z.string().optional().nullable(),
  secondaryColor: z.string().optional().nullable(),
});

type FormData = z.infer<typeof clubSchema>;

function ColorPicker({
  label,
  description,
  value,
  onChange,
  inputId,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (c: string) => void;
  inputId: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-semibold">{label}</Label>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            className="w-7 h-7 rounded-md border-2 transition-all hover:scale-110 focus:outline-none"
            style={{
              backgroundColor: color,
              borderColor: value === color ? "hsl(var(--foreground))" : color === "#ffffff" || color === "#f3f4f6" ? "hsl(var(--border))" : "transparent",
              boxShadow: value === color ? `0 0 0 2px hsl(var(--background)), 0 0 0 4px ${color}` : "none",
            }}
            title={color}
          />
        ))}
      </div>
      <div className="flex items-center gap-3">
        <input
          id={inputId}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 rounded-lg cursor-pointer border border-border bg-transparent p-0.5"
        />
        <span className="text-sm font-mono text-muted-foreground">{value}</span>
        <div
          className="w-8 h-8 rounded-lg border border-border shadow-sm"
          style={{ backgroundColor: value }}
        />
      </div>
    </div>
  );
}

export default function ClubSettings() {
  const { t } = useLanguage();
  const { data: club, isLoading } = useGetMyClub();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState<string>("#1a56db");
  const [secondaryColor, setSecondaryColor] = useState<string>("#e3a008");

  const form = useForm<FormData>({
    resolver: zodResolver(clubSchema),
  });

  useEffect(() => {
    if (club) {
      form.reset({
        name: club.name,
        city: club.city,
        country: club.country,
        foundedYear: club.foundedYear,
        description: club.description,
        logoUrl: club.logoUrl,
        primaryColor: (club as any).primaryColor,
        secondaryColor: (club as any).secondaryColor,
      });
      if (club.logoUrl) setLogoPreview(club.logoUrl);
      if ((club as any).primaryColor) setPrimaryColor((club as any).primaryColor);
      if ((club as any).secondaryColor) setSecondaryColor((club as any).secondaryColor);
    }
  }, [club, form]);

  const updateMutation = useUpdateMyClub({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/clubs/me"] });
        toast({ title: "Impostazioni salvate con successo" });
      },
      onError: () => {
        toast({ title: "Errore durante il salvataggio", variant: "destructive" });
      },
    }
  });

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Il file è troppo grande (max 2MB)", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setLogoPreview(result);
      form.setValue("logoUrl", result);
    };
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    setLogoPreview(null);
    form.setValue("logoUrl", null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handlePrimaryChange(color: string) {
    setPrimaryColor(color);
    form.setValue("primaryColor", color);
  }

  function handleSecondaryChange(color: string) {
    setSecondaryColor(color);
    form.setValue("secondaryColor", color);
  }

  function onSubmit(data: FormData) {
    updateMutation.mutate({ data } as any);
  }

  if (isLoading) return null;

  const bannerStyle = {
    background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">{t.clubSettingsTitle}</h1>
        <p className="text-muted-foreground mt-1">{t.clubSettingsDesc}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Preview card */}
        <div className="md:col-span-1 space-y-6">
          <Card className="border-border/50 shadow-md text-center overflow-hidden">
            <div className="h-24 w-full" style={bannerStyle} />
            <CardContent className="pt-0 relative">
              <div className="w-24 h-24 rounded-2xl bg-background border-4 border-background shadow-lg mx-auto -mt-12 flex items-center justify-center overflow-hidden">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo società" className="w-full h-full object-cover" />
                ) : (
                  <img src={`${import.meta.env.BASE_URL}images/logo-icon.png`} alt="Logo" className="w-full h-full object-cover" />
                )}
              </div>
              <h2 className="text-xl font-bold font-display mt-4">{club?.name}</h2>
              {/* Color preview chips */}
              <div className="flex items-center justify-center gap-2 mt-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full border-2 border-white/30 shadow-sm" style={{ backgroundColor: primaryColor }} title="Colore primario" />
                  <div className="w-5 h-5 rounded-full border-2 border-white/30 shadow-sm" style={{ backgroundColor: secondaryColor }} title="Colore secondario" />
                </div>
              </div>
              <div className="flex flex-col gap-2 mt-3 text-sm text-muted-foreground">
                {(club?.city || club?.country) && (
                  <div className="flex items-center justify-center gap-2">
                    <MapPin className="w-4 h-4" />
                    <span>{club?.city}{club?.city && club?.country ? ", " : ""}{club?.country}</span>
                  </div>
                )}
                {club?.foundedYear && (
                  <div className="flex items-center justify-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>{t.established} {club?.foundedYear}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm bg-primary/5 border-primary/20">
            <CardContent className="p-4 flex gap-3">
              <Shield className="w-5 h-5 text-primary shrink-0" />
              <div className="text-sm">
                <p className="font-semibold text-foreground">{t.verifiedClub}</p>
                <p className="text-muted-foreground mt-1">{t.verifiedClubDesc}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Form */}
        <div className="md:col-span-2 space-y-6">
          <Card className="border-border/50 shadow-md">
            <CardHeader>
              <CardTitle>{t.clubInformation}</CardTitle>
              <CardDescription>{t.clubInfoDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">{t.clubName}</Label>
                  <Input id="name" {...form.register("name")} className="max-w-md" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="city">{t.city}</Label>
                    <Input id="city" {...form.register("city")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">{t.country}</Label>
                    <Input id="country" {...form.register("country")} />
                  </div>
                </div>

                <div className="space-y-2 max-w-xs">
                  <Label htmlFor="foundedYear">{t.yearFounded}</Label>
                  <Input id="foundedYear" type="number" {...form.register("foundedYear")} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">{t.aboutClub}</Label>
                  <Textarea
                    id="description"
                    placeholder={t.aboutClubPlaceholder}
                    className="h-32 resize-none"
                    {...form.register("description")}
                  />
                </div>

                <Button type="submit" disabled={updateMutation.isPending} className="shadow-lg shadow-primary/20">
                  {updateMutation.isPending ? t.savingChanges : <><Check className="w-4 h-4 mr-2" /> {t.saveChanges}</>}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Logo upload */}
          <Card className="border-border/50 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                Logo Società
              </CardTitle>
              <CardDescription>
                Carica il logo della tua società (JPG, PNG, SVG — max 2MB)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted/30 shrink-0">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
                  ) : (
                    <Upload className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    onChange={handleLogoFile}
                    className="hidden"
                    id="logo-upload"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-2 w-fit"
                  >
                    <Upload className="w-4 h-4" />
                    {logoPreview ? "Cambia logo" : "Carica logo"}
                  </Button>
                  {logoPreview && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={removeLogo}
                      className="gap-2 w-fit text-destructive hover:text-destructive"
                    >
                      <X className="w-4 h-4" />
                      Rimuovi logo
                    </Button>
                  )}
                </div>
              </div>

              {logoPreview && (
                <Button
                  type="button"
                  disabled={updateMutation.isPending}
                  onClick={() => form.handleSubmit(onSubmit)()}
                  className="gap-2"
                  size="sm"
                >
                  <Check className="w-4 h-4" />
                  Salva logo
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Color pickers */}
          <Card className="border-border/50 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-primary" />
                Colori Societari
              </CardTitle>
              <CardDescription>
                Scegli i colori della tua società — la maggior parte dei club ha due colori (es. giallo e blu, rosso e bianco)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Live banner preview */}
              <div className="rounded-xl overflow-hidden border border-border/50 shadow-sm">
                <div className="h-12 w-full" style={bannerStyle} />
                <div className="px-4 py-2 bg-card flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3.5 h-3.5 rounded-full border border-border/50" style={{ backgroundColor: primaryColor }} />
                    <span>Primario</span>
                  </div>
                  <span>+</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3.5 h-3.5 rounded-full border border-border/50" style={{ backgroundColor: secondaryColor }} />
                    <span>Secondario</span>
                  </div>
                  <span className="ml-auto italic">Anteprima sfumatura</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-3 p-4 rounded-xl border border-border/40 bg-muted/20">
                  <ColorPicker
                    label="Colore Primario"
                    description="Il colore principale della divisa"
                    value={primaryColor}
                    onChange={handlePrimaryChange}
                    inputId="color-primary"
                  />
                </div>

                <div className="space-y-3 p-4 rounded-xl border border-border/40 bg-muted/20">
                  <ColorPicker
                    label="Colore Secondario"
                    description="Il secondo colore della divisa"
                    value={secondaryColor}
                    onChange={handleSecondaryChange}
                    inputId="color-secondary"
                  />
                </div>
              </div>

              <Button
                type="button"
                disabled={updateMutation.isPending}
                onClick={() => form.handleSubmit(onSubmit)()}
                className="gap-2"
                size="sm"
              >
                <Check className="w-4 h-4" />
                Salva colori
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
