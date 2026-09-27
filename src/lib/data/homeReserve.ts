/* How much room Home keeps for its read-gated blocks before they answer
   (phase 12 ux-carpet ticket 183).

   Home cannot know how tall its today tier, agenda, notices and tiles will
   be until nineteen-odd reads have answered, and drawing them the frame
   they do shoved everything under them 400 to 980px in one frame. So each
   slot remembers the height it last rested at, and the next visit holds a
   placeholder that tall until the reads agree. A wrong guess is a height
   `resize` travels (motion/reveal.ts), never a jump.

   Kept per device in localStorage, under the `engender-` prefix reset.ts
   clears with the rest of the app's keys. A height says nothing about what
   is in the journal beyond roughly how much of it is on Home today. */

export type ReserveSlot =
  | 'above'
  | 'below'
  | 'pinned'
  | 'measurements-now'
  | 'clinician-summary-row'
  | 'access-mode'
  | 'affirmations'
  | 'hair-progress'
  | 'care-changes'
  | 'wear'
  | 'doses'
  | 'curve'
  | 'cycle-events'
  | 'words-ignored'
  | 'tally'
  | 'tags'
  | 'dilation'
  | 'on-this-day'
  | 'body-regions'
  | 'journaling-pause'
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
   measurements screen's span and size changes, the clinician summary's
   scope row, the access-mode screen's mode list, the affirmation lists, the bodies
   that used to swap in from a page-level skeleton (ticket 205) or cut in
   with no placeholder at all (ticket 211), and the hosted-rows card a screen draws for the More hub
   (`hosted-<host>`). */
function keyFor(slot: ReserveSlot): string {
  return HOME_SLOTS.includes(slot) ? `engender-home-reserve-${slot}` : `engender-reserve-${slot}`;
}

/* No Home block is taller than a few phone screens; anything past this is a
   bad write, and reserving it would be a worse jump than reserving nothing. */
const MAX_RESERVE_PX = 4000;

/* Exported for its own test, which holds it to the prefix reset clears. */
export function reserveKey(slot: ReserveSlot): string {
  return keyFor(slot);
}

function resolveStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

/** The height `slot` last rested at, in whole pixels, or 0 for none. */
export function readReserve(slot: ReserveSlot, storage?: Storage): number {
  try {
    const raw = resolveStorage(storage)?.getItem(reserveKey(slot));
    const px = raw == null ? NaN : Number(raw);
    return Number.isFinite(px) && px > 0 && px <= MAX_RESERVE_PX ? Math.round(px) : 0;
  } catch {
    return 0;
  }
}

/** Records the height `slot` is resting at now, for the next visit. */
export function rememberReserve(slot: ReserveSlot, px: number, storage?: Storage): void {
  try {
    resolveStorage(storage)?.setItem(reserveKey(slot), String(Math.round(px)));
  } catch {
    /* Private browsing or a full quota: the next visit reserves nothing,
       which is what it did before this existed. */
  }
}
