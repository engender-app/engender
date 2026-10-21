import assert from 'node:assert/strict';
import { test } from 'vitest';
import { epochDayFromLocalDate, epochDayMonthsAgo } from './epochDay.ts';
import type { PersonalEffectType, RegimenEpisode } from './types.ts';
import {
  effectTier,
  effectWindowShape,
  isHrtOnsetWindowCurrent,
  LITERATURE_SOURCES,
  literatureCovers,
  literatureReviews,
  literatureWindow,
  literatureWindowDays
} from './personalEffectWindow.ts';

const ANCHOR = epochDayFromLocalDate(new Date(2024, 0, 1)); // 2024-01-01

/* An anchoring episode is the whole thing a band is read off now: its start
   day says where the bands are counted from and its drug says whether they
   exist at all. These two stand in for the two journals the gating is about
   - one whose only regimen episode is estradiol, one whose only episode is
   testosterone. */
type Anchor = Pick<RegimenEpisode, 'drug' | 'startEpochDay' | 'endEpochDay'>;
const ON_E: Anchor = { drug: 'estradiol valerate', startEpochDay: ANCHOR, endEpochDay: null };
const ON_T: Anchor = { drug: 'testosterone enanthate', startEpochDay: ANCHOR, endEpochDay: null };

/** The same anchor, stopped `months` after it started. */
const endedAfter = (anchor: Anchor, months: number): Anchor => ({
  ...anchor,
  endEpochDay: epochDayMonthsAgo(ANCHOR, -months)
});

/** The band a covered effect definitely has, so an arithmetic test can go
    straight at the numbers without repeating the null check the gating
    tests below make on purpose. */
function bandOf(effect: PersonalEffectType, anchor: Anchor) {
  const days = literatureWindowDays(effect, anchor);
  assert.ok(days !== null, `expected ${effect} to have a band against ${anchor.drug}`);
  return days;
}

/* Ticket 02's original eight, unchanged: same keys, same windows. Ticket 41
   widens tier 1 well past these, but this list stays exactly what it was -
   see personalEffectWindow.ts's header for why the CHECK's own eight are
   untouched. */
const ORIGINAL_EIGHT = [
  'breast_development',
  'fat_redistribution',
  'skin_softening',
  'hair_changes',
  'voice_drop',
  'facial_body_hair',
  'masculinizing_fat_redistribution',
  'cycle_cessation'
] as const;

/* Ticket 41's tier-1 widening, and the one row ticket 22 added from SOC8
   (scalp hair loss on testosterone). Hair loss ceasing on estradiol left
   tier 1 in ticket 22: SOC8 gives it no figure. */
const NEW_FEMINIZING_TIER_1 = [
  'decreased_muscle_mass_strength',
  'decreased_libido',
  'decreased_spontaneous_erections',
  'decreased_testicular_volume'
] as const;
const NEW_MASCULINIZING_TIER_1 = [
  'scalp_hair_loss_masculinizing',
  'skin_oiliness_acne_masculinizing',
  'increased_muscle_mass_strength_masculinizing',
  'clitoral_enlargement_masculinizing',
  'vaginal_atrophy_masculinizing'
] as const;

const ALL_TIER_1 = [...ORIGINAL_EIGHT, ...NEW_FEMINIZING_TIER_1, ...NEW_MASCULINIZING_TIER_1];

test('every tier-1 effect - the original eight plus ticket 41s widening - has a literature window', () => {
  for (const effect of ALL_TIER_1) assert.ok(literatureWindow(effect), `expected a window for ${effect}`);
});

/* Functional audit ticket 22: every band follows WPATH SOC8 Appendix C
   Table 1 (p. S254), cell for cell, in months. SOC8 writes years for the
   long figures; 2-5 y is 24-60 here, and ">5 y" is an open completion from
   60. `null` is SOC8's "unknown" or "variable": no completion is drawn.
   The research behind this table, and the nine cells where SOC8 departs
   from the Hembree 2017 tables it says it adapts, are in the docs repo
   (docs/research/onset-bands-soc8.md). */
