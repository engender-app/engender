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
   the Archive export are measuring - so the platform that has the canvas
   supplies it.

   Phase 5 ticket 36 widened this from five kinds of content to nineteen.
   `npm run benchmark:long-journal` still reports every measurement inside
   its budget, but the generation step itself - not one of the individually
   budgeted numbers, just the "Written in Xs" line the harness prints before
   measuring anything - moved from 51s to 56s on the machine budgets.json
   was recorded on. Recorded here, next to the old number, rather than
   quietly replaced: a ~10% write-time increase for fourteen more areas of
   content, nothing near the 5x budget headroom any of the measured reads
   actually gates on. */

import type { Journal } from '../../src/lib/data/journal/journal.ts';
import type { NormalizedPhoto } from '../../src/lib/data/journal/photos.ts';
import type { BodyRegionFeeling, TryoutKind } from '../../src/lib/data/types.ts';
import type { InjectionSiteKey } from '../../src/lib/data/doseSchedule.ts';
import { weekdayOfEpochDay } from '../../src/lib/data/epochDay.ts';
import { BUILT_IN_DIMENSIONS, BUILT_IN_MEASUREMENT_TYPES, BUILT_IN_PERSONAL_EFFECT_TYPES } from '../../src/lib/data/vocabulary/builtins.ts';
import { GARMENT_CATEGORIES } from '../../src/lib/data/garmentCategories.ts';
import { HAIR_REMOVAL_AREAS } from '../../src/lib/data/hairRemovalAreas.ts';
import { POLISH_PACK, ROADMAP_TRACKS } from '../../src/lib/data/roadmap.ts';
import { demoAudioBytes } from '../../src/lib/data/demoAudioBytes.ts';

/** Days in ten years, two of them leap. The unit is in the name because the
    option it is passed to takes days, and `{ days: TEN_YEARS }` read as
    though it meant ten of them. */
export const TEN_YEARS_IN_DAYS = 3653;

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
  /** A word that is a tag's label rather than note text. The search screen
      always hands `searchEntries` the ids of tags whose label matches what
      was typed, and a non-empty list unions a second query over `entry_tag`
      onto the FTS clause - a different plan from the one a note-only word
      takes. A custom tag, because a built-in stores a key and its wording
      comes from the message catalogue above this seam (ADR-0016). */
  tagWord: string;
  tagWordEntries: number;
  /** Entries carrying a body-region feeling whose euphoria clears
      GOOD_DAY_REGION_EUPHORIA_FLOOR (stats.ts) - what isGoodDay's and
      counterevidencePool's region clause (phase 5 ticket 44) needs to
      actually match something, rather than costing a query plan for a
      clause that never does. */
  regionEuphoriaEntries: number;
  /** Hair-progress stagings (phase 5 ticket 33). */
  hairStagings: number;
  /** Doses logged against the fixture's one regimen episode (phase 5
      ticket 40). */
  doseEvents: number;
  /** Doses logged against the two episodes phase 5 ticket 36 adds beside
      the one above, so at least one stretch of the fixture has two
      concurrent episodes overlapping (ticket 38's shape). */
  additionalDoseEvents: number;
  measurements: number;
  sizeRecords: number;
  hairRemovalSessions: number;
  roadmapChecks: number;
  letters: number;
  tryouts: number;
  personalEffects: number;
  wearSessions: number;
  cycleEvents: number;
  sideEffects: number;
  stockEntries: number;
  checklistItems: number;
  voiceRecordings: number;
  /** The start day of the earliest open-ended tryout (`endEpochDay: null`) -
      the widest possible span `searchEntries` can be asked to read for one
      tryout's detail screen. */
  tryoutWideOpenStartEpochDay: number;
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

/* Custom tags as well as built-in ones. A ten-year journal has vocabulary
   the app never shipped, and a custom tag joins on its uuid where a built-in
   joins on its key - the same COALESCE either way, but the measurement
   should be reading a real mix rather than a tidy one. The first label is
   also the one a search measurement types, so it has to be a word no note
   in WORDS contains. */
const CUSTOM_TAG_LABELS = [
  { group: 'activities', label: 'basen' },
  { group: 'activities', label: 'lekarz' },
  { group: 'emotions', label: 'duma' },
  { group: 'gender', label: 'passing' }
];

