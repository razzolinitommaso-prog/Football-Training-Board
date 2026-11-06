import { type ReactNode, useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronDown } from "lucide-react";
import "./compact-match.css";
import { preparationLabels, type MatchPreparation } from "@/lib/match-presentation";

export function CompactMatchHeading({
  date,
  home,
  away,
  result,
  metadata,
  actions,
  selection,
  indicators,
  preparationStatus,
  nextMatch,
}: {
  date: string | null | undefined;
  home?: ReactNode;
  away: ReactNode;
  result?: ReactNode;
  metadata?: ReactNode;
  actions?: ReactNode;
  selection?: ReactNode;
  indicators?: ReactNode;
  preparationStatus?: MatchPreparation;
  nextMatch?: boolean;
}) {
  const at = new Date(date ?? ""),
    valid = Number.isFinite(at.getTime());
  return (
    <div className="compact-match-heading">
      {selection && <div className="compact-match-selection">{selection}</div>}
      <time
        className="compact-match-date"
        dateTime={valid ? at.toISOString() : undefined}
        title={
          valid
            ? format(at, "EEEE d MMMM yyyy · HH:mm", { locale: it })
            : "Data da definire"
        }
      >
        {valid ? (
          <>
            <span>{format(at, "EEE", { locale: it })}</span>
            <strong>{format(at, "d MMM yyyy", { locale: it })}</strong>
            <span>{format(at, "HH:mm")}</span>
          </>
        ) : (
          <strong>Data da definire</strong>
        )}
      </time>
      <div className="compact-match-main">
        {nextMatch && <p className="mb-1 text-[10px] font-semibold text-primary">PROSSIMA PARTITA</p>}
        <div className="compact-match-teams">
          {home && (
            <>
              <strong>{home}</strong>
              <span className="compact-match-vs">vs</span>
            </>
          )}
          <strong>{away}</strong>
          {result != null && result !== "" && (
            <span className="compact-match-result">{result}</span>
          )}
        </div>
        <div className="compact-match-meta">{preparationStatus && <span className="match-preparation-tag" data-preparation={preparationStatus}>{preparationLabels[preparationStatus]}</span>}{metadata}</div>
      </div>
      {actions && <div className="compact-match-actions">{actions}</div>}
      {indicators && (
        <div className="compact-match-indicators">{indicators}</div>
      )}
    </div>
  );
}

// Native disclosure keeps editors mounted: collapsing the row does not discard drafts.
export function CompactMatchDetails({
  children,
  open,
  onOpenChange,
  defaultOpen = false,
  label = "Dettagli e note",
}: {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  label?: ReactNode;
}) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  return (
    <details
      className="compact-match-details"
      open={open ?? localOpen}
      onToggle={(event) => {
        const value = event.currentTarget.open;
        setLocalOpen(value);
        onOpenChange?.(value);
      }}
    >
      <summary>
        <span>{label}</span>
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className="compact-match-detail-body">{children}</div>
    </details>
  );
}