const SOC8_TABLE_1: Record<string, [onsetMin: number, onsetMax: number, completion: [number, number | null] | null]> = {
  // Feminizing (estradiol)
  breast_development: [3, 6, [24, 60]],
  fat_redistribution: [3, 6, [24, 60]],
  skin_softening: [3, 6, null],
  hair_changes: [6, 12, [36, null]],
  decreased_muscle_mass_strength: [3, 6, [12, 24]],
  decreased_libido: [1, 3, null],
  decreased_spontaneous_erections: [1, 3, [3, 6]],
  decreased_testicular_volume: [3, 6, null],
  // Masculinizing (testosterone)
  voice_drop: [1, 6, [12, 24]],
  facial_body_hair: [6, 12, [60, null]],
  scalp_hair_loss_masculinizing: [6, 12, [60, null]],
  masculinizing_fat_redistribution: [1, 6, [24, 60]],
  cycle_cessation: [1, 6, [12, 24]],
  skin_oiliness_acne_masculinizing: [1, 6, [12, 24]],
  increased_muscle_mass_strength_masculinizing: [6, 12, [24, 60]],
  clitoral_enlargement_masculinizing: [1, 6, [12, 24]],
  vaginal_atrophy_masculinizing: [1, 6, [12, 24]]
};

test('every band is SOC8 Appendix C Table 1, cell for cell', () => {
  for (const [effect, [onsetMin, onsetMax, completion]] of Object.entries(SOC8_TABLE_1)) {
    const window = literatureWindow(effect);
    assert.ok(window, `expected a window for ${effect}`);
    assert.deepEqual(window.onsetMonths, { min: onsetMin, max: onsetMax }, `${effect} onset`);
    assert.deepEqual(
      window.completionMonths,
      completion === null ? null : { min: completion[0], max: completion[1] },
      `${effect} completion`
    );
  }
});

test('tier 1 is exactly the rows SOC8 Table 1 gives an onset for', () => {
  // Hair loss ceasing on estradiol is "variable / variable" in SOC8, so it
  // has no band any more. Scalp hair loss on testosterone gained one.
  assert.deepEqual([...ALL_TIER_1].sort(), Object.keys(SOC8_TABLE_1).sort());
  assert.equal(literatureWindow('male_pattern_baldness_ceasing'), undefined);
  assert.equal(effectTier({ key: 'male_pattern_baldness_ceasing', builtIn: true }), 2);
});

test('every band cites its source and carries a reviewed-on date', () => {
  for (const effect of ALL_TIER_1) {
    const window = literatureWindow(effect)!;
    assert.equal(window.source, 'soc8-appendix-c-table-1', `${effect} source`);
    assert.match(window.reviewedOn, /^\d{4}-\d{2}-\d{2}$/, `${effect} reviewed-on`);
    assert.equal(window.reviewedOn, '2026-10-21');
    assert.ok(LITERATURE_SOURCES[window.source].citation.includes('Standards of Care'), `${effect} citation`);
  }
});

test('the review list covers every band, for the release-time staleness guard', () => {
  const reviews = literatureReviews();
  assert.deepEqual(reviews.map((review) => review.effect).sort(), [...ALL_TIER_1].sort());
  for (const review of reviews) {
    assert.equal(review.source, 'soc8-appendix-c-table-1');
    assert.equal(review.reviewedOn, '2026-10-21');
  }
});

