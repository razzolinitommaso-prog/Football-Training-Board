import { createHash } from "node:crypto";

type Row = Record<string, unknown>;
export type BackupReader = { query: (text: string, values?: unknown[]) => Promise<{ rows: Row[] }> };
type Table = { name: string; columns: string[] };
type Link = { child: string; parent: string; columns: string[]; targets: string[] };
const quote = (s: string) => '"' + s.replace(/"/g, '""') + '"';
const excluded = /^(sessions?|account_activations|society_group_managers|society_groups|platform_.*)$/;
const secret = /password|token|secret|access_code|parent_code/i;
export const canBackupClub = (role?: string | null) => ["admin", "presidente"].includes(role ?? "");

/** Consumed inside one REPEATABLE READ READ ONLY transaction. All seasons, no writes. */
export async function* clubBackup(reader: BackupReader, clubId: number) {
  if (!Number.isSafeInteger(clubId) || clubId <= 0) throw Error("Società non valida");
  const columns = await reader.query(`SELECT c.table_name,c.column_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name WHERE c.table_schema='public' AND t.table_type='BASE TABLE' ORDER BY c.table_name,c.ordinal_position`);
  const tables = new Map<string, Table>();
  for (const row of columns.rows) {
    const name = String(row.table_name);
    if (!tables.has(name)) tables.set(name, { name, columns: [] });
    tables.get(name)!.columns.push(String(row.column_name));
  }
  // node-postgres decodes text[]; catalog name[] (OID 1003) otherwise stays a string.
  const foreign = await reader.query(`SELECT c.relname AS child,p.relname AS parent,
    ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY v(n,o) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=v.n ORDER BY v.o) AS columns,
    ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY v(n,o) JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=v.n ORDER BY v.o) AS targets
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_class p ON p.oid=k.confrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE k.contype='f' AND n.nspname='public'`);
  const links = foreign.rows as unknown as Link[];
  const scoped = new Set([...tables.values()].filter(t => t.columns.includes("club_id") && !excluded.test(t.name)).map(t => t.name));
  // Only dependent records of scoped business tables; users/clubs must never pull in another club.
  function condition(name: string, alias: string, visited = new Set<string>()): string | null {
    const table = tables.get(name);
    if (!table || excluded.test(name) || visited.has(name)) return null;
    if (scoped.has(name)) return `${alias}.club_id=$1`;
    if (name === "clubs") return `${alias}.id=$1`;
    if (name === "users") {
      const paths = links.filter(l => l.parent === "users").flatMap(l => {
        const child = condition(l.child, "u", new Set(["users"]));
        return child ? [`EXISTS(SELECT 1 FROM public.${quote(l.child)} u WHERE ${l.columns.map((c,i)=>`u.${quote(c)}=${alias}.${quote(l.targets[i])}`).join(" AND ")} AND (${child}))`] : [];
      });
      return paths.length ? `(${paths.join(" OR ")})` : null;
    }
    const next = new Set(visited).add(name);
    const paths = links.filter(l => l.child === name && !["users", "clubs"].includes(l.parent)).flatMap(l => {
      const parentAlias = `p${next.size}`;
      const parent = condition(l.parent, parentAlias, next);
      return parent ? [`EXISTS(SELECT 1 FROM public.${quote(l.parent)} ${parentAlias} WHERE ${l.columns.map((c,i) => `${alias}.${quote(c)}=${parentAlias}.${quote(l.targets[i])}`).join(" AND ")} AND (${parent}))`] : [];
    });
    return paths.length ? `(${paths.join(" OR ")})` : null;
  }
  const selected = [...tables.keys()].filter(name => condition(name, "r"));
  yield JSON.stringify({ type: "header", format: "ftb-club-backup", version: 1, clubId, exportedAt: new Date().toISOString(), scope: "all-seasons", tables: selected,
    exclusions: [...tables.keys()].filter(name => !selected.includes(name)),
    credentialsIncluded: false, attachmentPolicy: "Contenuti salvati nel database inclusi senza trasformazioni; riferimenti esterni elencati nel manifesto, non scaricati." }) + "\n";
  const manifest: { table: string; rows: number; sha256: string; omittedColumns: string[] }[] = [];
  const external = new Set<string>();
  function scanReferences(value: unknown) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) external.add(value);
    else if (Array.isArray(value)) value.forEach(scanReferences);
    else if (value && typeof value === "object") Object.values(value).forEach(scanReferences);
  }
  for (const name of selected) {
    const table = tables.get(name)!;
    const visible = table.columns.filter(c => !secret.test(c));
    const omittedColumns = table.columns.filter(c => secret.test(c));
    const hash = createHash("sha256");
    let count = 0;
    // ctid is stable within the snapshot; it also orders tables without a primary key.
    for (let offset = 0; ; offset += 10) {
      const batch = await reader.query(`SELECT ${visible.map(c => `r.${quote(c)}`).join(",")} FROM public.${quote(name)} r WHERE ${condition(name,"r")} ORDER BY r.ctid LIMIT 10 OFFSET ${offset}`, [clubId]);
      if (!batch.rows.length) break;
      for (const row of batch.rows) {
        const encoded = JSON.stringify(row);
        hash.update(encoded + "\n");
        // Manifest contains locations only; no outbound fetch and no expiring URL substitution.
        scanReferences(row);
      }
      count += batch.rows.length;
      yield JSON.stringify({ type: "rows", table: name, rows: batch.rows }) + "\n";
    }
    manifest.push({ table: name, rows: count, sha256: hash.digest("hex"), omittedColumns });
  }
  yield JSON.stringify({ type: "manifest", tables: manifest, externalReferences: [...external], externalFilesIncluded: false, complete: true }) + "\n";
}
