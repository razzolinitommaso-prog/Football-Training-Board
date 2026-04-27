import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ScheduleFilterOpts } from "@/lib/calendar-schedule-filter";
import { cn } from "@/lib/utils";

const SEC_LABEL = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const HINT = "text-[11px] text-muted-foreground leading-relaxed";

type Props = {
  value: ScheduleFilterOpts;
  onChange: (next: ScheduleFilterOpts) => void;
  idPrefix?: string;
};

type PropsWithExact = Props & {
  includeExactTime?: boolean;
};

type ExactBlockProps = Props & {
  /** Senza bordo proprio: da incollare in una sezione già delimitata. */
  variant?: "card" | "plain";
};

export function ScheduleFilterExactBlock({ value, onChange, idPrefix = "sched", variant = "card" }: ExactBlockProps) {
  const patch = (p: Partial<ScheduleFilterOpts>) => onChange({ ...value, ...p });

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${idPrefix}-exact`}
            checked={value.exactTimeUse}
            onCheckedChange={(v) => patch({ exactTimeUse: v === true })}
          />
          <Label htmlFor={`${idPrefix}-exact`} className="text-sm font-medium cursor-pointer">
            Orario preciso (inizio partita)
          </Label>
        </div>
        {value.exactTimeUse && (
          <div className="flex items-center gap-2 pl-1">
            <Label htmlFor={`${idPrefix}-exact-time`} className={cn(HINT, "shrink-0")}>
              Ore
            </Label>
            <Input
              id={`${idPrefix}-exact-time`}
              type="time"
              value={value.exactTime || ""}
              onChange={(e) => patch({ exactTime: e.target.value })}
              className="h-9 w-[132px]"
            />
          </div>
        )}
      </div>
      <p className={HINT}>
        Mostra solo eventi che iniziano esattamente a quell&apos;ora (es. 10:30). Con piu criteri,
        vale l&apos;intersezione.
      </p>
    </>
  );

  if (variant === "plain") {
    return <div className="space-y-2">{body}</div>;
  }

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5">
      {body}
    </div>
  );
}

export function ScheduleFilterFields({
  value,
  onChange,
  idPrefix = "sched",
  includeExactTime = true,
}: PropsWithExact) {
  const patch = (p: Partial<ScheduleFilterOpts>) => onChange({ ...value, ...p });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <div className="space-y-2 min-w-0">
          <span className={SEC_LABEL}>Giorno</span>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={value.daySaturday ? "secondary" : "outline"}
              className={cn(
                "h-8 text-xs px-3 transition-colors",
                value.daySaturday && "bg-primary/15 text-primary border-primary/40 ring-1 ring-primary/30",
              )}
              aria-pressed={value.daySaturday}
              onClick={() => patch({ daySaturday: !value.daySaturday })}
            >
              Sabato
            </Button>
            <Button
              type="button"
              size="sm"
              variant={value.daySunday ? "secondary" : "outline"}
              className={cn(
                "h-8 text-xs px-3 transition-colors",
                value.daySunday && "bg-primary/15 text-primary border-primary/40 ring-1 ring-primary/30",
              )}
              aria-pressed={value.daySunday}
              onClick={() => patch({ daySunday: !value.daySunday })}
            >
              Domenica
            </Button>
          </div>
          <p className={HINT}>Nessun giorno = nessun filtro su sabato/domenica.</p>
        </div>

        <div className="space-y-2 min-w-0">
          <span className={SEC_LABEL}>Mattina / pomeriggio</span>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={value.periodMorning ? "secondary" : "outline"}
              className={cn(
                "h-8 text-xs px-3 transition-colors",
                value.periodMorning && "bg-primary/15 text-primary border-primary/40 ring-1 ring-primary/30",
              )}
              aria-pressed={value.periodMorning}
              onClick={() => patch({ periodMorning: !value.periodMorning })}
            >
              Mattina
            </Button>
            <Button
              type="button"
              size="sm"
              variant={value.periodAfternoon ? "secondary" : "outline"}
              className={cn(
                "h-8 text-xs px-3 transition-colors",
                value.periodAfternoon && "bg-primary/15 text-primary border-primary/40 ring-1 ring-primary/30",
              )}
              aria-pressed={value.periodAfternoon}
              onClick={() => patch({ periodAfternoon: !value.periodAfternoon })}
            >
              Pomeriggio
            </Button>
          </div>
          <p className={HINT}>
            Mattina prima delle 14:00 · pomeriggio dalle 14:00. Nessuno = qualsiasi ora.
          </p>
        </div>
      </div>

      <div className="space-y-2 pt-1 border-t border-border/50">
        <span className={SEC_LABEL}>Fascia oraria</span>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-4 sm:gap-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${idPrefix}-custom`}
              checked={value.slotUseCustom}
              onCheckedChange={(v) => patch({ slotUseCustom: v === true })}
            />
            <Label htmlFor={`${idPrefix}-custom`} className="text-sm font-medium cursor-pointer">
              Limita a intervallo
            </Label>
          </div>
          {value.slotUseCustom && (
            <div className="flex flex-wrap items-end gap-3 pl-0 sm:pl-2">
              <div className="space-y-1">
                <Label htmlFor={`${idPrefix}-from`} className="text-xs text-muted-foreground">
                  Da
                </Label>
                <Input
                  id={`${idPrefix}-from`}
                  type="time"
                  value={value.slotFrom || ""}
                  onChange={(e) => patch({ slotFrom: e.target.value })}
                  className="h-9 w-[130px]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${idPrefix}-to`} className="text-xs text-muted-foreground">
                  A
                </Label>
                <Input
                  id={`${idPrefix}-to`}
                  type="time"
                  value={value.slotTo || ""}
                  onChange={(e) => patch({ slotTo: e.target.value })}
                  className="h-9 w-[130px]"
                />
              </div>
            </div>
          )}
        </div>
        <p className={HINT}>
          Se attiva, mostra solo gli eventi compresi nell&apos;intervallo orario (es. 09:00-12:00).
        </p>
      </div>

      {includeExactTime && (
        <ScheduleFilterExactBlock value={value} onChange={onChange} idPrefix={idPrefix} variant="plain" />
      )}
    </div>
  );
}