/* Every built-in, derived rather than listed: generate.test.ts asserts that
   each dimension the stats screen charts carries values, so a hand-written
   copy of this list turns adding a built-in scale into a failure in the
   generator rather than a missing series. Unlike the body regions below,
   where logging a handful is the point. */
const DIMENSION_KEYS: string[] = BUILT_IN_DIMENSIONS.map((d) => d.key);

/* Built-in body regions (phase 5 ticket 30/31/44), a handful rather than
   all ten - the good-day and counterevidence measurements need a mix of
   floors cleared and not, not every region logged on every day. */
const BODY_REGION_KEYS = ['chest', 'hairline', 'genitals', 'voice_throat', 'face_jaw'];

/* Hair tracking (phase 5 ticket 33): a staging every ~200 days, the real
   cadence a self-staging screen sees - nobody re-stages weekly. */
const HAIR_STAGE_SCALE = 'norwood_hamilton';
const HAIR_STAGES = ['1', '2', '2a', '3', '3v', '3a', '4', '4a', '5', '5a', '6', '7'];
const HAIR_STAGE_STEP_DAYS = 200;

/* The dose schedule (schema v38, ADR-0027, phase 5 ticket 40): one episode
   on a Monday/Wednesday/Friday recurrence with a two-amount cycle, starting
   a month into the fixture so expectedSlots also has to clip to the
   episode's own start day rather than the window's edge. Weekdays are
   Monday-first (epochDay.ts's weekdayOfEpochDay), same as the calendar. */
