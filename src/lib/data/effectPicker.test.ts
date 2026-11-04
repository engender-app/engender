/* The noticed-effects picker's list (phase 12 ux-carpet ticket 289): which
   effects a regimen's drugs leave on offer, how they group, what a search
   keeps. Pure, so a fixture is a handful of literals. */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { PersonalEffectCatalogEntry } from './types.ts';
import { buildEffectPicker, offeredEffectTypes } from './effectPicker.ts';
import { BUILT_IN_PERSONAL_EFFECT_TYPES } from './vocabulary/builtins.ts';
import { RETIRED_PERSONAL_EFFECT_KEYS } from './vocabulary/retiredEffects.ts';

const effect = (
  key: string,
  direction: PersonalEffectCatalogEntry['direction'],
  categoryKey: string | null,
  name = key,
  builtIn = true
): PersonalEffectCatalogEntry => ({ key, name, builtIn, hidden: false, categoryKey, direction });

const effects = [
  effect('breast_development', 'feminizing', 'body_shape', 'Breast development'),
  effect('skin_softening', 'feminizing', 'skin_hair', 'Skin softening'),
  effect('voice_deepening', 'masculinizing', 'sensory', 'Voice deepening'),
  effect('facial_hair', 'masculinizing', 'skin_hair', 'Facial hair growth'),
  effect('muscle_gain', 'masculinizing', 'body_shape', 'Muscle gain'),
  effect('my_own', null, 'skin_hair', 'Crème rash', false)
];

const base = {
  effects,
  categoryOrder: ['body_shape', 'skin_hair', 'cognitive_emotional', 'sensory', 'genital', 'sexual'],
  categoryName: (key: string) => `cat:${key}`,
  customHeading: 'Your own',
  drugs: [] as string[],
  showAll: false,
  query: ''
};

const keys = (picker: ReturnType<typeof buildEffectPicker>) =>
  picker.groups.map((g) => [g.heading, g.effects.map((e) => e.key)]);

test('testosterone leaves masculinizing and custom effects, and counts what it hid', () => {
  const picker = buildEffectPicker({ ...base, drugs: ['Testosterone cypionate'] });
  assert.deepEqual(keys(picker), [
    ['cat:body_shape', ['muscle_gain']],
    ['cat:skin_hair', ['facial_hair']],
    ['cat:sensory', ['voice_deepening']],
    ['Your own', ['my_own']]
  ]);
  assert.equal(picker.hiddenCount, 2);
});

test('estradiol leaves feminizing and custom effects', () => {
  const picker = buildEffectPicker({ ...base, drugs: ['Estradiol valerate'] });
  assert.deepEqual(keys(picker), [
    ['cat:body_shape', ['breast_development']],
    ['cat:skin_hair', ['skin_softening']],
    ['Your own', ['my_own']]
  ]);
  assert.equal(picker.hiddenCount, 3);
});

test('both hormones active show both directions, feminizing first within a category', () => {
  const picker = buildEffectPicker({ ...base, drugs: ['Testosterone', 'Estradiol'] });
  assert.deepEqual(picker.groups[0].effects.map((e) => e.key), ['breast_development', 'muscle_gain']);
  assert.equal(picker.hiddenCount, 0);
});

test('no drug that resolves to a hormone shows everything and hides nothing', () => {
  for (const drugs of [[], ['Progesterone'], ['Spironolactone']]) {
    const picker = buildEffectPicker({ ...base, drugs });
    assert.equal(picker.groups.flatMap((g) => g.effects).length, effects.length);
    assert.equal(picker.hiddenCount, 0);
  }
});

test('show all lifts the filter and reports nothing hidden', () => {
  const picker = buildEffectPicker({ ...base, drugs: ['Testosterone'], showAll: true });
  assert.equal(picker.groups.flatMap((g) => g.effects).length, effects.length);
  assert.equal(picker.hiddenCount, 0);
});

test('a query folds case and diacritics, searches flat, and stays inside the filter', () => {
  const inFilter = buildEffectPicker({ ...base, drugs: ['Testosterone'], query: '  CREME ' });
  assert.deepEqual(keys(inFilter), [[null, ['my_own']]]);
  const outside = buildEffectPicker({ ...base, drugs: ['Testosterone'], query: 'breast' });
  assert.deepEqual(keys(outside), []);
  const widened = buildEffectPicker({ ...base, drugs: ['Testosterone'], showAll: true, query: 'breast' });
  assert.deepEqual(keys(widened), [[null, ['breast_development']]]);
});

/* Functional audit ticket 23: the built-ins the audit pruned are hidden in
   code, never deleted, because a marker names its effect by key. */
test('a retired built-in is not offered for a new pick', () => {
  const offered = offeredEffectTypes(
    [effect('cycle_cessation', 'masculinizing', 'genital'), effect('voice_drop', 'masculinizing', 'body_shape')],
    new Set()
  );
  assert.deepEqual(offered.map((e) => e.key), ['voice_drop']);
});

test('a retired built-in someone already marked still shows', () => {
  const offered = offeredEffectTypes(
    [effect('reduced_confidence_feminizing', 'feminizing', 'cognitive_emotional'), effect('skin_softening', 'feminizing', 'skin_hair')],
    new Set(['reduced_confidence_feminizing'])
  );
  assert.deepEqual(offered.map((e) => e.key), ['reduced_confidence_feminizing', 'skin_softening']);
});

test('the retired list names real built-ins: the duplicates, the stereotype-coded four and cycle_cessation', () => {
  const builtIns = new Set<string>(BUILT_IN_PERSONAL_EFFECT_TYPES.map((e) => e.key));
  for (const key of RETIRED_PERSONAL_EFFECT_KEYS) assert.ok(builtIns.has(key), key);
  for (const key of [
    'reduced_confidence_feminizing',
    'increased_confidence_masculinizing',
    'improved_color_perception_feminizing',
    'improved_spatial_awareness_feminizing',
    'cycle_cessation',
    'fewer_erections_feminizing',
    'testicular_atrophy_feminizing'
  ]) {
    assert.ok(RETIRED_PERSONAL_EFFECT_KEYS.has(key), key);
  }
});
