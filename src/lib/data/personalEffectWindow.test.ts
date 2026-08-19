import assert from 'node:assert/strict';
import { test } from 'vitest';
import { epochDayFromLocalDate } from './epochDay.ts';
import {
  literatureCovers,
  literatureWindow,
  literatureWindowDays,
  PERSONAL_EFFECT_TYPES
} from './personalEffectWindow.ts';

const ANCHOR = epochDayFromLocalDate(new Date(2024, 0, 1)); // 2024-01-01

/* An anchoring episode is the whole thing a band is read off now: its start
   day says where the bands are counted from and its drug says whether they
   exist at all. These two stand in for the two journals the gating is about
   - one whose only regimen episode is estradiol, one whose only episode is
   testosterone. */
const ON_E = { drug: 'estradiol valerate', startEpochDay: ANCHOR };
const ON_T = { drug: 'testosterone enanthate', startEpochDay: ANCHOR };

/** The window a covered effect definitely has, so an arithmetic test can go
    straight at the numbers without repeating the null check the gating
    tests below make on purpose. */
function windowDays(effect: Parameters<typeof literatureWindowDays>[0], anchor: typeof ON_E) {
  const days = literatureWindowDays(effect, anchor);
  assert.ok(days !== null, `expected ${effect} to have a band against ${anchor.drug}`);
  return days;
}

test('every one of the eight fixed effects has a literature window', () => {
  assert.deepEqual(PERSONAL_EFFECT_TYPES, [
    'breast_development',
    'fat_redistribution',
    'skin_softening',
    'hair_changes',
    'voice_drop',
    'facial_body_hair',
    'masculinizing_fat_redistribution',
    'cycle_cessation'
  ]);
  for (const effect of PERSONAL_EFFECT_TYPES) assert.ok(literatureWindow(effect));
});

test('onset and completion are counted forward from the anchor in calendar months', () => {
  const days = windowDays('breast_development', ON_E);
  assert.equal(days.onset.start, epochDayFromLocalDate(new Date(2024, 3, 1))); // +3 months
  assert.equal(days.onset.end, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(days.completion?.start, epochDayFromLocalDate(new Date(2026, 0, 1))); // +24 months
  assert.equal(days.completion?.end, epochDayFromLocalDate(new Date(2027, 0, 1))); // +36 months
});

test('skin softening has no defined completion window at all', () => {
  const days = windowDays('skin_softening', ON_E);
  assert.ok(days.onset);
  assert.equal(days.completion, null);
});

test('hair changes has an open-ended completion window - a start with no end', () => {
  const days = windowDays('hair_changes', ON_E);
  assert.equal(days.completion?.start, epochDayFromLocalDate(new Date(2027, 0, 1))); // +36 months
  assert.equal(days.completion?.end, null);
});

test('masculinizing fat redistribution onset and completion count forward from the anchor', () => {
  const days = windowDays('masculinizing_fat_redistribution', ON_T);
  assert.equal(days.onset.start, epochDayFromLocalDate(new Date(2024, 1, 1))); // +1 month
  assert.equal(days.onset.end, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(days.completion?.start, epochDayFromLocalDate(new Date(2026, 0, 1))); // +24 months
  assert.equal(days.completion?.end, epochDayFromLocalDate(new Date(2029, 0, 1))); // +60 months
});

test('voice drop and facial/body hair windows match the masculinizing time-course table', () => {
  const voice = windowDays('voice_drop', ON_T);
  assert.equal(voice.onset.start, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(voice.onset.end, epochDayFromLocalDate(new Date(2025, 0, 1))); // +12 months
  assert.equal(voice.completion?.start, epochDayFromLocalDate(new Date(2025, 0, 1))); // +12 months
  assert.equal(voice.completion?.end, epochDayFromLocalDate(new Date(2026, 0, 1))); // +24 months

  const hair = windowDays('facial_body_hair', ON_T);
  assert.equal(hair.onset.start, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(hair.onset.end, epochDayFromLocalDate(new Date(2025, 0, 1))); // +12 months
  assert.equal(hair.completion?.start, epochDayFromLocalDate(new Date(2028, 0, 1))); // +48 months
  assert.equal(hair.completion?.end, epochDayFromLocalDate(new Date(2029, 0, 1))); // +60 months
});

test('cycle cessation has no defined completion ceiling, like skin softening', () => {
  const days = windowDays('cycle_cessation', ON_T);
  assert.equal(days.onset.start, epochDayFromLocalDate(new Date(2024, 1, 1))); // +1 month
  assert.equal(days.onset.end, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(days.completion, null);
});

/* Phase 5 ticket 27: the drug gate. */

const FEMINIZING = ['breast_development', 'fat_redistribution', 'skin_softening', 'hair_changes'] as const;
const MASCULINIZING = ['voice_drop', 'facial_body_hair', 'masculinizing_fat_redistribution', 'cycle_cessation'] as const;

test('every effect belongs to exactly one of the two literature tables', () => {
  assert.deepEqual([...FEMINIZING, ...MASCULINIZING].sort(), [...PERSONAL_EFFECT_TYPES].sort());
  for (const effect of FEMINIZING) assert.equal(literatureWindow(effect).direction, 'feminizing');
  for (const effect of MASCULINIZING) assert.equal(literatureWindow(effect).direction, 'masculinizing');
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
    for (const effect of PERSONAL_EFFECT_TYPES) {
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
