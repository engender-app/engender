/* A deterministic ten-year Journal (phase 2 ticket 20).

   Everything in the app has been demoed against a Journal a few weeks old.
   This writes the one the product actually asks people to keep: a decade of
   entries, photos, lab results and milestones, through the same
   `openJournal(driver, files)` handle a person's own writes go through
   (ADR-0017). Nothing here reaches for a driver, a file store or a
   platform, so the Android driver that ticket 11 is building drops in
   underneath without this file changing.

   Deterministic in the only sense a benchmark needs: the same seed writes
   the same content, so two runs measure the code rather than the fixture.
   Identity is the exception - the journal mints a uuid per row (ADR-0002)
   and a seed cannot reach into that. No clock is read either, here or
   below: `timestamp` comes from the day and the entry's place in it, and
   the last day of the journal is a constant rather than today, so the
   fixture does not drift as the calendar does.

   Photo bytes arrive from the caller. A representative photo is a real
   JPEG at the sizes ADR-0008 normalizes to, which needs a canvas the Node
   tier has not got, and the byte size is most of what the photo grid and
   the archive export are measuring - so the platform that has the canvas
   supplies it. */

import type { Journal } from '../../src/lib/data/journal/journal.ts';
import type { NormalizedPhoto } from '../../src/lib/data/journal/photos.ts';

/** Days in ten years, two of them leap. */
export const TEN_YEARS = 3653;

/** The last day the generated journal holds: 2026-08-11, fixed rather than
    today, so the fixture is the same one next month and next year. */
export const LAST_EPOCH_DAY = 20676;

export interface LongJournalOptions {
  seed?: number;
  /** How many days the journal spans, ending at `lastEpochDay`. */
  days?: number;
  lastEpochDay?: number;
  /** Bytes for the `n`th photo, full size and thumbnail. */
  makePhoto: (n: number) => Promise<NormalizedPhoto>;
}

export interface LongJournalSummary {
  firstEpochDay: number;
  lastEpochDay: number;
  entries: number;
  daysWithEntries: number;
  photos: number;
  labResults: number;
  milestones: number;
  /** A word in about a third of the notes, and one in a small handful.
      A search measurement that only ever asks the cheap question is not
      measuring search. */
  commonWord: string;
  commonWordEntries: number;
  rareWord: string;
  rareWordEntries: number;
}

/* Deterministic and cheap. Not a cryptographic generator and does not need
   to be - what it seeds is a fixture. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Note vocabulary. Polish and English mixed, because the app is bilingual
   and because ł, ó, ą and ę are the letters the search index folds by hand
   (ADR-0005) - a decade of notes that avoided them would leave the
   expensive half of search untested. */
const WORDS = [
  'dzisiaj',
  'lustro',
  'głos',
  'spokojnie',
  'zmęczona',
  'rano',
  'wieczorem',
  'terapia',
  'praca',
  'przyjaciółka',
  'siostra',
  'włosy',
  'sukienka',
  'kawa',
  'spacer',
  'żółty',
  'światło',
  'mieszkanie',
  'trochę',
  'lepiej',
  'gorzej',
  'nadzieja',
  'mirror',
  'voice',
  'today',
  'morning',
  'quiet',
  'tired',
  'walk',
  'coffee',
  'better',
  'again',
  'hormones',
  'appointment',
  'photo',
  'weekend'
];

const COMMON_WORD = 'lustro';
const RARE_WORD = 'endokrynolog';

const TAG_KEYS = [
  'g-soc-dys',
  'g-body-dys',
  'g-soc-eu',
  'g-body-eu',
  'g-transphobia',
  'g-gendered-ok',
  'g-misgendered',
  'e-happy',
  'e-calm',
  'e-anxious',
  'e-sad',
  'e-hopeful',
  'e-tired',
  'a-work',
  'a-friends',
  'a-family',
  'a-exercise',
  'a-therapy',
  'a-shopping',
  'a-selfcare'
];

const DIMENSION_KEYS = [
  'euphoria_dysphoria',
  'femininity',
  'masculinity',
  'binary_nonbinary',
  'agender_gendered'
];

/* One analyte in two unit spellings on purpose: mixed units are two series
   and never one line (ticket 02), and a ten-year journal is where a person
   changes labs and the spelling comes back different. */
const ANALYTES = [
  { analyte: 'Estradiol', unit: 'pg/mL' },
  { analyte: 'Estradiol', unit: 'pmol/L' },
  { analyte: 'Testosterone', unit: 'ng/dL' },
  { analyte: 'Prolactin', unit: 'ng/mL' }
];

const MILESTONE_NAMES = [
  'Pierwsza wizyta u sexuologa',
  'Coming out - siostra',
  'Coming out - rodzice',
  'Start HRT',
  'Pierwsza depilacja',
  'Zmiana imienia w pracy',
  'Pierwszy rok HRT',
  'Wniosek o zmianę oznaczenia płci',
  'Rozprawa',
  'Nowy dowód',
  'Pierwsza sukienka w pracy',
  'Konsultacja logopedyczna'
];

/** How many days apart the drifting dimension trend turns around. Ten years
    of a straight line would flatter every chart the stats screen draws. */
const TREND_PERIOD = 620;

