import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor, Palette, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";

export function useBrandBackground() {
  const read = () => { try { return localStorage.getItem("ftb-brand-background") === "true"; } catch { return false; } };
  const [value, setValue] = useState(read);
  useEffect(() => { const update = () => setValue(read()); window.addEventListener("ftb-appearance", update); window.addEventListener("storage", update); return () => { window.removeEventListener("ftb-appearance", update); window.removeEventListener("storage", update); }; }, []);
  return [value, () => { try { localStorage.setItem("ftb-brand-background", String(!value)); } catch {} setValue(!value); window.dispatchEvent(new Event("ftb-appearance")); }] as const;
}
export function AppearanceMenu() {
  const { theme, setTheme } = useTheme();
  const [brand, toggleBrand] = useBrandBackground();
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Aspetto: chiaro, scuro o sistema" title="Aspetto"><Palette className="h-5 w-5" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end"><DropdownMenuLabel>Aspetto</DropdownMenuLabel>
      {([{ value: "light", label: "Chiaro", icon: Sun }, { value: "dark", label: "Scuro", icon: Moon }, { value: "system", label: "Sistema", icon: Monitor }]).map(({ value, label, icon: Icon }) => <DropdownMenuItem key={value} onSelect={() => setTheme(value)}><Icon className="h-4 w-4" />{label}{theme === value && <Check className="ml-auto h-4 w-4" />}</DropdownMenuItem>)}
      <DropdownMenuItem onSelect={toggleBrand}>Sfondo società{brand && <Check className="ml-auto h-4 w-4" />}</DropdownMenuItem>
    </DropdownMenuContent></DropdownMenu>;
}
