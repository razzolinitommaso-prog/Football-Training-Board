import type { ComponentProps } from "react";

type SvgProps = ComponentProps<"svg">;

function baseSvgProps(props: SvgProps) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    ...props,
  } as const;
}

export function PlayerToolIcon(props: SvgProps) {
  return (
    <svg {...baseSvgProps(props)}>
      <circle cx="12" cy="5.2" r="2.4" fill="#3B82F6" stroke="#0B3A73" strokeWidth="1.2" />
      <rect x="9.8" y="7.8" width="4.4" height="7.6" rx="1.8" fill="#3B82F6" stroke="#0B3A73" strokeWidth="1.2" />
      <rect x="7.1" y="9.2" width="2.3" height="5.6" rx="1.1" fill="#60A5FA" stroke="#0B3A73" strokeWidth="1" />
      <rect x="14.6" y="9.2" width="2.3" height="5.6" rx="1.1" fill="#60A5FA" stroke="#0B3A73" strokeWidth="1" />
      <rect x="9.4" y="15.3" width="2.1" height="5.1" rx="1" fill="#1D4ED8" stroke="#0B3A73" strokeWidth="1" />
      <rect x="12.5" y="15.3" width="2.1" height="5.1" rx="1" fill="#1D4ED8" stroke="#0B3A73" strokeWidth="1" />
    </svg>
  );
}

export function OpponentToolIcon(props: SvgProps) {
  return (
    <svg {...baseSvgProps(props)}>
      <circle cx="12" cy="5.2" r="2.4" fill="#EF4444" stroke="#7F1D1D" strokeWidth="1.2" />
      <rect x="9.8" y="7.8" width="4.4" height="7.6" rx="1.8" fill="#EF4444" stroke="#7F1D1D" strokeWidth="1.2" />
      <rect x="7.1" y="9.2" width="2.3" height="5.6" rx="1.1" fill="#F87171" stroke="#7F1D1D" strokeWidth="1" />
      <rect x="14.6" y="9.2" width="2.3" height="5.6" rx="1.1" fill="#F87171" stroke="#7F1D1D" strokeWidth="1" />
      <rect x="9.4" y="15.3" width="2.1" height="5.1" rx="1" fill="#DC2626" stroke="#7F1D1D" strokeWidth="1" />
      <rect x="12.5" y="15.3" width="2.1" height="5.1" rx="1" fill="#DC2626" stroke="#7F1D1D" strokeWidth="1" />
    </svg>
  );
}

export function GoalkeeperToolIcon(props: SvgProps) {
  return (
    <svg {...baseSvgProps(props)}>
      <circle cx="12" cy="5.2" r="2.4" fill="#FACC15" stroke="#854D0E" strokeWidth="1.2" />
      <path d="M8.9 8.1h6.2l1.5 2.2-1.7 5.1H9.1L7.4 10.3l1.5-2.2z" fill="#FDE047" stroke="#854D0E" strokeWidth="1.2" />
      <rect x="7" y="9.5" width="1.9" height="4.2" rx="0.9" fill="#FEF08A" stroke="#854D0E" strokeWidth="1" />
      <rect x="15.1" y="9.5" width="1.9" height="4.2" rx="0.9" fill="#FEF08A" stroke="#854D0E" strokeWidth="1" />
      <rect x="9.4" y="15.2" width="2.1" height="5.2" rx="1" fill="#CA8A04" stroke="#854D0E" strokeWidth="1" />
      <rect x="12.5" y="15.2" width="2.1" height="5.2" rx="1" fill="#CA8A04" stroke="#854D0E" strokeWidth="1" />
    </svg>
  );
}

