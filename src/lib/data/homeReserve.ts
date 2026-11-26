/* How much room Home keeps for its read-gated blocks before they answer
   (phase 12 ux-carpet ticket 183).

   Home cannot know how tall its today tier, agenda, notices and tiles will
   be until nineteen-odd reads have answered, and drawing them the frame
   they do shoved everything under them 400 to 980px in one frame. So each
   slot remembers the height it last rested at, and the next visit holds a
   placeholder that tall until the reads agree. A wrong guess is a height
   `resize` travels (motion/reveal.ts), never a jump.

   Home's own three slots are kept per device in localStorage, under the
   `engender-` prefix reset.ts clears with the rest of the app's keys: Home
   can paint before the database has answered, and a height of Today's
   sections names nothing in the journal.

   Every other slot is a screen of its own - dilation, doses, hair
   progress, wear - and a key there said which of them this journal has
   been opened on, readable without unlocking it. Those heights are the
   device-local `layoutReserves` preference, inside the encrypted journal
   (security-scan ticket 08), reached through the store prefs/store.svelte.ts
   registers. The first unlock moves the old keys over and deletes them. */

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
   late blocks hold their room the same way (ux-carpet ticket 193): the
   clinician summary's scope row, the access-mode screen's mode list, the bodies
   that used to swap in from a page-level skeleton (ticket 205) or cut in
   with no placeholder at all (ticket 211), and the hosted-rows card a screen draws for the More hub
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
