/* The built-in vocabulary is keyed rather than named, and reconciling it
   into a store is idempotent - which is what lets seeding run on every
   boot and before every import instead of behind a "seed only if empty"
   branch (ticket 05). */

import { test, expect } from 'vitest';
import {
  BUILT_IN_DIMENSIONS,
  BUILT_IN_PRESETS,
  BUILT_IN_TAG_GROUPS,
  MILESTONE_TEMPLATE_KEYS,
  withBuiltInDimensions,
  withBuiltInTagGroups
} from './builtins.ts';
import type { GenderDimension, TagGroup } from '../types.ts';

const allKeys = [
  ...BUILT_IN_DIMENSIONS.map((d) => d.key),
  ...BUILT_IN_PRESETS.map((p) => p.key),
  ...BUILT_IN_TAG_GROUPS.map((g) => g.key),
  ...BUILT_IN_TAG_GROUPS.flatMap((g) => g.tags),
  ...MILESTONE_TEMPLATE_KEYS
];

test('every built-in carries a key', () => {
  expect(allKeys.every((key) => typeof key === 'string' && key.length > 0)).toBe(true);
});

test('tag keys are unique across groups, so a tag belongs to exactly one', () => {
  const tagKeys = BUILT_IN_TAG_GROUPS.flatMap((g) => g.tags);

  expect(new Set(tagKeys).size).toBe(tagKeys.length);
});

test('every preset names dimensions that exist', () => {
  const dimensionKeys = new Set<string>(BUILT_IN_DIMENSIONS.map((d) => d.key));
  const dangling = BUILT_IN_PRESETS.flatMap((p) => p.dims).filter((k) => !dimensionKeys.has(k));

  expect(dangling).toEqual([]);
});

test('built-in presets map to the exact dimension sets ticket 09 specifies', () => {
  expect(BUILT_IN_PRESETS).toEqual([
    { key: 'p-btw', dims: ['euphoria_dysphoria', 'femininity'] },
    { key: 'p-masc', dims: ['euphoria_dysphoria', 'masculinity'] },
    { key: 'p-fem-masc', dims: ['euphoria_dysphoria', 'femininity', 'masculinity'] },
    { key: 'p-fluid', dims: ['euphoria_dysphoria', 'femininity', 'masculinity', 'binary_nonbinary'] },
    { key: 'p-agender', dims: ['euphoria_dysphoria', 'agender_gendered'] },
    { key: 'p-demi-fem', dims: ['euphoria_dysphoria', 'femininity', 'agender_gendered'] },
    { key: 'p-demi-masc', dims: ['euphoria_dysphoria', 'masculinity', 'agender_gendered'] },
    {
      key: 'p-nb',
      dims: ['euphoria_dysphoria', 'femininity', 'masculinity', 'binary_nonbinary', 'agender_gendered']
    }
  ]);
});

test('built-in dimensions seed with no display text, because names are resolved by key', () => {
  const seeded = withBuiltInDimensions([]);

  expect(seeded).toHaveLength(BUILT_IN_DIMENSIONS.length);
  expect(seeded.every((d) => d.builtIn && d.name === '' && d.low === '' && d.high === '')).toBe(true);
});

test('built-in tags seed with no display text either', () => {
  const seeded = withBuiltInTagGroups([]);

  expect(seeded.every((g) => g.builtIn && g.name === '')).toBe(true);
  expect(seeded.flatMap((g) => g.tags).every((t) => t.builtIn && t.label === '')).toBe(true);
});

test('seeding dimensions twice changes nothing', () => {
  const once = withBuiltInDimensions([]);

  expect(withBuiltInDimensions(once)).toEqual(once);
});

test('seeding tag groups twice changes nothing', () => {
  const once = withBuiltInTagGroups([]);

  expect(withBuiltInTagGroups(once)).toEqual(once);
});

test('seeding leaves custom dimensions alone and does not duplicate built-ins', () => {
  const custom: GenderDimension = {
    key: 'voice_comfort',
    name: 'Voice comfort',
    low: 'strained',
    high: 'easy',
    min: 0,
    max: 100,
    builtIn: false,
    hidden: false
  };

  const seeded = withBuiltInDimensions([...withBuiltInDimensions([]), custom]);

  expect(seeded.filter((d) => d.key === 'femininity')).toHaveLength(1);
  expect(seeded.find((d) => d.key === 'voice_comfort')).toEqual(custom);
});

test('seeding restores a built-in tag the store is missing without touching its neighbours', () => {
  const groups = withBuiltInTagGroups([]);
  const gender = groups.find((g) => g.key === 'gender')!;
  const custom = { id: 'g-voice', label: 'voice practice', builtIn: false, hidden: false };
  gender.tags = [...gender.tags.filter((t) => t.id !== 'g-body-eu'), custom];

  const seeded = withBuiltInTagGroups(groups);
  const reseededGender = seeded.find((g) => g.key === 'gender')!;

  expect(reseededGender.tags.map((t) => t.id)).toContain('g-body-eu');
  expect(reseededGender.tags.find((t) => t.id === 'g-voice')).toEqual(custom);
  expect(reseededGender.tags.filter((t) => t.id === 'g-soc-dys')).toHaveLength(1);
});

test('seeding preserves a group the user turned off and a tag they hid', () => {
  const groups = withBuiltInTagGroups([]);
  groups.find((g) => g.key === 'emotions')!.enabled = false;
  groups.find((g) => g.key === 'gender')!.tags.find((t) => t.id === 'g-misgendered')!.hidden = true;

  const seeded = withBuiltInTagGroups(groups);

  expect(seeded.find((g) => g.key === 'emotions')!.enabled).toBe(false);
  expect(seeded.find((g) => g.key === 'gender')!.tags.find((t) => t.id === 'g-misgendered')!.hidden).toBe(true);
});

test('a custom group survives seeding', () => {
  const custom: TagGroup = {
    key: 'custom-rituals',
    name: 'Rituals',
    enabled: true,
    builtIn: false,
    tags: [{ id: 'r-1', label: 'morning walk', builtIn: false, hidden: false }]
  };

  const seeded = withBuiltInTagGroups([...withBuiltInTagGroups([]), custom]);

  expect(seeded.find((g) => g.key === 'custom-rituals')).toEqual(custom);
});
