import assert from 'node:assert/strict';
import { test } from 'vitest';
import { epochDayFromLocalDate } from './epochDay.ts';
import type { PersonalEffectType, RegimenEpisode } from './types.ts';
import {
  effectTier,
  effectWindowShape,
  literatureCovers,
  literatureWindow,
  literatureWindowDays
} from './personalEffectWindow.ts';

const ANCHOR = epochDayFromLocalDate(new Date(2024, 0, 1)); // 2024-01-01

/* An anchoring episode is the whole thing a band is read off now: its start
   day says where the bands are counted from and its drug says whether they
   exist at all. These two stand in for the two journals the gating is about
   - one whose only regimen episode is estradiol, one whose only episode is
   testosterone. */
type Anchor = Pick<RegimenEpisode, 'drug' | 'startEpochDay'>;
const ON_E: Anchor = { drug: 'estradiol valerate', startEpochDay: ANCHOR };
const ON_T: Anchor = { drug: 'testosterone enanthate', startEpochDay: ANCHOR };

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

/* Ticket 41's tier-1 widening: nine new feminizing-direction keys and four
   new masculinizing-direction keys, read out of GenderGP's WPATH-sourced
   tables (personalEffectWindow.ts's header). Masculinising scalp hair loss
   is deliberately absent - its completion figure is "variable", no range,
   so it sits at tier 2 instead - it is catalogued in
   vocabulary/builtins.ts and listed here nowhere. */
const NEW_FEMINIZING_TIER_1 = [
  'decreased_muscle_mass_strength',
  'decreased_libido',
  'decreased_spontaneous_erections',
  'decreased_testicular_volume',
  'male_pattern_baldness_ceasing'
] as const;
const NEW_MASCULINIZING_TIER_1 = [
  'skin_oiliness_acne_masculinizing',
  'increased_muscle_mass_strength_masculinizing',
  'clitoral_enlargement_masculinizing',
  'vaginal_atrophy_masculinizing'
] as const;

const ALL_TIER_1 = [...ORIGINAL_EIGHT, ...NEW_FEMINIZING_TIER_1, ...NEW_MASCULINIZING_TIER_1];

test('every tier-1 effect - the original eight plus ticket 41s widening - has a literature window', () => {
  for (const effect of ALL_TIER_1) assert.ok(literatureWindow(effect), `expected a window for ${effect}`);
});

