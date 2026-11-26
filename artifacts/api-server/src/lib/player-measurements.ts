import { db, playersTable } from "@workspace/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
let ready: Promise<void> | undefined;
export function ensurePlayerMeasurementStorage() {
  ready ??= db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ftb-player-measurements-decimals'))`);
    const columns = await tx.execute<{ column_name: string; data_type: string }>(sql`SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'players' AND column_name IN ('height','weight')`);
    for (const column of columns.rows) {
      if (column.data_type !== "double precision") {
        if (column.column_name === "height") await tx.execute(sql`ALTER TABLE players ALTER COLUMN height TYPE double precision USING height::double precision`);
        if (column.column_name === "weight") await tx.execute(sql`ALTER TABLE players ALTER COLUMN weight TYPE double precision USING weight::double precision`);
      }
    }
  }).catch(error => { ready = undefined; throw error; });
  return ready;
}

const backfills = new Map<number, Promise<void>>();
/** Upgrade already recorded tests too; one idempotent reconciliation per club/process. */
export function reconcileExistingPlayerMeasurements(clubId: number) {
  let task = backfills.get(clubId);
  if (!task) {
    task = db.transaction(async tx => {
      const found = await tx.execute<{ id: number }>(sql`SELECT id FROM players p WHERE p.club_id=${clubId} AND (
        EXISTS (SELECT 1 FROM motor_test_sessions m WHERE m.club_id=p.club_id AND (m.data->'results') ? p.id::text) OR
        EXISTS (SELECT 1 FROM player_fitness_data f WHERE f.club_id=p.club_id AND f.player_id=p.id AND (f.height_cm IS NOT NULL OR f.weight_kg IS NOT NULL)))`);
      await refreshPlayerMeasurements(tx, clubId, found.rows.map(row => row.id));
    }).catch(error => { backfills.delete(clubId); throw error; });
    backfills.set(clubId, task);
  }
  return task;
}

/** The chronological latest observation, not the numerically greatest height/weight, is current. */
export async function refreshPlayerMeasurements(tx: Tx, clubId: number, ids: number[]) {
  if (!ids.length) return;
  const players = await tx.select().from(playersTable).where(and(eq(playersTable.clubId, clubId), inArray(playersTable.id, ids)))
    .orderBy(asc(playersTable.id)).for("update");
  for (const player of players) {
    const key = String(player.id);
    const observations = await tx.execute<{ date: string; height_date: string; weight_date: string; height: number | null; weight: number | null }>(sql`
      SELECT date, height_date, weight_date, height, weight FROM (
        SELECT day->>'date' AS date,
          coalesce(day->'results'->${key}::text->>'heightDate',day->>'date') AS height_date,
          coalesce(day->'results'->${key}::text->>'weightDate',day->>'date') AS weight_date,
          CASE WHEN jsonb_typeof(day->'results'->${key}::text->'height')='number' THEN (day->'results'->${key}::text->>'height')::double precision END AS height,
          CASE WHEN jsonb_typeof(day->'results'->${key}::text->'weight')='number' THEN (day->'results'->${key}::text->>'weight')::double precision END AS weight,
          0 AS origin, created_at, id::text AS stable_id, ordinal
        FROM motor_test_sessions, LATERAL jsonb_array_elements(jsonb_build_array(jsonb_build_object('date',test_date::text,'results',data->'results')) || coalesce(data->'days','[]'::jsonb)) WITH ORDINALITY AS days(day,ordinal)
        WHERE club_id=${clubId} AND (day->'results') ? ${key}
        UNION ALL
        SELECT date::text, date::text, date::text, height_cm::double precision, weight_kg::double precision, 1, created_at, id::text, 0
        FROM player_fitness_data WHERE club_id=${clubId} AND player_id=${player.id}
      ) m ORDER BY date DESC, origin, created_at DESC, stable_id DESC, ordinal DESC
    `);
    const valid = (n: number | null | undefined) => typeof n === "number" && Number.isFinite(n) && n > 0;
    const history = player.profileHistory;
    const original = history?.entry ?? { source: "legacy" as const, date: null, position: player.position, jerseyNumber: player.jerseyNumber, height: player.height, weight: player.weight };
    const oldest = [...observations.rows].reverse();
    const entry = { ...original,
      height: valid(original.height) ? original.height : oldest.find(row => valid(row.height))?.height ?? null,
      weight: valid(original.weight) ? original.weight : oldest.find(row => valid(row.weight))?.weight ?? null };
    const height = [...observations.rows].sort((a,b)=>b.height_date.localeCompare(a.height_date)).find(row => valid(row.height))?.height ?? entry.height;
    const weight = [...observations.rows].sort((a,b)=>b.weight_date.localeCompare(a.weight_date)).find(row => valid(row.weight))?.weight ?? entry.weight;
    await tx.update(playersTable).set({ height, weight, profileHistory: { ...history, entry, changes: history?.changes ?? [] } })
      .where(and(eq(playersTable.id, player.id), eq(playersTable.clubId, clubId)));
  }
}
