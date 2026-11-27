/* What the person has already been told, held in one encrypted preference.

   Four small facts used to sit in plaintext localStorage, where anyone with
   the phone's file system could read which features a journal uses without
   unlocking it: which Home tiles were snoozed, which letters were opened,
   which letters' arrival had been met, and whether the journal held any
   entries. They live in the `acknowledgements` preference now, which is encrypted with the rest of the journal, travels
   in a backup, and is read and written through the same reactive object as
   every other preference.

   Rune-free on purpose, like portableShape.ts: the rules live here so a node
   test can drive them, and the store that holds the value is a thin adapter
   (prefs/acknowledgementStore.svelte.ts). Every function returns a new value
   rather than editing the one it was given, because the catalogue's default
   is a shared object and a restored archive's value is somebody else's. */

export interface Acknowledgements {
  /** Tile key to the epoch millisecond its snooze ends. The ready letter's
      tile is `ready-letter`, like every other. */
  snoozes: Record<string, number>;
  /** Letters whose text has been shown, by the letter's own UUID. */
  readLetterIds: string[];
  /** Letters whose arrival has been met. A different fact from read: a
      letter can be met and left closed (letterStatus.ts). */
  greetedLetterIds: string[];
  /** The last answer to "does the journal hold an entry", for the first
      frame of Home and the calendar before the count has answered. Null
      until something has counted. */
  hasEntries: boolean | null;
}

export const NO_ACKNOWLEDGEMENTS: Acknowledgements = Object.freeze({
  snoozes: Object.freeze({}) as Record<string, number>,
  readLetterIds: Object.freeze([]) as unknown as string[],
  greetedLetterIds: Object.freeze([]) as unknown as string[],
  hasEntries: null
});

/** Where the value lives. `read` is reactive where the store is. */
export interface AcknowledgementStore {
  read(): Acknowledgements;
  write(next: Acknowledgements): void;
}

/** Letters are identified by the UUID the journal minted for them, which is
    what travels in an archive. Anything else in a carried list (a number, a
    sentence, the SQLite row id an old build might have saved) names no
    letter on another device and is dropped rather than made portable. */
const LETTER_ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const letterIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && LETTER_ID_SHAPE.test(id)))];
};

/** The value in the shape the preference holds, whatever it was handed: a
    key of an archive from a newer build, a hand-edited file, a half-written
    migration. Each field is checked alone, so one bad field costs only
    itself. */
export function sanitizeAcknowledgements(value: unknown): Acknowledgements {
  const raw = (typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const snoozes: Record<string, number> = {};
  if (typeof raw.snoozes === 'object' && raw.snoozes !== null && !Array.isArray(raw.snoozes)) {
    for (const [tile, until] of Object.entries(raw.snoozes)) {
      if (typeof until === 'number' && Number.isFinite(until)) snoozes[tile] = until;
    }
  }
  return {
    snoozes,
    readLetterIds: letterIds(raw.readLetterIds),
    greetedLetterIds: letterIds(raw.greetedLetterIds),
    hasEntries: typeof raw.hasEntries === 'boolean' ? raw.hasEntries : null
  };
}

export function isTileSnoozed(ack: Acknowledgements, tileKey: string, nowMs: number): boolean {
  const until = ack.snoozes[tileKey];
  return typeof until === 'number' && Number.isFinite(until) && until > nowMs;
}

/** Snoozes drop the ones that have already ended on the way past, so the map
    never outgrows the handful of tiles there are. */
export function withSnooze(ack: Acknowledgements, tileKey: string, untilMs: number, nowMs: number): Acknowledgements {
  const snoozes: Record<string, number> = {};
  for (const [key, until] of Object.entries(ack.snoozes)) if (until > nowMs) snoozes[key] = until;
  snoozes[tileKey] = untilMs;
  return { ...ack, snoozes };
}

/** The snoozes still running at `nowMs`. The same value back when none has
    ended, so a caller can tell there is nothing to write. */
export function withoutEndedSnoozes(ack: Acknowledgements, nowMs: number): Acknowledgements {
  const running = Object.entries(ack.snoozes).filter(([, until]) => until > nowMs);
  if (running.length === Object.keys(ack.snoozes).length) return ack;
  return { ...ack, snoozes: Object.fromEntries(running) };
}

export function withoutSnooze(ack: Acknowledgements, tileKey: string): Acknowledgements {
  if (!(tileKey in ack.snoozes)) return ack;
  const snoozes = { ...ack.snoozes };
  delete snoozes[tileKey];
  return { ...ack, snoozes };
}

export function withLetterRead(ack: Acknowledgements, letterId: string): Acknowledgements {
  return ack.readLetterIds.includes(letterId) ? ack : { ...ack, readLetterIds: [...ack.readLetterIds, letterId] };
}

export function withLetterGreeted(ack: Acknowledgements, letterId: string): Acknowledgements {
  return ack.greetedLetterIds.includes(letterId)
    ? ack
    : { ...ack, greetedLetterIds: [...ack.greetedLetterIds, letterId] };
}

export function withHasEntries(ack: Acknowledgements, hasEntries: boolean): Acknowledgements {
  return ack.hasEntries === hasEntries ? ack : { ...ack, hasEntries };
}

/* ---- The plaintext keys this replaces ---------------------------------- */

const LEGACY_READ_KEY = 'engender-read-letter-ids';
const LEGACY_GREETED_KEY = 'engender-greeted-letter-ids';
const LEGACY_HAS_ENTRIES_KEY = 'engender-has-entries';
const LEGACY_LETTER_SNOOZE_KEY = 'letter_tile_snooze_until';
const LEGACY_SNOOZE_PREFIX = 'engender-tile-snooze-';
/* Home's low-stock notice kept its snooze apart from the tiles', under two names (renamed
   it); it is the `stock-notice` tile's snooze now. */
const LEGACY_STOCK_SNOOZE_KEYS = ['engender-stock-notice-snooze-until', 'stock_notice_snooze_until'];

type LegacyStorage = Pick<Storage, 'getItem' | 'removeItem' | 'key' | 'length'>;

function legacyKeys(storage: LegacyStorage): string[] {
  const found: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (
      key !== null &&
      (key === LEGACY_READ_KEY ||
        key === LEGACY_GREETED_KEY ||
        key === LEGACY_HAS_ENTRIES_KEY ||
        key === LEGACY_LETTER_SNOOZE_KEY ||
        LEGACY_STOCK_SNOOZE_KEYS.includes(key) ||
        key.startsWith(LEGACY_SNOOZE_PREFIX))
    ) {
      found.push(key);
    }
  }
  return found;
}

