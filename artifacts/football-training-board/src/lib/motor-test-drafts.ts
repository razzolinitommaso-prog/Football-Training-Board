import { motorTestSessionInput, type MotorTestSession } from "@workspace/api-zod";

type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
type Envelope = { version: 1; base: MotorTestSession; draft: MotorTestSession; dirty: boolean; updatedAt: number };
export type DraftStatus = { message: string; error: boolean; local: boolean; dirty: boolean; saving: boolean };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const equal = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (!object(a) || !object(b)) return false;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys.every(key => equal(a[key], b[key]));
};

/** Merge independent edits only. Conflicting measurements must never silently win. */
export function mergeMotorDraft(base: MotorTestSession, local: MotorTestSession, remote: MotorTestSession) {
  const conflicts: string[] = [];
  function merge(b: unknown, l: unknown, r: unknown, path: string): unknown {
    if (equal(l, r) || equal(b, r)) return l;
    if (equal(b, l)) return r;
    if (object(l) && object(r) && (b === undefined || object(b))) {
      return Object.fromEntries([...new Set([...Object.keys(l), ...Object.keys(r)])].flatMap(key => {
        const value = merge(object(b) ? b[key] : undefined, l[key], r[key], path ? path + "." + key : key);
        return value === undefined ? [] : [[key, value]];
      }));
    }
    conflicts.push(path);
    return l;
  }
  // These fields are assigned by the server, rather than entered by an operator.
  const metadata = { revision: remote.revision, stationId: remote.stationId, exerciseIds: remote.exerciseIds };
  const comparable = (s: MotorTestSession) => ({ ...s, revision: 0, stationId: undefined, exerciseIds: {} });
  const draft = { ...(merge(comparable(base), comparable(local), comparable(remote), "") as MotorTestSession), ...metadata };
  return { draft, conflicts };
}

export class MotorDraftStore {
  private entries = new Map<string, Envelope>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private running = new Map<string, Promise<void>>();
  private blocked = new Set<string>();
  private statuses = new Map<string, DraftStatus>();
  private stopped = false;
  readonly prefix: string;
  constructor(private options: {
    scope: string;
    storage: StoragePort;
    put: (session: MotorTestSession) => Promise<MotorTestSession>;
    latest: (id: string) => Promise<MotorTestSession | undefined>;
    allowed: (session: MotorTestSession) => boolean;
    changed: () => void;
    saved: (session: MotorTestSession) => void;
    delay?: number;
  }) { this.prefix = "ftb:motor-draft:v1:" + options.scope + ":"; }

