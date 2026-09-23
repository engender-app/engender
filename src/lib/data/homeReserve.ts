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

export type ReserveSlot = 'above' | 'below' | 'pinned' | 'measurements-now';

/* Home's three slots kept the keys ticket 183 gave them. The measurements
   screen's "what is true now" block (the span and the size changes above
   its protocol notice) arrived at full height the same way, and holds its
   room the same way (ux-carpet ticket 193). */
const KEYS: Record<ReserveSlot, string> = {
  above: 'engender-home-reserve-above',
  below: 'engender-home-reserve-below',
  pinned: 'engender-home-reserve-pinned',
  'measurements-now': 'engender-measurements-reserve-now'
};

/* No Home block is taller than a few phone screens; anything past this is a
   bad write, and reserving it would be a worse jump than reserving nothing. */
const MAX_RESERVE_PX = 4000;

/* Exported for its own test, which holds it to the prefix reset clears. */
export function reserveKey(slot: ReserveSlot): string {
  return KEYS[slot];
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