function parseIds(raw: string | null): string[] {
  try {
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** What the old keys held, folded into `current`. Values already in
    `current` win where a fact has a single answer (a snooze deadline, the
    entries hint); id lists are unions, because a letter read on either side
    stays read. A snooze that had already ended by `nowMs` is not carried. */
export function foldLegacyAcknowledgements(
  current: Acknowledgements,
  storage: Pick<Storage, 'getItem'>,
  keys: readonly string[],
  nowMs: number = Date.now()
): Acknowledgements {
  const snoozes: Record<string, number> = { ...current.snoozes };
  const legacy: Record<string, unknown> = {};
  let read: string[] = [];
  let greeted: string[] = [];
  let hasEntries = current.hasEntries;
  for (const key of keys) {
    const raw = storage.getItem(key);
    if (key === LEGACY_READ_KEY) read = parseIds(raw);
    else if (key === LEGACY_GREETED_KEY) greeted = parseIds(raw);
    else if (key === LEGACY_HAS_ENTRIES_KEY) {
      if (hasEntries === null) hasEntries = raw === '1' ? true : raw === '0' ? false : null;
    } else {
      const tile =
        key === LEGACY_LETTER_SNOOZE_KEY
          ? 'ready-letter'
          : LEGACY_STOCK_SNOOZE_KEYS.includes(key)
            ? 'stock-notice'
            : key.slice(LEGACY_SNOOZE_PREFIX.length);
      const until = raw === null || raw === '' ? NaN : Number(raw);
      if (Number.isFinite(until) && until > nowMs && !(tile in snoozes)) legacy[tile] = until;
    }
  }
  return sanitizeAcknowledgements({
    snoozes: { ...legacy, ...snoozes },
    readLetterIds: [...current.readLetterIds, ...read],
    greetedLetterIds: [...current.greetedLetterIds, ...greeted],
    hasEntries
  });
}

/** First unlock after the upgrade: move the plaintext values into the
    encrypted preference, then delete them. Every unlock also drops the
    snoozes that have ended since, so the map holds only running ones.

    `persist` must reject when the write did not land. The reactive setters
    swallow a failed write and log it, so a migration that deleted the old
    keys after one of those would lose the person's read letters on a full
    disk. The keys stay when it rejects, and the next unlock tries again.
    Nothing is written when there was nothing to move or drop. */
export async function migrateLegacyAcknowledgements(
  storage: LegacyStorage | null,
  current: Acknowledgements,
  persist: (next: Acknowledgements) => Promise<void>,
  nowMs: number = Date.now()
): Promise<boolean> {
  let keys: string[] = [];
  try {
    if (storage) keys = legacyKeys(storage);
    const running = withoutEndedSnoozes(current, nowMs);
    if (keys.length === 0 && running === current) return false;
    await persist(storage && keys.length > 0 ? foldLegacyAcknowledgements(running, storage, keys, nowMs) : running);
  } catch (error) {
    console.error('Could not move the acknowledgements into the journal', error);
    return false;
  }
  for (const key of keys) {
    try {
      storage?.removeItem(key);
    } catch {
      /* A key that will not go is carried over again, harmlessly, next time. */
    }
  }
  return true;
}
