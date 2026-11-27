/* Hold each slot's last settled height while its reads load. Animate
   corrections with resize (motion/reveal.ts). Home's three heights
   can safely live in resettable engender- localStorage keys for first
   paint. Feature-specific heights reveal journal usage, so keep them
   in the encrypted device-local layoutReserves preference. First
   unlock migrates and removes the legacy keys. */

export type ReserveSlot =
  | 'above'
  | 'below'
  | 'pinned'
  | 'clinician-summary-row'
  | 'access-mode'
  | 'care-changes'
  | 'wear'
  | 'doses'
  | 'cycle-events'
  | 'words-ignored'
  | 'tags'
  | 'dilation'
  | 'on-this-day'
  | 'body-regions'
  | 'custom-scales'
  | 'recovery-key'
  | 'reminders'
  | 'reminders-check-in'
  | 'reminders-permission'
  | 'roadmap'
  | 'body-map'
  | 'appointments-visits'
  | 'lookback-facts'
  | `hosted-${string}`;

const HOME_SLOTS: readonly string[] = ['above', 'below', 'pinned'];

/* Home's three slots keep the keys ticket 183 gave them. Other screens'
   late blocks hold their room the same way: the
   clinician summary's scope row, the access-mode screen's mode list, the bodies
   that used to swap in from a page-level skeleton or cut in
   with no placeholder at all, and the hosted-rows card a screen draws for the More hub
   (`hosted-<host>`). */
/* Exported for its own test, which holds it to the prefix reset clears. */
export function reserveKey(slot: ReserveSlot): string {
  return HOME_SLOTS.includes(slot) ? `engender-home-reserve-${slot}` : `engender-reserve-${slot}`;
}

/** Where the encrypted heights are held. */
export interface ReserveStore {
  read(): Record<string, number>;
  write(next: Record<string, number>): void;
}

let held: ReserveStore | null = null;

/** Called once by the preference store, which holds the heights. */
export function useReserveStore(store: ReserveStore): void {
  held = store;
}

/* No Home block is taller than a few phone screens; anything past this is a
   bad write, and reserving it would be a worse jump than reserving nothing. */
const MAX_RESERVE_PX = 4000;

function resolveStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

const usable = (px: number) => (Number.isFinite(px) && px > 0 && px <= MAX_RESERVE_PX ? Math.round(px) : 0);

/** The height `slot` last rested at, in whole pixels, or 0 for none. */
export function readReserve(slot: ReserveSlot, storage?: Storage, store: ReserveStore | null = held): number {
  try {
    if (!HOME_SLOTS.includes(slot)) return usable(store?.read()[slot] ?? NaN);
    const raw = resolveStorage(storage)?.getItem(reserveKey(slot));
    return usable(raw == null ? NaN : Number(raw));
  } catch {
    return 0;
  }
}

/** Records the height `slot` is resting at now, for the next visit. */
export function rememberReserve(slot: ReserveSlot, px: number, storage?: Storage, store: ReserveStore | null = held): void {
  try {
    if (!HOME_SLOTS.includes(slot)) {
      const height = usable(px);
      if (!store || height === 0) return;
      const current = store.read();
      if (current[slot] === height) return;
      store.write({ ...current, [slot]: height });
      return;
    }
    resolveStorage(storage)?.setItem(reserveKey(slot), String(Math.round(px)));
  } catch {
    /* Private browsing or a full quota: the next visit reserves nothing,
       which is what it did before this existed. */
  }
}

const LEGACY_PREFIX = 'engender-reserve-';

/** First unlock after the upgrade: the screen heights older builds kept in
    plaintext move into `current` and their keys are named for deletion.
    Values already held win. Home's three keys stay where they are. */
export function foldLegacyReserves(
  storage: Pick<Storage, 'getItem' | 'key' | 'length'>,
  current: Record<string, number>
): { next: Record<string, number>; keys: string[] } {
  const keys: string[] = [];
  const next = { ...current };
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key === null || !key.startsWith(LEGACY_PREFIX)) continue;
    keys.push(key);
    const slot = key.slice(LEGACY_PREFIX.length);
    const px = usable(Number(storage.getItem(key)));
    if (px > 0 && !(slot in next)) next[slot] = px;
  }
  return { next, keys };
}
