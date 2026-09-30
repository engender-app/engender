/* The noticed-effects picker's list (phase 12 ux-carpet ticket 289): which
   effects a regimen's drugs leave on offer, how they group, what a search
   keeps. Pure, so a fixture is a handful of literals. */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { PersonalEffectCatalogEntry } from './types.ts';
import { buildEffectPicker } from './effectPicker.ts';

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
  categoryOrder: ['body_shape', 'skin_hair', 'genital_sexual', 'cognitive_emotional', 'sensory'],
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
