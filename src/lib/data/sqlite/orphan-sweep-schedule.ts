/* One install-local housekeeping stamp. A failed file removal makes the next
   idle sweep due; an interrupted sweep leaves the stamp unchanged. */
const KEY = 'engender-orphan-sweep';
const RETRY_KEY = `${KEY}-retry`;
const HANDLED_KEY = `${KEY}-handled`;
const WEEK = 7 * 24 * 60 * 60 * 1000;
let requested = 0;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function store(): Store | null {
  try { return globalThis.localStorage; }
  catch { return null; }
}

export function shouldSweepOrphans(now = Date.now(), storage: Store | null = store()): boolean {
  try {
    const retry = storage?.getItem(RETRY_KEY);
    if (retry && retry !== storage?.getItem(HANDLED_KEY)) return true;
    const last = storage?.getItem(KEY);
    const completed = Number(last);
    return !last || !Number.isFinite(completed) || completed > now || now - completed >= WEEK;
  } catch { return true; }
}

export function markOrphanSweepDue(storage: Store | null = store()): void {
  requested++;
  try { storage?.setItem(RETRY_KEY, `${Date.now()}:${Math.random()}`); }
  catch { /* A later boot retries when storage works again. */ }
}

export function orphanSweepRequestVersion(storage: Store | null = store()) {
  let stamp: string | null = null;
  try { stamp = storage?.getItem(RETRY_KEY) ?? null; }
  catch { /* Completion will leave the sweep due. */ }
  return { local: requested, stamp };
}

export function markOrphanSweepComplete(
  now = Date.now(), storage: Store | null = store(),
  startedAt = orphanSweepRequestVersion(storage)
): void {
  if (requested !== startedAt.local) return;
  try {
    // Keep retry and completion in separate keys: another tab may request a
    // sweep between these writes, and its token must remain unhandled.
    if (startedAt.stamp) storage?.setItem(HANDLED_KEY, startedAt.stamp);
    storage?.setItem(KEY, String(now));
  }
  catch { /* A later boot may repeat the safe sweep. */ }
}
