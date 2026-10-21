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
  try { storage?.setItem(KEY, 'retry'); }
  catch { /* A later boot retries when storage works again. */ }
}

export function orphanSweepRequestVersion(): number {
  return requested;
}

export function markOrphanSweepComplete(
  now = Date.now(), storage: Store | null = store(), startedAt = requested
): void {
  if (requested !== startedAt) return;
  try { storage?.setItem(KEY, String(now)); }
  catch { /* A later boot may repeat the safe sweep. */ }
}
