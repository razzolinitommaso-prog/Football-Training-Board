export const PLAYER_KIT_ROWS = [
  { key: "training_socks", label: "Calzettone allenamento", area: "training" },
  { key: "training_shorts", label: "Pantaloncino allenamento", area: "training" },
  { key: "training_shirt", label: "Maglia allenamento", area: "training" },
  { key: "k_way", label: "K-Way", area: "training" },
  { key: "winter_tracksuit", label: "Tuta invernale allenamento", area: "training" },
  { key: "winter_pants", label: "Pantalone lungo allenamento", area: "training" },
  { key: "winter_pinocchietto", label: "Pinocchietto invernale", area: "training" },
  { key: "winter_sweatshirt", label: "Felpa allenamento", area: "training" },
  { key: "match_shorts", label: "Pantaloncino gara", area: "match" },
  { key: "match_socks", label: "Calzettone gara", area: "match" },
  { key: "match_shirt", label: "Maglia gara", area: "match" },
  { key: "rep_tracksuit", label: "Tuta completa rappresentanza", area: "representation" },
  { key: "rep_pants_sweatshirt", label: "Pantalone + felpa rappresentanza", area: "representation" },
  { key: "rep_polo", label: "Polo di rappresentanza", area: "representation" },
  { key: "rep_jacket", label: "Giubbotto rappresentanza", area: "representation" },
] as const;

export const REPRESENTATION_SET = "rep_pants_sweatshirt";
export const REPRESENTATION_COMPONENTS = [
  { key: `${REPRESENTATION_SET}:pants`, label: "Pantalone" },
  { key: `${REPRESENTATION_SET}:sweatshirt`, label: "Felpa" },
] as const;

export const PLAYER_KIT_SLOTS = [
  ...PLAYER_KIT_ROWS.filter((row) => row.key !== REPRESENTATION_SET),
  ...REPRESENTATION_COMPONENTS.map((component) => ({
    key: component.key, label: `Rappresentanza · ${component.label} (kit composto)`,
  })),
];

export type KitCatalogItem = {
  id: number;
  code?: string | null;
  name: string;
  category?: string | null;
  size?: string | null;
  notes?: string | null;
  supplier?: string | null;
  kitSlots?: string[] | null;
};

function normalize(value?: string | null): string {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Suggestions for catalogs created before explicit links were available.
export function suggestKitSlots(item: KitCatalogItem): string[] {
  const name = normalize(item.name);
  const description = `${name} ${normalize(item.category)}`;
  if (description.includes("rappresentanza")) {
    if (/^pantalone\b/.test(name)) return [REPRESENTATION_COMPONENTS[0].key];
    if (/^felpa\b/.test(name)) return [REPRESENTATION_COMPONENTS[1].key];
    if (/^tuta\b/.test(name)) return ["rep_tracksuit"];
    if (/^polo\b/.test(name)) return ["rep_polo"];
    if (/^giubbotto\b/.test(name)) return ["rep_jacket"];
  }
  if (/\bgara\b/.test(description)) {
    if (/^pantaloncin[oi]\b/.test(name)) return ["match_shorts"];
    if (/^calzetton[ei]\b/.test(name)) return ["match_socks"];
    if (/^magli(a|etta)\b/.test(name)) return ["match_shirt"];
  }
  if (/\ballenamento\b/.test(description)) {
    if (/^pantaloncin[oi]\b/.test(name)) return ["training_shorts"];
    if (/^calzetton[ei]\b/.test(name)) return ["training_socks"];
    if (/^magli(a|etta)\b/.test(name)) return ["training_shirt"];
    if (/^k\s?way\b/.test(name)) return ["k_way"];
    if (/^tuta\b/.test(name)) return ["winter_tracksuit"];
    if (/^pantalone\b/.test(name)) return ["winter_pants"];
    if (/^pinocchietto\b/.test(name)) return ["winter_pinocchietto"];
    if (/^felpa\b/.test(name)) return ["winter_sweatshirt"];
  }
  return [];
}

export function describeKitVariant(item: KitCatalogItem): string {
  const identity = item.code ? `${item.code} · #${item.id}` : `#${item.id}`;
  return [item.name, item.category !== item.name ? item.category : "", item.size, item.notes, identity]
    .filter(Boolean).join(" · ");
}

export const KIT_REQUEST_STATUS: Record<string, string> = {
  reserved: "Riservato",
  pending: "Da ordinare",
  ordered: "Ordinato",
  arrived: "Arrivato",
  delivered: "Consegnato",
};

export type KitRow = {
  key: string;
  label: string;
  area: "training" | "match" | "representation";
  price: string;
  assignment?: "manual" | "loan";
  quantity: string;
  ordered: boolean;
  arrived: boolean;
  listItemId?: string;
  componentItemIds?: string[];
};

export type KitRequestLine = {
  id: number;
  playerId: number;
  playerName: string;
  itemId: number;
  itemName: string;
  rowKey: string;
  quantity: number;
  status: "pending" | "reserved" | "ordered" | "arrived" | "delivered";
  size?: string;
  code?: string;
  variantNotes?: string;
  archived?: boolean;
};

export function kitRowItemIds(row: Pick<KitRow, "listItemId" | "componentItemIds">): string[] {
  return row.componentItemIds?.some(Boolean)
    ? row.componentItemIds.filter(Boolean)
    : row.listItemId ? [row.listItemId] : [];
}

export function savedKitSelections(raw?: string | null): Partial<KitRow>[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    const rows: unknown = Array.isArray(data) ? data : data?.kitRows;
    return Array.isArray(rows) ? rows.filter((row) => row && typeof row.key === "string") : [];
  } catch {
    return [];
  }
}

export function kitRowHasContent(row: Partial<KitRow>): boolean {
  return Boolean(row.assignment === "loan" || kitRowItemIds(row).length || row.arrived ||
    Number(String(row.price ?? "").trim().replace(",", ".")) > 0);
}

export function kitRowNeedsLink(row: Partial<KitRow>, activeIds?: ReadonlySet<string>): boolean {
  const ids = kitRowItemIds(row).map(String);
  const count = activeIds ? ids.filter((id) => activeIds.has(id)).length : ids.length;
  return kitRowHasContent(row) && count < (row.key === REPRESENTATION_SET ? 2 : 1);
}
