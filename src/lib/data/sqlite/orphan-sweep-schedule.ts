/* One install-local housekeeping stamp. A failed file removal makes the next
   idle sweep due; an interrupted sweep leaves the stamp unchanged. */
const KEY = 'engender-orphan-sweep';
const WEEK = 7 * 24 * 60 * 60 * 1000;
let requested = 0;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function store(): Store | null {
  try { return globalThis.localStorage; }
  catch { return null; }
}

export function shouldSweepOrphans(now = Date.now(), storage: Store | null = store()): boolean {
  try {
    const last = storage?.getItem(KEY);
    const completed = Number(last);
    return !last || !Number.isFinite(completed) || completed > now || now - completed >= WEEK;
  } catch { return true; }
}

export function markOrphanSweepDue(storage: Store | null = store()): void {
  requested++;
  try { storage?.setItem(KEY, `retry:${Date.now()}:${Math.random()}`); }
  catch { /* A later boot retries when storage works again. */ }
}

export function orphanSweepRequestVersion(storage: Store | null = store()) {
  let stamp: string | null = null;
  try { stamp = storage?.getItem(KEY) ?? null; }
  catch { /* Completion will leave the sweep due. */ }
  return { local: requested, stamp };
}

export function markOrphanSweepComplete(
  now = Date.now(), storage: Store | null = store(),
  startedAt = orphanSweepRequestVersion(storage)
): void {
  if (requested !== startedAt.local) return;
  try {
    // ADR-0020 permits one open journal per origin. This comparison also
    // protects a retry marker changed while the async directory list ran.
    if ((storage?.getItem(KEY) ?? null) !== startedAt.stamp) return;
    storage?.setItem(KEY, String(now));
  }
  catch { /* A later boot may repeat the safe sweep. */ }
}
