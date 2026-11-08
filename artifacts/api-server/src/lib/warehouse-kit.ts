import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

let schemaReady: Promise<unknown> | undefined;

export function ensureWarehouseKitSchema() {
  schemaReady ??= db.execute(sql`
    SELECT pg_advisory_xact_lock(73319821);
    ALTER TABLE warehouse_items ADD COLUMN IF NOT EXISTS kit_slots JSONB;
    CREATE TABLE IF NOT EXISTS warehouse_kit_requests (
      id SERIAL PRIMARY KEY,
      club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES warehouse_items(id) DEFERRABLE INITIALLY DEFERRED,
      row_key TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      status TEXT NOT NULL CHECK (status IN ('pending', 'reserved', 'ordered', 'arrived', 'delivered')),
      archived_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS warehouse_kit_requests_club_player_idx
      ON warehouse_kit_requests (club_id, player_id, row_key);
    CREATE OR REPLACE FUNCTION release_warehouse_kit_reserve() RETURNS trigger AS $kit$
    BEGIN
      IF OLD.status IN ('reserved', 'arrived') THEN
        UPDATE warehouse_items SET quantity_reserved = GREATEST(0, quantity_reserved - OLD.quantity), updated_at = now()
        WHERE id = OLD.item_id AND club_id = OLD.club_id;
      END IF;
      RETURN OLD;
    END;
    $kit$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS release_warehouse_kit_reserve ON warehouse_kit_requests;
    CREATE TRIGGER release_warehouse_kit_reserve BEFORE DELETE ON warehouse_kit_requests
      FOR EACH ROW EXECUTE FUNCTION release_warehouse_kit_reserve();
  `).catch((error) => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}

const ordinarySlots = [
  "training_socks", "training_shorts", "training_shirt", "k_way", "winter_tracksuit",
  "winter_pants", "winter_pinocchietto", "winter_sweatshirt", "match_shorts",
  "match_socks", "match_shirt", "rep_tracksuit", "rep_polo", "rep_jacket",
];
const setKey = "rep_pants_sweatshirt";
const slots = new Set([...ordinarySlots, setKey + ":pants", setKey + ":sweatshirt"]);

export function cleanKitSlots(value: unknown): string[] | null {
  if (value === null) return null;
  if (!Array.isArray(value) || value.some((key) => typeof key !== "string" || !slots.has(key))) {
    throw new KitRequestError(400, "Voci kit non valide");
  }
  return [...new Set(value)] as string[];
}

type KitSelection = {
  key: string;
  label?: string;
  listItemId?: string;
  componentItemIds?: string[];
  quantity?: string;
  price?: string;
  ordered?: boolean;
  arrived?: boolean;
};

function readKit(raw: unknown): KitSelection[] {
  try {
    const data = JSON.parse(typeof raw === "string" ? raw : "null");
    const rows: unknown = Array.isArray(data) ? data : data?.kitRows;
    return Array.isArray(rows) ? rows.filter((row) => row && typeof row.key === "string") : [];
  } catch {
    return [];
  }
}

function itemIds(row?: KitSelection): number[] {
  const ids = Array.isArray(row?.componentItemIds) && row.componentItemIds.some(Boolean)
    ? row.componentItemIds.filter(Boolean)
    : [row?.listItemId].filter(Boolean);
  return ids.map(Number);
}

function quantityOf(row: KitSelection): number {
  return Math.max(1, Math.floor(Number(row.quantity) || 1));
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class KitRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function lockKitPlayer(tx: Tx, clubId: number, playerId: number) {
  const found = await tx.execute(sql`SELECT id FROM players WHERE club_id = ${clubId} AND id = ${playerId} FOR UPDATE`);
  if (!found.rows.length) throw new KitRequestError(404, "Giocatore non trovato");
}

export async function validateKitLinks(tx: Tx, clubId: number, playerId: number, before: unknown, after: unknown) {
  const previous = readKit(before);
  const next = readKit(after);
  const requests = await tx.execute<{ rowKey: string; open: boolean }>(sql`
    SELECT row_key AS "rowKey", bool_or(status <> 'delivered') AS open FROM warehouse_kit_requests
    WHERE club_id = ${clubId} AND player_id = ${playerId} AND archived_at IS NULL GROUP BY row_key
  `);
  for (const { rowKey: key, open } of requests.rows) {
    const old = previous.find((row) => row.key === key);
    const current = next.find((row) => row.key === key);
    if (!old || !current || quantityOf(old) !== quantityOf(current) || itemIds(old).join() !== itemIds(current).join()) {
      if (open) throw new KitRequestError(409, "Per cambiare articolo o quantità, gestisci prima la richiesta a Magazzino");
      await tx.execute(sql`
        UPDATE warehouse_kit_requests SET archived_at = now()
        WHERE club_id = ${clubId} AND player_id = ${playerId} AND row_key = ${key} AND archived_at IS NULL
      `);
    }
  }
  for (const row of next) {
    const oldIds = itemIds(previous.find((entry) => entry.key === row.key));
    for (const id of itemIds(row).filter((id) => !oldIds.includes(id))) {
      if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) throw new KitRequestError(400, "Variante kit non valida");
      const result = await tx.execute(sql`SELECT id FROM warehouse_items
        WHERE club_id = ${clubId} AND id = ${id} AND section = 'apparel' AND is_active <> 0 AND price IS NOT NULL`);
      if (!result.rows.length) throw new KitRequestError(400, "Variante kit non disponibile nel listino della società");
    }
  }
}

export async function listKitRequests(clubId: number, playerId?: number, scopedPlayerIds?: number[] | null) {
  await ensureWarehouseKitSchema();
  if (scopedPlayerIds?.length === 0) return [];
  const scope = scopedPlayerIds ? sql` AND r.player_id IN (${sql.join(scopedPlayerIds.map((id) => sql`${id}`), sql`, `)})` : sql.empty();
  const playerFilter = playerId ? sql` AND r.player_id = ${playerId}` : sql.empty();
  const result = await db.execute(sql`
    SELECT r.id, r.player_id AS "playerId", r.item_id AS "itemId", r.row_key AS "rowKey", r.quantity, r.status,
      w.name AS "itemName", w.size, w.code, w.notes AS "variantNotes", r.archived_at IS NOT NULL AS archived,
      concat_ws(' ', p.last_name, p.first_name) AS "playerName"
    FROM warehouse_kit_requests r
    JOIN warehouse_items w ON w.id = r.item_id AND w.club_id = r.club_id
    JOIN players p ON p.id = r.player_id AND p.club_id = r.club_id
    WHERE r.club_id = ${clubId}${scope}${playerFilter} ORDER BY r.id DESC
  `);
  return result.rows;
}

export async function requestKitRow(clubId: number, playerId: number, rowKey: string, expectedIds: unknown, expectedQuantity: unknown) {
  await ensureWarehouseKitSchema();
  await db.transaction(async (tx) => {
    await lockKitPlayer(tx, clubId, playerId);
    const assignment = await tx.execute<{ trainingKit: string }>(sql`
      SELECT training_kit AS "trainingKit" FROM equipment_assignments
      WHERE club_id = ${clubId} AND player_id = ${playerId} ORDER BY id LIMIT 1
    `);
    const row = readKit(assignment.rows[0]?.trainingKit).find((entry) => entry.key === rowKey);
    if (!row) throw new KitRequestError(404, "Salva prima la voce del kit");
    const selectedIds = itemIds(row);
    const ids = [...selectedIds].sort((a, b) => a - b);
    const quantity = quantityOf(row);
    if (!Array.isArray(expectedIds) || expectedIds.length !== selectedIds.length ||
        expectedIds.some((id, index) => Number(id) !== selectedIds[index]) || expectedQuantity !== quantity) {
      throw new KitRequestError(409, "Il kit è cambiato. Ricarica prima di registrare la richiesta");
    }
    if (ids.length !== (rowKey === setKey ? 2 : 1) || new Set(ids).size !== ids.length ||
        ids.some((id) => !Number.isInteger(id) || id < 1 || id > 2147483647) ||
        !Number.isSafeInteger(quantity) || quantity > 1000) {
      throw new KitRequestError(400, "Collega tutte le varianti e controlla la quantità");
    }
    if (rowKey !== setKey && !ordinarySlots.includes(rowKey)) throw new KitRequestError(400, "Voce kit non valida");
    const existing = await tx.execute(sql`
      SELECT id FROM warehouse_kit_requests WHERE club_id = ${clubId} AND player_id = ${playerId} AND row_key = ${rowKey} AND archived_at IS NULL LIMIT 1
    `);
    if (existing.rows.length) return;
    for (const id of ids) {
      const { rows: [item] } = await tx.execute<{ available: number; reserved: number }>(sql`
        SELECT quantity_available AS available, quantity_reserved AS reserved FROM warehouse_items
        WHERE club_id = ${clubId} AND id = ${id} AND section = 'apparel' AND is_active <> 0 AND price IS NOT NULL FOR UPDATE
      `);
      if (!item) throw new KitRequestError(400, "Variante kit non disponibile nel listino della società");
      const reserved = Math.min(quantity, Math.max(0, item.available - item.reserved));
      if (reserved) await tx.execute(sql`
        UPDATE warehouse_items SET quantity_reserved = quantity_reserved + ${reserved}, updated_at = now()
        WHERE club_id = ${clubId} AND id = ${id}
      `);
      for (const line of [{ status: "reserved", quantity: reserved }, { status: "pending", quantity: quantity - reserved }]) {
        if (line.quantity) await tx.execute(sql`
          INSERT INTO warehouse_kit_requests (club_id, player_id, row_key, item_id, quantity, status)
          VALUES (${clubId}, ${playerId}, ${rowKey}, ${id}, ${line.quantity}, ${line.status})
        `);
      }
    }
  });
}

const fromStatus: Record<string, string[]> = {
  ordered: ["pending"], arrived: ["ordered"], delivered: ["reserved", "arrived"], canceled: ["pending", "reserved"],
};

export async function advanceKitRequest(clubId: number, id: number, next: string, scopedPlayerIds?: number[] | null) {
  await ensureWarehouseKitSchema();
  if (!Object.hasOwn(fromStatus, next)) throw new KitRequestError(400, "Stato richiesta non valido");
  await db.transaction(async (tx) => {
    const { rows: [owner] } = await tx.execute<{ player_id: number }>(sql`
      SELECT player_id FROM warehouse_kit_requests WHERE club_id = ${clubId} AND id = ${id}
    `);
    if (!owner || (scopedPlayerIds && !scopedPlayerIds.includes(owner.player_id))) throw new KitRequestError(404, "Richiesta non trovata");
    await lockKitPlayer(tx, clubId, owner.player_id);
    const { rows: [line] } = await tx.execute<{ item_id: number; status: string; quantity: number }>(sql`
      SELECT item_id, status, quantity FROM warehouse_kit_requests WHERE club_id = ${clubId} AND id = ${id} FOR UPDATE
    `);
    if (!line) throw new KitRequestError(404, "Richiesta non trovata");
    if (line.status === next) return;
    if (!fromStatus[next].includes(line.status)) throw new KitRequestError(409, "La richiesta è già stata aggiornata");
    const stockDelta = next === "arrived" ? line.quantity : next === "delivered" ? -line.quantity : 0;
    if (stockDelta) {
      const updated = await tx.execute(sql`
        UPDATE warehouse_items SET quantity_available = quantity_available + ${stockDelta},
          quantity_reserved = quantity_reserved + ${stockDelta}, updated_at = now()
        WHERE club_id = ${clubId} AND id = ${line.item_id}
          AND quantity_available + ${stockDelta} >= 0 AND quantity_reserved + ${stockDelta} >= 0
        RETURNING id
      `);
      if (!updated.rows.length) throw new KitRequestError(409, "Controlla la giacenza prima di aggiornare la richiesta");
    }
    if (next === "canceled") {
      await tx.execute(sql`DELETE FROM warehouse_kit_requests WHERE club_id = ${clubId} AND id = ${id}`);
    } else {
      await tx.execute(sql`UPDATE warehouse_kit_requests SET status = ${next} WHERE club_id = ${clubId} AND id = ${id}`);
    }
  });
}

export async function parentKitRows(clubId: number, playerId: number, raw: unknown) {
  const configured = readKit(raw).filter((row) => itemIds(row).length || row.price || row.ordered || row.arrived);
  if (configured.length === 0) return [];
  const requests = (await listKitRequests(clubId, playerId)).filter((line) => !line.archived);
  return configured.map((row) => {
    const lines = requests.filter((line) => line.rowKey === row.key);
    const status = lines.some((line) => line.status === "pending") ? "pending"
      : lines.some((line) => line.status === "ordered") ? "ordered"
      : lines.some((line) => line.status === "reserved") ? "reserved"
      : lines.some((line) => line.status === "arrived") ? "arrived"
      : lines.length > 0 ? "delivered"
      : row.arrived ? "arrived" : "preparing";
    return { key: row.key, label: row.label ?? "Articolo kit", quantity: quantityOf(row), status, arrived: status === "arrived" || status === "delivered" };
  });
}
