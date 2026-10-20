/** Additive equipment: uses the existing board renderer, color and scale controls. */
export const ADDITIONAL_EQUIPMENT = [
  { id: "medusa", label: "Medusa" },
  { id: "freeKickWall", label: "Barriera punizioni" },
  { id: "inflatableDummy", label: "Dummy gonfiabile" },
  { id: "plyoBox", label: "Box pliometrico / step" },
] as const;

export function AdditionalEquipmentGlyph({ type, color }: { type?: string; color?: string }) {
  if (type === "medusa") return <svg viewBox="0 0 48 34" className="h-8 w-10 drop-shadow-sm" aria-hidden="true">
    <ellipse cx="24" cy="26" rx="20" ry="5" fill="#172033" stroke="#dbeafe" strokeWidth="1" />
    <path d="M6 24C7 2 41 2 42 24C35 30 13 30 6 24Z" fill={color ?? "#38bdf8"} stroke="#e0f2fe" strokeWidth="1.2" />
    <path d="M12 21C14 12 20 8 27 9" fill="none" stroke="#fff" strokeWidth="1.3" opacity=".5" strokeLinecap="round" />
    {[[14,18],[20,13],[28,13],[34,18],[24,21]].map(([x,y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1" fill="#e0f2fe" opacity=".8" />)}
  </svg>;
  if (type === "freeKickWall") return <svg viewBox="0 0 64 52" className="h-11 w-14 drop-shadow-sm" aria-hidden="true">
    {[12,32,52].map(x => <g key={x}>
      <circle cx={x} cy="9" r="5" fill={color ?? "#fb923c"} stroke="#fff7ed" strokeWidth="1.2" />
      <path d={`M${x-6} 18H${x+6}L${x+8} 34H${x+3}V43H${x-3}V34H${x-8}Z`} fill={color ?? "#fb923c"} stroke="#fff7ed" strokeWidth="1.2" strokeLinejoin="round" />
      <path d={`M${x} 43V49M${x-6} 49H${x+6}`} stroke="#e2e8f0" strokeWidth="1.6" strokeLinecap="round" />
    </g>)}
  </svg>;
  if (type === "inflatableDummy") return <svg viewBox="0 0 38 62" className="h-12 w-8 drop-shadow-sm" aria-hidden="true">
    <ellipse cx="19" cy="56" rx="15" ry="4" fill="#172033" stroke="#cbd5e1" strokeWidth="1" />
    <path d="M7 52L9 27C10 23 12 22 12 19V12C12 2 26 2 26 12V19C26 22 29 23 29 27L31 52C27 57 11 57 7 52Z" fill={color ?? "#ef4444"} stroke="#fee2e2" strokeWidth="1.3" />
    <path d="M13 31H25M12 44H26" fill="none" stroke="#fff" strokeWidth="1.6" opacity=".8" />
    <path d="M16 10C14 13 15 17 15 19" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity=".45" />
  </svg>;
  if (type === "plyoBox") return <svg viewBox="0 0 48 48" className="h-10 w-10 drop-shadow-sm" aria-hidden="true">
    <path d="M6 15L24 6L42 15V36L24 44L6 35Z" fill={color ?? "#d6a35c"} stroke="#fef3c7" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M6 15L24 23L42 15M24 23V44" fill="none" stroke="#fef3c7" strokeWidth="1.2" />
    <path d="M24 23L42 15V36L24 44Z" fill="#111827" opacity=".22" />
    <path d="M13 25L18 27M30 28L35 26" stroke="#422b17" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M11 14L24 10L36 15" fill="none" stroke="#fff" strokeWidth="1" opacity=".35" />
  </svg>;
  return null;
}