const REGIMEN_WEEKDAYS = [0, 2, 4];
const REGIMEN_DOSE_AMOUNTS = [
  { dose: 2, doseUnit: 'mg' },
  { dose: 1, doseUnit: 'mg' }
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
  'Pierwsza wizyta u seksuologa',
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

/* Phase 5 ticket 36: every More-hub area a review pass needs real content
   in, none of it spanning the whole decade - "a year of readings, at an
   irregular cadence" is the product's own instruction for the body-tracking
   areas, and the rest follow the same proportionate spirit rather than
   multiplying the write count by ten for no reader-visible benefit. */

const MEASUREMENT_TYPES = BUILT_IN_MEASUREMENT_TYPES.map((t) => t.key);
const HAIR_REMOVAL_METHODS = ['laser', 'electrolysis', 'other'] as const;
const INJECTABLE_SITES: InjectionSiteKey[] = [
  'thigh-left',
  'thigh-right',
  'deltoid-left',
  'deltoid-right',
  'ventrogluteal-left',
  'ventrogluteal-right'
];
const TRYOUT_KINDS: TryoutKind[] = ['name', 'pronouns', 'style', 'garment', 'makeup', 'presentation_step'];
const CYCLE_EVENT_KINDS = ['period_occurred', 'spotting', 'nothing_this_month'] as const;
const SIDE_EFFECT_NAMES = ['hot flashes', 'nausea', 'breast tenderness', 'headache', 'fatigue', 'mood swings'];

export async function generateLongJournal(
  journal: Journal,
  options: LongJournalOptions
): Promise<LongJournalSummary> {
  const { seed = 1, days = TEN_YEARS_IN_DAYS, lastEpochDay = LAST_EPOCH_DAY, makePhoto } = options;
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
    rareWordEntries: 0,
    tagWord: CUSTOM_TAG_LABELS[0].label,
    tagWordEntries: 0,
    regionEuphoriaEntries: 0,
    hairStagings: 0,
    doseEvents: 0,
    additionalDoseEvents: 0,
    measurements: 0,
    sizeRecords: 0,
    hairRemovalSessions: 0,
    roadmapChecks: 0,
    letters: 0,
    tryouts: 0,
    personalEffects: 0,
    wearSessions: 0,
    cycleEvents: 0,
    sideEffects: 0,
    stockEntries: 0,
    checklistItems: 0,
    voiceRecordings: 0,
    tryoutWideOpenStartEpochDay: 0
  };

  const customTags = await Promise.all(
    CUSTOM_TAG_LABELS.map(({ group, label }) => journal.tags.addTag(group, label))
  );
  const tagIds = [...TAG_KEYS, ...customTags.map((t) => t.id)];
  const tagWordId = customTags[0].id;

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
      if (tags.includes(tagWordId)) summary.tagWordEntries++;

      /* An entry has to carry a mood (CONTEXT: Entry); dimensions, tags,
         note and photo are all still optional on top of it. */
      const mood = between(1, 5);

      const attachPhotos = random() < 0.12 ? [await makePhoto(summary.photos)] : undefined;
      if (attachPhotos) summary.photos++;

      // A voice recording on about one entry in two hundred - raw bytes, no
      // format to get right (voiceRecordings.ts writes them through as-is)
      // and no callback needed the way a photo needs a real JPEG for its
      // byte size to mean anything.
      const attachRecordings = random() < 0.005 ? [demoAudioBytes(random)] : undefined;
      if (attachRecordings) summary.voiceRecordings++;

      // A body region on roughly one entry in six, its euphoria clearing
      // GOOD_DAY_REGION_EUPHORIA_FLOOR about half the time - a mix, not an
      // always-true or always-false clause.
      const bodyRegions: Record<string, BodyRegionFeeling> = {};
      if (random() < 0.16) {
        const clearsFloor = random() < 0.5;
        bodyRegions[pick(BODY_REGION_KEYS)] = {
          euphoria: clearsFloor ? between(50, 100) : between(0, 49),
          dysphoria: random() < 0.5 ? between(0, 100) : null
        };
        if (clearsFloor) summary.regionEuphoriaEntries++;
      }

      await journal.entries.upsertEntry({
        epochDay: day,
        /* From the day and the entry's place in it, never from a clock.
           Increasing within a day and across days, which is all the journal
           asks of it: a timestamp orders several entries on one epoch day
           and is never the source of which day an entry belongs to
           (CONTEXT: Timestamp). Not a wall-clock moment, and not claimed as
           one - epoch day is local (ADR-0001) and this arithmetic is not. */
        timestamp: (day * 24 + 8 + i * 4.5) * 3_600_000 + 40 * 60_000,
        mood,
        note,
        dims,
        tags,
        bodyRegions,
        attachPhotos,
        attachRecordings
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

  // Hair-progress stagings, spread across the decade rather than clustered:
  // hairAnchorEpochDay and the settings screen it feeds read every staging,
  // and a handful all on one day would not exercise that any differently
  // from a single row. A few dated photos alongside them, its own table
  // (hairProgress.ts) rather than the entry photos above - getPhotos()
  // would otherwise be reading an empty table at any journal size.
  let hairPhotoIndex = 0;
  for (let day = firstEpochDay, i = 0; day <= lastEpochDay; day += HAIR_STAGE_STEP_DAYS, i++) {
    await journal.hairProgress.upsertStage({
      epochDay: day,
      scale: HAIR_STAGE_SCALE,
      stage: HAIR_STAGES[i % HAIR_STAGES.length]
    });
    summary.hairStagings++;

    // One photo every fourth staging - about every 800 days, a photo shoot
    // being rarer than a self-staging.
    if (i % 4 === 0) {
      await journal.hairProgress.addPhoto(day, await makePhoto(hairPhotoIndex));
      hairPhotoIndex++;
    }
  }

  // The regimen episode and its schedule (schema v38, ADR-0027). Doses
  // follow the schedule's own weekdays, one in twenty left unlogged so the
  // adherence view has something to report as missing rather than a
  // perfect record no real journal keeps.
  const regimenStartEpochDay = firstEpochDay + 30;
  const episodeId = await journal.regimen.upsertEpisode({
    drug: 'Estradiol',
    ester: null,
    dose: REGIMEN_DOSE_AMOUNTS[0].dose,
    doseUnit: REGIMEN_DOSE_AMOUNTS[0].doseUnit,
    route: 'oral',
    interval: 'Monday, Wednesday, Friday',
    startEpochDay: regimenStartEpochDay,
    endEpochDay: null
  });
  await journal.doses.upsertSchedule({
    episodeId,
    recurrence: { kind: 'weekdays', weekdays: REGIMEN_WEEKDAYS },
    dosesPerDay: 1,
    doseAmounts: REGIMEN_DOSE_AMOUNTS
  });
  for (let day = regimenStartEpochDay; day <= lastEpochDay; day++) {
    if (!REGIMEN_WEEKDAYS.includes(weekdayOfEpochDay(day))) continue;
    if (random() < 0.05) continue;
    const amount = REGIMEN_DOSE_AMOUNTS[summary.doseEvents % REGIMEN_DOSE_AMOUNTS.length];
    await journal.doses.upsertDose({
      timestamp: (day * 24 + 8) * 3_600_000,
      route: 'oral',
      dose: amount.dose,
      doseUnit: amount.doseUnit,
      status: 'taken',
      drug: 'Estradiol'
    });
    summary.doseEvents++;
  }

  // A second, overlapping episode (phase 5 ticket 36): an antiandrogen
  // running for about 500 days in the middle of the fixture, well inside
  // the first episode's still-open span - two concurrently active episodes
  // for different drugs, the shape ticket 38's walkthrough test already
  // exercises. Every dose on it names its own drug, the disambiguation a
  // person makes once two episodes can both be active.
  const secondEpisodeStartEpochDay = regimenStartEpochDay + 800;
  const secondEpisodeEndEpochDay = secondEpisodeStartEpochDay + 500;
  const secondEpisodeId = await journal.regimen.upsertEpisode({
    drug: 'Spironolactone',
    ester: null,
    dose: 100,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: secondEpisodeStartEpochDay,
    endEpochDay: secondEpisodeEndEpochDay
  });
  await journal.doses.upsertSchedule({
    episodeId: secondEpisodeId,
    recurrence: { kind: 'everyNDays', everyNDays: 1 },
    dosesPerDay: 1,
    doseAmounts: [{ dose: 100, doseUnit: 'mg' }]
  });
  for (let day = secondEpisodeStartEpochDay; day <= secondEpisodeEndEpochDay; day++) {
    if (random() < 0.08) continue;
    await journal.doses.upsertDose({
      timestamp: (day * 24 + 21) * 3_600_000,
      route: 'oral',
      dose: 100,
      doseUnit: 'mg',
      status: 'taken',
      drug: 'Spironolactone'
    });
    summary.additionalDoseEvents++;
  }

  // A third episode, injectable, confined to the fixture's final ~150 days
  // (phase 5 ticket 36) - the hormone curve reads doses within
  // CURVE_LOOKBACK_DAYS (~63 days) of wherever it is asked to draw, so a
  // decade-long weekly schedule would spend nine and a half years of writes
  // on doses no curve ever reads. Named distinctly from the first episode's
  // "Estradiol" so the two read as a route switch rather than one typo.
  const thirdEpisodeStartEpochDay = lastEpochDay - 150;
  const thirdEpisodeId = await journal.regimen.upsertEpisode({
    drug: 'Estradiol valerate',
    ester: 'valerate',
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    interval: 'weekly',
    startEpochDay: thirdEpisodeStartEpochDay,
    endEpochDay: null
  });
  await journal.doses.upsertSchedule({
    episodeId: thirdEpisodeId,
    recurrence: { kind: 'weekdays', weekdays: [0] },
    dosesPerDay: 1,
    doseAmounts: [{ dose: 4, doseUnit: 'mg' }]
  });
  let injectionCount = 0;
  for (let day = thirdEpisodeStartEpochDay; day <= lastEpochDay; day++) {
    if (weekdayOfEpochDay(day) !== 0) continue;
    if (random() < 0.05) continue;
    await journal.doses.upsertDose({
      timestamp: (day * 24 + 19) * 3_600_000,
      route: 'im',
      dose: 4,
      doseUnit: 'mg',
      status: 'taken',
      drug: 'Estradiol valerate',
      injectionSite: INJECTABLE_SITES[injectionCount % INJECTABLE_SITES.length],
      vehicle: 'oil'
    });
    injectionCount++;
    summary.additionalDoseEvents++;
  }

  // Measurements, sizes and hair-removal sessions: a year each, at an
  // irregular cadence - an evenly spaced series is the one case every
  // chart already handles, so this is deliberately not one.
  const trackingWindowStart = lastEpochDay - 365;
  for (let day = trackingWindowStart; day <= lastEpochDay; day++) {
    if (random() < 0.94) continue;
    const type = pick(MEASUREMENT_TYPES);
    const unit = type === 'waist' && random() < 0.15 ? 'in' : 'cm';
    const base = { waist: 78, hips: 92, chest: 88, underbust: 74 }[type]!;
    const value = unit === 'in' ? Math.round(base / 2.54) : base + Math.round((random() - 0.5) * 6);
    await journal.measurements.upsertMeasurement({ type, epochDay: day, value, unit });
    summary.measurements++;
  }
  // A guaranteed second unit on waist - the random 15% above makes it rare
  // enough that a run can land on zero or one 'in' reading, which draws as
  // "two measurements make a trend, add another" rather than a trend.
  await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: lastEpochDay - 200, value: 31, unit: 'in' });
  await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: lastEpochDay - 40, value: 30, unit: 'in' });
  summary.measurements += 2;
  for (let day = trackingWindowStart; day <= lastEpochDay; day++) {
    if (random() < 0.97) continue;
    const category = pick(GARMENT_CATEGORIES);
    await journal.sizeRecords.upsertRecord({
      epochDay: day,
      category,
      size: pick(['XS', 'S', 'M', 'L', '32', '34', '36', '8', '10']),
      brand: pick(['', 'Zara', "Levi's", 'H&M', 'Uniqlo']),
      fitNote: pick(['', 'true to size', 'runs small', 'runs large'])
    });
    summary.sizeRecords++;
  }
  let hairRemovalPhotoIndex = 0;
  for (let day = trackingWindowStart; day <= lastEpochDay; day++) {
    if (random() < 0.95) continue;
    const sessionId = await journal.hairRemoval.upsertSession({
      epochDay: day,
      area: pick(HAIR_REMOVAL_AREAS),
      method: pick(HAIR_REMOVAL_METHODS),
      painRating: between(1, 5),
      cost: random() < 0.7 ? `${between(150, 450)} PLN` : '',
      provider: random() < 0.7 ? 'Klinika Laserowa' : ''
    });
    summary.hairRemovalSessions++;
    if (random() < 0.2) {
      await journal.hairRemoval.addPhoto(sessionId, await makePhoto(hairPhotoIndex + hairRemovalPhotoIndex + 1000));
      hairRemovalPhotoIndex++;
    }
  }

  // Roadmap: a few ticks across every track, plus one custom goal.
  for (const track of ROADMAP_TRACKS) {
    const goals = POLISH_PACK.goals.filter((g) => g.track === track);
    for (const goal of goals) {
      if (random() < 0.65) continue;
      await journal.roadmap.setGoalStatus(POLISH_PACK.key, goal.key, random() < 0.85 ? 'checked' : 'not-my-path');
      summary.roadmapChecks++;
    }
  }
  const customGoal = await journal.roadmap.addCustomGoal('social', 'Tell my sister');
  await journal.roadmap.setCustomGoalStatus(customGoal.id, 'checked');
  summary.roadmapChecks++;

  // Letters: a few, both sealed and already unlockable relative to the
  // fixture's own last day.
  const letterDays = [firstEpochDay + 200, firstEpochDay + 900, lastEpochDay - 400, lastEpochDay - 30];
  for (const [i, day] of letterDays.entries()) {
    await journal.letters.addLetter({
      epochDay: day,
      text: `Letter ${i + 1} to my future self, written on day ${day}.`,
      unlockEpochDay: day + (i % 2 === 0 ? 60 : 900)
    });
    summary.letters++;
  }

  // Tryouts: one per kind, dated inside the range entries already cover, so
  // its detail route has real entries to read back by date overlap.
  for (const [i, kind] of TRYOUT_KINDS.entries()) {
    const startDay = firstEpochDay + 400 + i * 90;
    const endEpochDay = i % 2 === 0 ? startDay + 60 : null;
    const tryoutId = await journal.tryouts.upsertTryout({
      kind,
      label: pick(['Alex', 'she/her', 'layered look', 'sundress', 'soft glam', 'first day out']),
      description: kind === 'name' ? null : `Notes on trying out ${kind}.`,
      startEpochDay: startDay,
      endEpochDay
    });
    summary.tryouts++;
    if (endEpochDay === null && summary.tryoutWideOpenStartEpochDay === 0) {
      summary.tryoutWideOpenStartEpochDay = startDay;
    }
    if (random() < 0.5) await journal.tryouts.addPhoto(tryoutId, startDay + 5, await makePhoto(hairPhotoIndex + hairRemovalPhotoIndex + 2000 + i));
    await journal.feltSense.add({ tryoutId }, { epochDay: startDay + 3, mood: between(2, 5) });
  }

  // Personal effects: several feminizing markers across categories, plus
  // one non-default category switched on so its disclosure group has
  // something in it too.
  await journal.effectCategories.setCategoryEnabled('genital_sexual', true);
  const effectTypes = BUILT_IN_PERSONAL_EFFECT_TYPES.filter((t) => t.direction === 'feminizing').filter(
    (_, i) => i % 3 === 0
  );
  for (const [i, type] of effectTypes.entries()) {
    await journal.personalEffects.upsertMarker({
      effect: type.key,
      firstNoticedEpochDay: regimenStartEpochDay + 30 + i * 45
    });
    summary.personalEffects++;
  }

  // Wear sessions: a year, irregular, most backfilled with a duration.
  for (let day = trackingWindowStart; day <= lastEpochDay; day++) {
    if (random() < 0.55) continue;
    await journal.wearSessions.upsertSession({
      startTimestamp: (day * 24 + 8) * 3_600_000,
      durationMs: between(2, 8) * 3_600_000,
      note: random() < 0.2 ? 'a bit tight by the end' : null
    });
    summary.wearSessions++;
  }

  // Cycle events: roughly monthly over the tracking window.
  for (let day = trackingWindowStart; day <= lastEpochDay; day += between(24, 34)) {
    await journal.cycleEvents.upsertCycleEvent({ kind: pick(CYCLE_EVENT_KINDS), epochDay: day });
    summary.cycleEvents++;
  }

  // Side effects: a handful spread across the whole fixture.
  for (let i = 0; i < 10; i++) {
    await journal.sideEffects.upsertSideEffect({
      name: pick(SIDE_EFFECT_NAMES),
      severity: between(1, 5),
      epochDay: firstEpochDay + Math.floor(((i + 1) / 11) * days)
    });
    summary.sideEffects++;
  }

  // Surgery: one procedure, dated, with a consult, notes and a recovery
  // checklist - so /settings/surgery has more than an empty timeline.
  const procedureId = await journal.procedures.upsertProcedure({
    name: 'top surgery',
    surgeryEpochDay: lastEpochDay - 600,
    notes: 'Double incision, drains out on day 5.'
  });
  await journal.procedures.addConsult(procedureId, lastEpochDay - 650);
  await journal.procedures.addConsult(procedureId, lastEpochDay - 620);
  for (const item of ['buy gauze', 'arrange time off work', 'ask about lifting restrictions']) {
    await journal.procedures.addChecklistItem(procedureId, item);
    summary.checklistItems++;
  }
  await journal.procedures.addPhoto(procedureId, lastEpochDay - 590, await makePhoto(hairPhotoIndex + hairRemovalPhotoIndex + 3000));

  // Appointment prep: a standalone checklist, unrelated to the procedure's.
  for (const item of ['ask about spironolactone dose', 'bring lab results', 'question about hair removal referral']) {
    await journal.checklists.addToStandaloneChecklist(item);
    summary.checklistItems++;
  }

  // Stock: current supply reported for the two drugs in regimen. Estradiol's
  // count is recorded years ago rather than at `today` on purpose (ticket
  // 05): getProjections reads every dose from a stock entry's own
  // recordedEpochDay forward (stock.ts), and a count nobody has refreshed
  // since near the start of HRT is what makes that read decade-scale rather
  // than the few-day window a freshly recorded count would produce.
  await journal.stock.upsertEntry({
    drug: 'Estradiol',
    quantity: 4000,
    unit: 'tablets',
    recordedEpochDay: regimenStartEpochDay + 200
  });
  await journal.stock.upsertEntry({ drug: 'Estradiol valerate', quantity: 6, unit: 'mL', recordedEpochDay: lastEpochDay - 3 });
  summary.stockEntries += 2;

  return summary;
}

function makeNote(
  random: () => number,
  pick: <T>(from: readonly T[]) => T,
  between: (low: number, high: number) => number
): string {
  // A tenth of entries carry no note at all. Not necessarily a quick log,
  // which is mood-only (CONTEXT): this one may still carry dimensions and
  // tags. What it is here for is that a note is not what makes an entry.
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
