import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor, Palette, Check } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";

export function useBrandBackground() {
  const read = () => { try { return localStorage.getItem("ftb-brand-background") === "true"; } catch { return false; } };
  const [value, setValue] = useState(read);
  useEffect(() => { const update = () => setValue(read()); window.addEventListener("ftb-appearance", update); window.addEventListener("storage", update); return () => { window.removeEventListener("ftb-appearance", update); window.removeEventListener("storage", update); }; }, []);
  return [value, () => { try { localStorage.setItem("ftb-brand-background", String(!value)); } catch {} setValue(!value); window.dispatchEvent(new Event("ftb-appearance")); }] as const;
}
function appearanceKey(profileKey: string | null) {
  return profileKey ? `ftb-account-appearance:${profileKey}` : null;
}
function readAppearance(key: string | null): { theme?: string; font?: string } {
  if (!key) return {};
  try { return JSON.parse(localStorage.getItem(key) ?? "{}"); } catch { return {}; }
}
export function useAccountAppearance() {
  const { profileKey } = useAuth();
  const { theme, setTheme } = useTheme();
  const key = appearanceKey(profileKey);
  const [font, setLocalFont] = useState(() => readAppearance(key).font ?? "standard");
  useEffect(() => {
    const saved = readAppearance(key);
    setLocalFont(saved.font ?? "standard");
    if (!key) return;
    try {
      const defaultKey = "ftb-default-appearance";
      const defaultTheme = localStorage.getItem(defaultKey) ?? localStorage.getItem("ftb-appearance") ?? "light";
      localStorage.setItem(defaultKey, defaultTheme);
      const selected = saved.theme ?? defaultTheme;
      if (["system", "light", "dark"].includes(selected)) setTheme(selected);
    } catch { /* Storage is optional. */ }
  }, [key, setTheme]);
  function save(values: { theme?: string; font?: string }) {
    try { if (key) localStorage.setItem(key, JSON.stringify({ ...readAppearance(key), ...values })); } catch { /* Storage is optional. */ }
  }
  return {
    theme, font,
    setTheme: (value: string) => { setTheme(value); save({ theme: value }); },
    setFont: (value: string) => { setLocalFont(value); save({ font: value }); window.dispatchEvent(new Event("ftb-profile-font")); },
  };
}
export function AccountTextSize() {
  const { profileKey } = useAuth();
  useEffect(() => {
    const update = () => {
      const font = readAppearance(appearanceKey(profileKey)).font;
      document.documentElement.style.fontSize = font === "extra" ? "118.75%" : font === "large" ? "109.375%" : "";
    };
    update();
    window.addEventListener("ftb-profile-font", update);
    return () => {
      window.removeEventListener("ftb-profile-font", update);
      document.documentElement.style.removeProperty("font-size");
    };
  }, [profileKey]);
  return null;
}
export function AppearanceMenu() {
  const { theme, setTheme } = useAccountAppearance();
  const [brand, toggleBrand] = useBrandBackground();
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Aspetto: chiaro, scuro o sistema" title="Aspetto"><Palette className="h-5 w-5" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end"><DropdownMenuLabel>Aspetto</DropdownMenuLabel>
      {([{ value: "light", label: "Chiaro", icon: Sun }, { value: "dark", label: "Scuro", icon: Moon }, { value: "system", label: "Sistema", icon: Monitor }]).map(({ value, label, icon: Icon }) => <DropdownMenuItem key={value} onSelect={() => setTheme(value)}><Icon className="h-4 w-4" />{label}{theme === value && <Check className="ml-auto h-4 w-4" />}</DropdownMenuItem>)}
      <DropdownMenuItem onSelect={toggleBrand}>Sfondo società{brand && <Check className="ml-auto h-4 w-4" />}</DropdownMenuItem>
    </DropdownMenuContent></DropdownMenu>;
}
