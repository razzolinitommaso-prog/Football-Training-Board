import { useEffect, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

type PlayerOption = { value: string; label: string };

/** Local to the board: no changes to the shared Select or assignment rules. */
export function PlayerAssignmentSelect({ value, options, onValueChange }: {
  value: string; options: PlayerOption[]; onValueChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const visual = window.visualViewport;
    const update = () => setViewport({ height: visual?.height ?? window.innerHeight, top: visual?.offsetTop ?? 0 });
    update();
    visual?.addEventListener("resize", update);
    visual?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      visual?.removeEventListener("resize", update);
      visual?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [open]);
  const selected = options.find(option => option.value === value);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <button type="button" aria-label="Seleziona giocatore" className="flex min-h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-white/20 bg-white/5 px-3 text-left text-xs text-white">
        <span className="truncate">{selected?.label ?? "Seleziona giocatore"}</span><ChevronsUpDown className="h-4 w-4 shrink-0" />
      </button>
    </DialogTrigger>
    <DialogContent className="flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden rounded-xl p-4" style={viewport ? {
      maxHeight: Math.max(160, viewport.height - 32), top: viewport.top + viewport.height / 2,
    } : undefined}>
      <DialogHeader className="shrink-0 pr-6">
        <DialogTitle>Assegna giocatore</DialogTitle>
        <DialogDescription>Cerca per nome o numero e scegli dalla rosa disponibile.</DialogDescription>
      </DialogHeader>
      <Command className="min-h-0 flex-1">
        <CommandInput aria-label="Cerca giocatore" placeholder="Cerca nome o numero…" />
        <CommandList className="min-h-0" style={{ maxHeight: "min(50dvh, 24rem)", overscrollBehavior: "contain" }}>
          <CommandEmpty>Nessun giocatore trovato.</CommandEmpty>
          {options.map(option => <CommandItem key={option.value} value={`${option.label} ${option.value}`} onSelect={() => {
            onValueChange(option.value);
            setOpen(false);
          }} className="min-h-11 gap-2 whitespace-normal break-words">
            <Check className={`h-4 w-4 shrink-0 ${option.value === value ? "opacity-100" : "opacity-0"}`} />
            <span>{option.label}</span>
          </CommandItem>)}
        </CommandList>
      </Command>
    </DialogContent>
  </Dialog>;
}