export function BallToolIcon(props: SvgProps) {
  return (
    <svg {...baseSvgProps(props)}>
      <circle cx="12" cy="12" r="8.5" fill="#FFFFFF" stroke="#111827" strokeWidth="1.4" />
      <path
        d="M12 7.8l2.1 1.4-.8 2.4H10.7l-.8-2.4L12 7.8z"
        fill="#111827"
      />
      <path
        d="M9.2 9.3l-2.2.5m10-.5l2.2.5M10.7 11.7l-1.3 2.1m5.2-2.1l1.3 2.1m-4.7 1.6h1.6"
        stroke="#111827"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ConeToolIcon(props: SvgProps) {
  return (
    <svg {...baseSvgProps(props)}>
      <path d="M12 5.2l4.6 12.6H7.4L12 5.2z" fill="#E11D48" stroke="#7F1D1D" strokeWidth="1.2" />
      <rect x="6.6" y="17.2" width="10.8" height="2.2" rx="0.8" fill="#F97316" stroke="#9A3412" strokeWidth="1.1" />
    </svg>
  );
}

export function GoalToolIcon(props: SvgProps) {
  return (
    <svg {...baseSvgProps(props)}>
      <path d="M5.2 7.3h13.6v9.4H5.2z" fill="#FFFFFF" stroke="#111827" strokeWidth="1.2" />
      <path d="M7.2 7.3v9.4M9.8 7.3v9.4M12.4 7.3v9.4M15 7.3v9.4M17.6 7.3v9.4" stroke="#9CA3AF" strokeWidth="0.9" />
      <path d="M5.2 10.4h13.6M5.2 13.5h13.6" stroke="#9CA3AF" strokeWidth="0.9" />
    </svg>
  );
}

export function DiscToolIcon(props: SvgProps) {
  return (
    <svg {...baseSvgProps(props)}>
      <ellipse cx="12" cy="12" rx="7.6" ry="4.2" fill="none" stroke="#DC2626" strokeWidth="1.8" />
    </svg>
  );
}

export function CinesinoToolIcon(props: SvgProps) {
  return (
    <svg {...baseSvgProps(props)}>
      <path d="M12 7.1l3.4 9.8H8.6L12 7.1z" fill="#FBBF24" stroke="#92400E" strokeWidth="1.1" />
    </svg>
  );
}

export function FlagToolIcon(props: SvgProps) {
  return (
    <svg {...baseSvgProps(props)}>
      <path d="M10.4 5v14" stroke="#92400E" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10.9 5.6h7.1l-2.1 2.5 2.1 2.5h-7.1z" fill="#FBBF24" stroke="#92400E" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

export function LadderToolIcon(props: SvgProps) {
  return (
    <svg {...baseSvgProps(props)}>
      <path d="M8.3 5v14M15.7 5v14" stroke="#111827" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.5 8h7M8.5 11h7M8.5 14h7M8.5 17h7" stroke="#111827" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function HurdleToolIcon(props: SvgProps) {
  return (
    <svg {...baseSvgProps(props)}>
      <path d="M7 11.2h10" stroke="#B91C1C" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M8.2 12.2v6M15.8 12.2v6" stroke="#B91C1C" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function PoleToolIcon(props: SvgProps) {
  return (
    <svg {...baseSvgProps(props)}>
      <rect x="11.1" y="5" width="1.8" height="13.8" rx="0.8" fill="#FBBF24" stroke="#92400E" strokeWidth="1.1" />
    </svg>
  );
}

export function VestToolIcon(props: SvgProps) {
  return (
    <svg {...baseSvgProps(props)}>
      <path
        d="M8.4 6.4l2-2h3.2l2 2 2 2.2-1.4 2-1.9-.7V18H9.7v-6.8l-1.9.7-1.4-2 2-2.2z"
        fill="#FBBF24"
        stroke="#92400E"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TextToolIcon(props: SvgProps) {
  return (
    <svg {...baseSvgProps(props)}>
      <circle cx="12" cy="12" r="8.5" fill="#FFFFFF" stroke="#111827" strokeWidth="1.2" />
      <path d="M9.1 9h5.8M12 9v7" stroke="#111827" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function SagomaToolIcon(props: SvgProps) {
  return (
    <svg {...baseSvgProps(props)}>
      <circle cx="12" cy="6.2" r="2.2" fill="#2563EB" stroke="#1E3A8A" strokeWidth="1.1" />
      <path d="M9.6 8.6h4.8l1.1 6.4H8.5l1.1-6.4z" fill="#3B82F6" stroke="#1E3A8A" strokeWidth="1.1" />
      <rect x="9.2" y="15" width="5.6" height="3.8" rx="0.9" fill="#1D4ED8" stroke="#1E3A8A" strokeWidth="1.1" />
    </svg>
  );
}