test('onset and completion are counted forward from the anchor in calendar months', () => {
  const days = bandOf('breast_development', ON_E);
  assert.equal(days.onset.start, epochDayFromLocalDate(new Date(2024, 3, 1))); // +3 months
  assert.equal(days.onset.end, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(days.completion?.start, epochDayFromLocalDate(new Date(2026, 0, 1))); // +24 months
  assert.equal(days.completion?.end, epochDayFromLocalDate(new Date(2027, 0, 1))); // +36 months
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

test('masculinizing fat redistribution onset and completion count forward from the anchor', () => {
  const days = bandOf('masculinizing_fat_redistribution', ON_T);
  assert.equal(days.onset.start, epochDayFromLocalDate(new Date(2024, 1, 1))); // +1 month
  assert.equal(days.onset.end, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(days.completion?.start, epochDayFromLocalDate(new Date(2026, 0, 1))); // +24 months
  assert.equal(days.completion?.end, epochDayFromLocalDate(new Date(2029, 0, 1))); // +60 months
});

test('voice drop and facial/body hair windows match the masculinizing time-course table', () => {
  const voice = bandOf('voice_drop', ON_T);
  assert.equal(voice.onset.start, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(voice.onset.end, epochDayFromLocalDate(new Date(2025, 0, 1))); // +12 months
  assert.equal(voice.completion?.start, epochDayFromLocalDate(new Date(2025, 0, 1))); // +12 months
  assert.equal(voice.completion?.end, epochDayFromLocalDate(new Date(2026, 0, 1))); // +24 months

  const hair = bandOf('facial_body_hair', ON_T);
  assert.equal(hair.onset.start, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(hair.onset.end, epochDayFromLocalDate(new Date(2025, 0, 1))); // +12 months
  assert.equal(hair.completion?.start, epochDayFromLocalDate(new Date(2028, 0, 1))); // +48 months
  assert.equal(hair.completion?.end, epochDayFromLocalDate(new Date(2029, 0, 1))); // +60 months
});

test('cycle cessation has no defined completion ceiling, like skin softening', () => {
  const days = bandOf('cycle_cessation', ON_T);
  assert.equal(days.onset.start, epochDayFromLocalDate(new Date(2024, 1, 1))); // +1 month
  assert.equal(days.onset.end, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(days.completion, null);
});

/* Ticket 41's new tier-1 windows, all bounded (no open ends among them). */

test('decreased muscle mass and strength (feminizing) matches GenderGPs table', () => {
  const days = bandOf('decreased_muscle_mass_strength', ON_E);
  assert.equal(days.onset.start, epochDayFromLocalDate(new Date(2024, 3, 1))); // +3 months
  assert.equal(days.onset.end, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(days.completion?.start, epochDayFromLocalDate(new Date(2025, 0, 1))); // +12 months
  assert.equal(days.completion?.end, epochDayFromLocalDate(new Date(2026, 0, 1))); // +24 months
});

test('decreased libido, decreased spontaneous erections and decreased testicular volume (feminizing) match GenderGPs table', () => {
  const libido = bandOf('decreased_libido', ON_E);
  assert.equal(libido.onset.start, epochDayFromLocalDate(new Date(2024, 1, 1))); // +1 month
  assert.equal(libido.onset.end, epochDayFromLocalDate(new Date(2024, 3, 1))); // +3 months
  assert.equal(libido.completion?.start, epochDayFromLocalDate(new Date(2025, 0, 1))); // +12 months
  assert.equal(libido.completion?.end, epochDayFromLocalDate(new Date(2026, 0, 1))); // +24 months

  const erections = bandOf('decreased_spontaneous_erections', ON_E);
  assert.equal(erections.completion?.start, epochDayFromLocalDate(new Date(2024, 3, 1))); // +3 months
  assert.equal(erections.completion?.end, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months

  const testes = bandOf('decreased_testicular_volume', ON_E);
  assert.equal(testes.completion?.start, epochDayFromLocalDate(new Date(2026, 0, 1))); // +24 months
  assert.equal(testes.completion?.end, epochDayFromLocalDate(new Date(2027, 0, 1))); // +36 months
});

test('male pattern baldness ceasing to progress (feminizing) matches GenderGPs table', () => {
  const days = bandOf('male_pattern_baldness_ceasing', ON_E);
  assert.equal(days.onset.start, epochDayFromLocalDate(new Date(2024, 1, 1))); // +1 month
  assert.equal(days.onset.end, epochDayFromLocalDate(new Date(2024, 3, 1))); // +3 months
  assert.equal(days.completion?.start, epochDayFromLocalDate(new Date(2025, 0, 1))); // +12 months
  assert.equal(days.completion?.end, epochDayFromLocalDate(new Date(2026, 0, 1))); // +24 months
});

test('skin oiliness/acne and increased muscle mass (masculinizing) match GenderGPs table', () => {
  const skin = bandOf('skin_oiliness_acne_masculinizing', ON_T);
  assert.equal(skin.onset.start, epochDayFromLocalDate(new Date(2024, 1, 1))); // +1 month
  assert.equal(skin.onset.end, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(skin.completion?.start, epochDayFromLocalDate(new Date(2025, 0, 1))); // +12 months
  assert.equal(skin.completion?.end, epochDayFromLocalDate(new Date(2026, 0, 1))); // +24 months

  const muscle = bandOf('increased_muscle_mass_strength_masculinizing', ON_T);
  assert.equal(muscle.onset.start, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(muscle.onset.end, epochDayFromLocalDate(new Date(2025, 0, 1))); // +12 months
  assert.equal(muscle.completion?.start, epochDayFromLocalDate(new Date(2026, 0, 1))); // +24 months
  assert.equal(muscle.completion?.end, epochDayFromLocalDate(new Date(2029, 0, 1))); // +60 months
});

test('clitoral enlargement and vaginal atrophy (masculinizing) match GenderGPs table', () => {
  const clitoral = bandOf('clitoral_enlargement_masculinizing', ON_T);
  assert.equal(clitoral.onset.start, epochDayFromLocalDate(new Date(2024, 3, 1))); // +3 months
  assert.equal(clitoral.onset.end, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(clitoral.completion?.start, epochDayFromLocalDate(new Date(2025, 0, 1))); // +12 months
  assert.equal(clitoral.completion?.end, epochDayFromLocalDate(new Date(2026, 0, 1))); // +24 months

  const vaginal = bandOf('vaginal_atrophy_masculinizing', ON_T);
  assert.equal(vaginal.completion?.start, epochDayFromLocalDate(new Date(2025, 0, 1))); // +12 months
  assert.equal(vaginal.completion?.end, epochDayFromLocalDate(new Date(2026, 0, 1))); // +24 months
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
      assert.equal(literatureWindowDays(effect, { drug, startEpochDay: ANCHOR }), null);
    }
  }
});

test('the gate reads the same drug names the hormone curve does, in both catalogues', () => {
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
  // scalp_hair_loss_masculinizing is a real tier-2 catalogue key
  // (vocabulary/builtins.ts): GenderGP names it but gives no usable
  // completion range, so ticket 41 catalogues it at tier 2 rather than
  // stretching this file's tier-1 map to cover it. A minted custom key
  // behaves identically - absence from the map is what "no band" means.
  for (const effect of ['scalp_hair_loss_masculinizing', 'a1b2c3d4-custom-uuid']) {
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
  assert.equal(effectTier({ key: 'scalp_hair_loss_masculinizing', builtIn: true }), 2);
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
  assert.equal(effectWindowShape('cycle_cessation'), 'no-completion');
  assert.equal(effectWindowShape('breast_development'), 'bounded');
  assert.equal(effectWindowShape('voice_drop'), 'bounded');
  assert.equal(effectWindowShape('scalp_hair_loss_masculinizing'), 'none');
});

test('every tier-1 window has a shape that is not none, and no other key does', () => {
  // The vacuous-pass guard: a shape function that answered 'none' for
  // everything would pass the case list above if the list went stale.
  for (const effect of ['breast_development', 'skin_softening', 'hair_changes', 'cycle_cessation']) {
    assert.notEqual(effectWindowShape(effect), 'none');
    assert.equal(effectTier({ key: effect, builtIn: true }), 1);
  }
});
