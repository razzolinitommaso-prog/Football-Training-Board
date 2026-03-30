import { useLanguage, Language } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-0.5 border border-border/40">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLanguage("en")}
        className={`h-7 px-2.5 text-xs font-semibold rounded-md transition-all ${
          language === "en"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        🇬🇧 EN
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLanguage("it")}
        className={`h-7 px-2.5 text-xs font-semibold rounded-md transition-all ${
          language === "it"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        🇮🇹 IT
      </Button>
    </div>
  );
}