test('onset and completion are counted forward from the anchor in calendar months', () => {
  const days = bandOf('breast_development', ON_E);
  assert.equal(days.onset.start, epochDayFromLocalDate(new Date(2024, 3, 1))); // +3 months
  assert.equal(days.onset.end, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(days.completion?.start, epochDayFromLocalDate(new Date(2026, 0, 1))); // +24 months
  assert.equal(days.completion?.end, epochDayFromLocalDate(new Date(2029, 0, 1))); // +60 months
});

test('skin softening has no defined completion window at all', () => {
  const days = bandOf('skin_softening', ON_E);
  assert.ok(days.onset);
  assert.equal(days.completion, null);
});

test('hair changes has an open-ended completion window - a start with no end', () => {
  const days = bandOf('hair_changes', ON_E);
  assert.equal(days.completion?.start, epochDayFromLocalDate(new Date(2027, 0, 1))); // +36 months
  assert.equal(days.completion?.end, null);
});

test('voice drop starts in the first month on testosterone', () => {
  const voice = bandOf('voice_drop', ON_T);
  assert.equal(voice.onset.start, epochDayFromLocalDate(new Date(2024, 1, 1))); // +1 month
  assert.equal(voice.onset.end, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(voice.completion?.start, epochDayFromLocalDate(new Date(2025, 0, 1))); // +12 months
  assert.equal(voice.completion?.end, epochDayFromLocalDate(new Date(2026, 0, 1))); // +24 months
});

/* Phase 5 ticket 27: the drug gate. Still exhaustive over every tier-1 key,
   original and widened alike - tier 1 is exactly the keys this file's
   literature-window map lists. */

const FEMINIZING = [...ORIGINAL_EIGHT.slice(0, 4), ...NEW_FEMINIZING_TIER_1] as const;
const MASCULINIZING = [...ORIGINAL_EIGHT.slice(4), ...NEW_MASCULINIZING_TIER_1] as const;

test('every tier-1 effect belongs to exactly one of the two literature tables', () => {
  assert.deepEqual([...FEMINIZING, ...MASCULINIZING].sort(), [...ALL_TIER_1].sort());
  for (const effect of FEMINIZING) assert.equal(literatureWindow(effect)?.direction, 'feminizing');
  for (const effect of MASCULINIZING) assert.equal(literatureWindow(effect)?.direction, 'masculinizing');
});

test('a journal whose only regimen episode is testosterone gets no feminizing band', () => {
  assert.equal(literatureWindowDays('breast_development', ON_T), null);
  for (const effect of FEMINIZING) {
    assert.equal(literatureCovers(effect, ON_T.drug), false);
    assert.equal(literatureWindowDays(effect, ON_T), null);
  }
});

test('a journal whose only regimen episode is estradiol gets no masculinizing band', () => {
  assert.equal(literatureWindowDays('cycle_cessation', ON_E), null);
  for (const effect of MASCULINIZING) {
    assert.equal(literatureCovers(effect, ON_E.drug), false);
    assert.equal(literatureWindowDays(effect, ON_E), null);
  }
});

test('a drug the app cannot classify gets no band at all, rather than a hedged one', () => {
  // Fail closed: an antiandrogen, progesterone alone, a brand name this app
  // has no list for, and an empty field are all "not one of the two
  // hormones the tables describe", which is not the same as "probably the
  // one the other fields hint at".
  for (const drug of ['spironolactone', 'cyproterone acetate', 'progesterone', 'blokery', 'Androcur', '']) {
    for (const effect of ALL_TIER_1) {
      assert.equal(literatureCovers(effect, drug), false, `${drug} should not cover ${effect}`);
      assert.equal(literatureWindowDays(effect, { drug, startEpochDay: ANCHOR, endEpochDay: null }), null);
    }
  }
});

test('the gate reads hormone drug names in both catalogue languages', () => {
  // Not a second matching scheme: these are hormoneDrug.ts's lists, which is
  // why the Polish spellings and the abbreviations work here for free.
  for (const drug of ['estradiol', 'E2 valerate', 'walerianian estradiolu']) {
    assert.equal(literatureCovers('breast_development', drug), true);
    assert.equal(literatureCovers('voice_drop', drug), false);
  }
  for (const drug of ['testosterone', 'testosteron enantan', 'T cypionate']) {
    assert.equal(literatureCovers('voice_drop', drug), true);
    assert.equal(literatureCovers('breast_development', drug), false);
  }
});

test('a tier-2 or tier-3 key - no literature window at all - never gets a band', () => {
  // male_pattern_baldness_ceasing is a real tier-2 catalogue key
  // (vocabulary/builtins.ts): SOC8 names it but gives "variable" for both
  // figures, so ticket 22 dropped its band. A minted custom key behaves
  // identically - absence from the map is what "no band" means.
  for (const effect of ['male_pattern_baldness_ceasing', 'a1b2c3d4-custom-uuid']) {
    assert.equal(literatureWindow(effect), undefined);
    assert.equal(literatureCovers(effect, 'estradiol'), false);
    assert.equal(literatureCovers(effect, 'testosterone'), false);
    assert.equal(literatureWindowDays(effect, ON_E), null);
    assert.equal(literatureWindowDays(effect, ON_T), null);
  }
});

test("an effect's source tier is derived from whether this file lists it", () => {
  // CONTEXT's three tiers: a literature band, a named marker from the
  // community catalogue, a person's own addition. Nothing stores the tier
  // (ADR-0010) - listing a key in the window map above is what makes it
  // tier 1, and un-listing it would make it tier 2 with no second edit.
  assert.equal(effectTier({ key: 'breast_development', builtIn: true }), 1);
  assert.equal(effectTier({ key: 'voice_drop', builtIn: true }), 1);
  assert.equal(effectTier({ key: 'male_pattern_baldness_ceasing', builtIn: true }), 2);
  assert.equal(effectTier({ key: 'a1b2c3d4-custom-uuid', builtIn: false }), 3);
});

test("a person's own addition is tier 3 even if it borrows a built-in key", () => {
  // The tier decides which citation prints under an effect, so a custom
  // row named after a catalogued one must not inherit the guideline's.
  assert.equal(effectTier({ key: 'breast_development', builtIn: false }), 3);
});

test("the window's three shapes are enumerated here, not re-derived by a caption", () => {
  // The screen prints one whole sentence per shape. It asks which shape
  // this is rather than reading the nullable fields a second time.
  assert.equal(effectWindowShape('skin_softening'), 'no-completion');
  assert.equal(effectWindowShape('hair_changes'), 'open-completion');
  assert.equal(effectWindowShape('decreased_libido'), 'no-completion');
  assert.equal(effectWindowShape('facial_body_hair'), 'open-completion');
  assert.equal(effectWindowShape('cycle_cessation'), 'bounded');
  assert.equal(effectWindowShape('breast_development'), 'bounded');
  assert.equal(effectWindowShape('voice_drop'), 'bounded');
  assert.equal(effectWindowShape('male_pattern_baldness_ceasing'), 'none');
});

test('every tier-1 window has a shape that is not none, and no other key does', () => {
  // The vacuous-pass guard: a shape function that answered 'none' for
  // everything would pass the case list above if the list went stale.
  for (const effect of ['breast_development', 'skin_softening', 'hair_changes', 'cycle_cessation']) {
    assert.notEqual(effectWindowShape(effect), 'none');
    assert.equal(effectTier({ key: effect, builtIn: true }), 1);
  }
});

test('isHrtOnsetWindowCurrent returns true only while at least one onset window is active', () => {
  const eEpisode: RegimenEpisode = {
    id: 'e1',
    drug: 'estradiol valerate',
    drugClass: 'hrt',
    ester: null,
    dose: 4,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: ANCHOR,
    endEpochDay: null,
    endReason: null
  };

  // No episodes -> false
  assert.equal(isHrtOnsetWindowCurrent([], ANCHOR, null), false);

  // Before anchor start day -> false
  const dayBefore = epochDayFromLocalDate(new Date(2023, 11, 31));
  assert.equal(isHrtOnsetWindowCurrent([eEpisode], dayBefore, null), false);

  // On anchor start day -> true
  assert.equal(isHrtOnsetWindowCurrent([eEpisode], ANCHOR, null), true);

  // 1 month in -> true
  const oneMonthIn = epochDayFromLocalDate(new Date(2024, 1, 1));
  assert.equal(isHrtOnsetWindowCurrent([eEpisode], oneMonthIn, null), true);

  // 6 months in -> true
  const sixMonthsIn = epochDayFromLocalDate(new Date(2024, 6, 1));
  assert.equal(isHrtOnsetWindowCurrent([eEpisode], sixMonthsIn, null), true);

  // 12 months in (at max onset end, hair_changes at 12 months) -> true
  const twelveMonthsIn = epochDayFromLocalDate(new Date(2025, 0, 1));
  assert.equal(isHrtOnsetWindowCurrent([eEpisode], twelveMonthsIn, null), true);

  // 12 months + 1 day (past all onset windows) -> false
  const pastMaxOnset = epochDayFromLocalDate(new Date(2025, 0, 2));
  assert.equal(isHrtOnsetWindowCurrent([eEpisode], pastMaxOnset, null), false);

  // 24 months in -> false
  const twentyFourMonthsIn = epochDayFromLocalDate(new Date(2026, 0, 1));
  assert.equal(isHrtOnsetWindowCurrent([eEpisode], twentyFourMonthsIn, null), false);
});

test('isHrtOnsetWindowCurrent handles testosterone and unclassified drugs', () => {
  const tEpisode: RegimenEpisode = {
    id: 't1',
    drug: 'testosterone cypionate',
    drugClass: 'hrt',
    ester: null,
    dose: 50,
    doseUnit: 'mg',
    route: 'subcutaneous',
    interval: 'weekly',
    startEpochDay: ANCHOR,
    endEpochDay: null,
    endReason: null
  };

  // Active during onset window for testosterone
  assert.equal(isHrtOnsetWindowCurrent([tEpisode], ANCHOR, null), true);
  assert.equal(isHrtOnsetWindowCurrent([tEpisode], epochDayFromLocalDate(new Date(2025, 0, 1)), null), true);
  assert.equal(isHrtOnsetWindowCurrent([tEpisode], epochDayFromLocalDate(new Date(2025, 0, 2)), null), false);

  // Unclassified drug with no literature windows -> false
  const unclassifiedEpisode: RegimenEpisode = {
    id: 'u1',
    drug: 'progesterone',
    drugClass: 'hrt',
    ester: null,
    dose: 100,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: ANCHOR,
    endEpochDay: null,
    endReason: null
  };
  assert.equal(isHrtOnsetWindowCurrent([unclassifiedEpisode], ANCHOR, null), false);
});

/* Phase 8 features ticket 49 item 1: the anchoring episode's end day.

   A band is a claim about a body on the hormone the table describes, so it
   has nothing to say about the days after that hormone stopped. Before this,
   `literatureWindowDays` read `startEpochDay` alone, and a five-year
   masculinizing completion band kept drawing years past a stopped regimen
   with the Endocrine Society printed underneath it. */

test('an open episode draws exactly the bands it always drew', () => {
  // The regression guard on the clip: `endEpochDay` null is the ordinary
  // case and nothing about it moves.
  const open = bandOf('increased_muscle_mass_strength_masculinizing', ON_T);
  assert.equal(open.onset.start, epochDayMonthsAgo(ANCHOR, -6));
  assert.equal(open.onset.end, epochDayMonthsAgo(ANCHOR, -12));
  assert.equal(open.completion?.start, epochDayMonthsAgo(ANCHOR, -24));
  assert.equal(open.completion?.end, epochDayMonthsAgo(ANCHOR, -60));
});

test('an episode that ended before the onset could begin gets no band at all', () => {
  // Muscle mass's onset opens at 6 months; three months of testosterone is
  // over before the literature has anything to say, so there is nothing to
  // report rather than a band whose every day is unreachable.
  const muscle = 'increased_muscle_mass_strength_masculinizing';
  assert.equal(literatureWindowDays(muscle, endedAfter(ON_T, 3)), null);
  assert.equal(literatureWindowDays(muscle, endedAfter(ON_T, 5)), null);
});

test("a band's onset stops at the day the episode ended", () => {
  const days = bandOf('increased_muscle_mass_strength_masculinizing', endedAfter(ON_T, 9));
  assert.equal(days.onset.start, epochDayMonthsAgo(ANCHOR, -6));
  assert.equal(days.onset.end, epochDayMonthsAgo(ANCHOR, -9), 'clipped from 12 months to the end day');
});

test('a completion window entirely past the end day is dropped, not drawn in the past', () => {
  // Nine months of testosterone: the onset window is real and half-run, and
  // completion (24-60 months) never started.
  const days = bandOf('increased_muscle_mass_strength_masculinizing', endedAfter(ON_T, 9));
  assert.equal(days.completion, null);
});

test('a completion window the episode ran into is clipped at the end day', () => {
  // breast_development completes at 24-60 months; thirty months of
  // estradiol reaches into it and stops there.
  const days = bandOf('breast_development', endedAfter(ON_E, 30));
  assert.equal(days.completion?.start, epochDayMonthsAgo(ANCHOR, -24));
  assert.equal(days.completion?.end, epochDayMonthsAgo(ANCHOR, -30));
});

test('an open-ended completion gains an end when the episode has one', () => {
  // hair_changes is "more than 36 months", modelled as `end: null`. An
  // episode that stopped at 48 months bounds it, because the open end was
  // only ever open for a body still on the hormone.
  const open = bandOf('hair_changes', ON_E);
  assert.equal(open.completion?.end, null);

  const stopped = bandOf('hair_changes', endedAfter(ON_E, 48));
  assert.equal(stopped.completion?.start, epochDayMonthsAgo(ANCHOR, -36));
  assert.equal(stopped.completion?.end, epochDayMonthsAgo(ANCHOR, -48));
});

test('an effect the literature gives no ceiling for keeps its absent completion', () => {
  // skin_softening's completion is null because the literature reports no
  // ceiling at all - a different thing from a completion the clip removed,
  // and the clip must not invent one.
  const days = bandOf('skin_softening', endedAfter(ON_E, 9));
  assert.equal(days.completion, null);
  assert.equal(days.onset.end, epochDayMonthsAgo(ANCHOR, -6), 'onset ends at 6 months, before the end day');
});

test('isHrtOnsetWindowCurrent goes quiet once the anchoring episode has ended', () => {
  // The quick-add effects prompt asks this. An episode stopped at 3 months
  // has no live onset window left, even on a day the open-episode version of
  // the same question would answer true for.
  const stopped: RegimenEpisode = {
    id: 'e1',
    drug: 'estradiol valerate',
    drugClass: 'hrt',
    ester: null,
    dose: 4,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: ANCHOR,
    endEpochDay: epochDayMonthsAgo(ANCHOR, -3),
    endReason: null
  };
  const sixMonthsIn = epochDayMonthsAgo(ANCHOR, -6);
  assert.equal(isHrtOnsetWindowCurrent([{ ...stopped, endEpochDay: null }], sixMonthsIn, null), true);
  assert.equal(isHrtOnsetWindowCurrent([stopped], sixMonthsIn, null), false);
  // Still true on a day the episode covered.
  assert.equal(isHrtOnsetWindowCurrent([stopped], epochDayMonthsAgo(ANCHOR, -2), null), true);
});