  status(id: string): DraftStatus {
    return this.statuses.get(id) ?? { message: "Nessuna modifica da salvare.", error: false, local: true, dirty: false, saving: false };
  }
  private report(id: string, message: string, error = false, saving = false) {
    const prior = this.status(id);
    this.statuses.set(id, { message, error, saving, local: prior.local, dirty: this.entries.get(id)?.dirty ?? false });
    if (!this.stopped) this.options.changed();
  }
  private read(id: string): Envelope | undefined {
    if (this.entries.has(id)) return this.entries.get(id);
    try {
      const raw = this.options.storage.getItem(this.prefix + id);
      if (!raw) return;
      const value = JSON.parse(raw) as Envelope;
      if (value.version !== 1 || value.draft?.id !== id || value.base?.id !== id || !motorTestSessionInput.safeParse(value.base).success) return;
      // Incomplete inputs belong in a local draft too; validate their structure, not their completion.
      if (!object(value.draft.results) || !Array.isArray(value.draft.tests)) return;
      this.entries.set(id, value);
      return value;
    } catch { return; }
  }
  recoverable() {
    const ids = new Set(this.entries.keys());
    try {
      for (let i = 0; i < this.options.storage.length; i++) {
        const key = this.options.storage.key(i);
        if (key?.startsWith(this.prefix)) ids.add(key.slice(this.prefix.length));
      }
    } catch { /* The visible save status reports storage failures when an edit is made. */ }
    return [...ids].map(id => this.read(id)).filter((v): v is Envelope => !!v?.dirty).map(v => v.draft);
  }
  current(id: string) { return this.entries.get(id)?.draft; }
  private persist(entry: Envelope) {
    this.entries.set(entry.draft.id, entry);
    let local = true;
    try { this.options.storage.setItem(this.prefix + entry.draft.id, JSON.stringify(entry)); }
    catch { local = false; }
    this.statuses.set(entry.draft.id, { ...this.status(entry.draft.id), local, dirty: entry.dirty });
    return local;
  }
  open(server: MotorTestSession) {
    const prior = this.read(server.id);
    if (prior?.dirty) {
      if (this.running.has(server.id) || server.revision < prior.base.revision) return prior.draft;
      const merged = mergeMotorDraft(prior.base, prior.draft, server);
      if (merged.conflicts.length) {
        this.blocked.add(server.id);
        this.report(server.id, "Bozza recuperata. Esistono modifiche online sugli stessi campi: conserva l’export e verifica i dati prima di sincronizzare.", true);
      } else {
        this.persist({ ...prior, base: server, draft: merged.draft });
        this.report(server.id, "Bozza recuperata dal dispositivo. Sincronizzazione in corso…");
        this.schedule(server.id);
      }
      return this.entries.get(server.id)!.draft;
    }
    this.entries.set(server.id, { version: 1, base: server, draft: server, dirty: false, updatedAt: Date.now() });
    return server;
  }
  edit(draft: MotorTestSession) {
    const prior = this.entries.get(draft.id);
    const entry: Envelope = { version: 1, base: prior?.base ?? draft, draft, dirty: true, updatedAt: Date.now() };
    const local = this.persist(entry); // Synchronous: runs before React renders or a card closes.
    if (this.blocked.has(draft.id)) this.report(draft.id, "Conflitto con modifiche online. La bozza resta sul dispositivo: esportala prima di riconciliare i dati.", true);
    else this.report(draft.id, local ? "Salvato sul dispositivo · in attesa di sincronizzazione." : "Copia sul dispositivo non riuscita. Mantieni aperta la scheda fino al salvataggio online.", !local);
    this.schedule(draft.id);
  }
  private schedule(id: string, delay = this.options.delay ?? 900) {
    clearTimeout(this.timers.get(id));
    if (this.stopped || this.blocked.has(id)) return;
    this.timers.set(id, setTimeout(() => { this.timers.delete(id); void this.flush(id); }, delay));
  }
  async flush(id: string, force = false): Promise<void> {
    clearTimeout(this.timers.get(id)); this.timers.delete(id);
    if (this.running.has(id)) return this.running.get(id);
    if (this.stopped || this.blocked.has(id)) return;
    const entry = this.entries.get(id);
    if (!entry?.dirty || !this.options.allowed(entry.draft)) return;
    if (!force && entry.draft.revision === 0 && !Object.keys(entry.draft.results).length) return;
    const validation = motorTestSessionInput.safeParse(entry.draft);
    if (!validation.success) {
      const issue = validation.error.issues[0];
      this.report(id, `Bozza sul dispositivo · completa o correggi ${issue.path.join(" / ")}: ${issue.message}`, true);
      return;
    }
    const sent = structuredClone(entry.draft);
    this.report(id, "Salvataggio online…", false, true);
    const operation = (async () => {
      try {
        const saved = await this.options.put(sent);
        const current = this.entries.get(id)!;
        const merged = mergeMotorDraft(sent, current.draft, saved);
        if (merged.conflicts.length) throw new Error("La risposta online differisce dalle modifiche in corso. La bozza locale è conservata.");
        const local = this.persist({ ...current, base: saved, draft: merged.draft, dirty: !equal(merged.draft, saved) });
        const dirty = this.entries.get(id)!.dirty;
        this.report(id, dirty
          ? local ? "Salvato sul dispositivo · altre modifiche da sincronizzare." : "Altre modifiche in attesa, senza copia locale. Mantieni aperta la scheda."
          : local ? "Salvato online e sul dispositivo." : "Salvato online. Copia sul dispositivo non disponibile.", dirty && !local);
        this.options.saved(saved);
      } catch (error) {
        if ((error as { status?: number })?.status === 409) {
          try {
            const remote = await this.options.latest(id);
            const current = this.entries.get(id)!;
            const merged = remote && mergeMotorDraft(current.base, current.draft, remote);
            if (remote && remote.revision > sent.revision && merged && !merged.conflicts.length) {
              this.persist({ ...current, base: remote, draft: merged.draft, dirty: !equal(merged.draft, remote) });
              this.report(id, "Modifiche indipendenti riunite. Sincronizzazione in corso…");
              return;
            }
          } catch { /* Preserve the original draft if the reconciliation request fails. */ }
          this.blocked.add(id);
          this.report(id, "Sincronizzazione fermata. " + (error instanceof Error ? error.message + " " : "") + "Possibile conflitto o vincolo della sessione. Bozza conservata: esporta i dati e verifica prima di riprovare.", true);
        } else this.report(id, "Salvataggio online non riuscito. " + (this.status(id).local ? "Bozza conservata sul dispositivo. " : "Mantieni aperta la scheda. ") + (error instanceof Error ? error.message : "Riprova quando sei connesso."), true);
      } finally {
        this.running.delete(id);
        if (!this.stopped && this.entries.get(id)?.dirty && !this.status(id).error) this.schedule(id, 0);
      }
    })();
    this.running.set(id, operation);
    return operation;
  }
  retry(reconcile = false) { if (reconcile) this.blocked.clear(); for (const id of this.entries.keys()) { if (!this.blocked.has(id)) void this.flush(id); } }
  flushAll() { for (const id of this.entries.keys()) void this.flush(id); }
  unsafe() { return [...this.entries].some(([id, e]) => e.dirty && !this.status(id).local); }
  start() { this.stopped = false; }
  stop() { this.stopped = true; this.timers.forEach(clearTimeout); this.timers.clear(); }
}