export async function generateLongJournal(
  journal: Journal,
  options: LongJournalOptions
): Promise<LongJournalSummary> {
  const { seed = 1, days = TEN_YEARS, lastEpochDay = LAST_EPOCH_DAY, makePhoto } = options;
  const random = mulberry32(seed);
  const firstEpochDay = lastEpochDay - days + 1;

  const pick = <T>(from: readonly T[]): T => from[Math.floor(random() * from.length)];
  const between = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));

  const summary: LongJournalSummary = {
    firstEpochDay,
    lastEpochDay,
    entries: 0,
    daysWithEntries: 0,
    photos: 0,
    labResults: 0,
    milestones: 0,
    commonWord: COMMON_WORD,
    commonWordEntries: 0,
    rareWord: RARE_WORD,
    rareWordEntries: 0
  };

  /* Custom tags as well as built-in ones. A ten-year journal has vocabulary
     the app never shipped, and a custom tag joins on its uuid where a
     built-in joins on its key - the same COALESCE either way, but the
     measurement should be reading a real mix rather than a tidy one. */
  const customTags = await Promise.all([
    journal.tags.addTag('activities', 'basen'),
    journal.tags.addTag('activities', 'lekarz'),
    journal.tags.addTag('emotions', 'duma'),
    journal.tags.addTag('gender', 'passing')
  ]);
  const tagIds = [...TAG_KEYS, ...customTags.map((t) => t.id)];

  for (let day = firstEpochDay; day <= lastEpochDay; day++) {
    const roll = random();
    // Most days carry one entry, a fifth carry two, a few carry three. The
    // multi-entry day is what a day average has to average over.
    const count = roll < 0.28 ? 0 : roll < 0.85 ? 1 : roll < 0.97 ? 2 : 3;
    if (count > 0) summary.daysWithEntries++;

    for (let i = 0; i < count; i++) {
      const note = makeNote(random, pick, between);
      if (note.includes(COMMON_WORD)) summary.commonWordEntries++;
      if (note.includes(RARE_WORD)) summary.rareWordEntries++;

      const dims: Record<string, number> = {};
      for (const key of DIMENSION_KEYS) {
        if (random() < 0.62) dims[key] = driftedValue(day, key, random);
      }

      const tags: string[] = [];
      for (let t = 0, wanted = between(0, 4); t < wanted; t++) {
        const id = pick(tagIds);
        if (!tags.includes(id)) tags.push(id);
      }

      /* An entry has to carry at least one of mood, dimensions, tags, note
         or a photo or it does not exist (CONTEXT: Entry). A quarter carry
         no mood, which is what makes entryCountsByDay a different question
         from dayAverages - but only where something else is there. */
      const bare = note === '' && Object.keys(dims).length === 0 && tags.length === 0;
      const mood = bare || random() < 0.75 ? between(1, 5) : null;

      const attachPhotos = random() < 0.12 ? [await makePhoto(summary.photos)] : undefined;
      if (attachPhotos) summary.photos++;

      await journal.entries.upsertEntry({
        epochDay: day,
        // From the day and the entry's place in it, never from a clock:
        // 08:40, 13:10, 17:40 local, as milliseconds.
        timestamp: (day * 24 + 8 + i * 4.5) * 3_600_000 + 40 * 60_000,
        mood,
        note,
        dims,
        tags,
        attachPhotos
      });
      summary.entries++;
    }

    // A blood test about every three months, three or four analytes at a
    // time, which is what a lab chart over ten years is drawn from.
    if ((day - firstEpochDay) % 91 === 45) {
      for (const { analyte, unit } of ANALYTES) {
        if (random() < 0.8) {
          await journal.labs.upsertResult({
            epochDay: day,
            analyte,
            value: Math.round(random() * 4000) / 10,
            unit
          });
          summary.labResults++;
        }
      }
    }
  }

  // Milestones spread across the decade, some of them still ahead: a
  // countdown and an anniversary are the same row read against today.
  const milestoneStep = Math.max(1, Math.floor(days / MILESTONE_NAMES.length));
  for (let i = 0; i < MILESTONE_NAMES.length; i++) {
    const day = firstEpochDay + i * milestoneStep + between(0, Math.min(20, milestoneStep));
    if (day > lastEpochDay + 400) break;
    await journal.milestones.upsertMilestone({ name: MILESTONE_NAMES[i], epochDay: day });
    summary.milestones++;
  }

  return summary;
}

function makeNote(
  random: () => number,
  pick: <T>(from: readonly T[]) => T,
  between: (low: number, high: number) => number
): string {
  // A tenth of entries are a mood and nothing else - the quick log.
  if (random() < 0.1) return '';

  const words: string[] = [];
  for (let i = 0, wanted = between(6, 45); i < wanted; i++) words.push(pick(WORDS));
  if (random() < 0.33) words.splice(between(0, words.length), 0, COMMON_WORD);
  if (random() < 0.018) words.splice(between(0, words.length), 0, RARE_WORD);
  return words.join(' ');
}

/** A dimension's value on a day: a slow triangular drift plus noise, in the
    0 to 100 range every built-in dimension uses. Ten years of uniform noise
    would make every stats chart a flat band and every recap's biggest
    change a coin toss. */
function driftedValue(day: number, key: string, random: () => number): number {
  const offset = key.length * 37;
  const phase = ((day + offset) % TREND_PERIOD) / TREND_PERIOD;
  const triangle = phase < 0.5 ? phase * 2 : 2 - phase * 2;
  const centre = 20 + triangle * 60;
  return Math.max(0, Math.min(100, Math.round(centre + (random() - 0.5) * 24)));
}
