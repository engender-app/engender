/* The built-in vocabulary is keyed rather than named, and reconciling it
   into a store is idempotent - which is what lets seeding run on every
   boot and before every import instead of behind a "seed only if empty"
   branch. */

import { test, expect } from 'vitest';
import {
  BUILT_IN_BODY_REGIONS,
  BUILT_IN_DIMENSIONS,
  BUILT_IN_PRESETS,
  BUILT_IN_TAG_GROUPS,
  GUIDED_PROMPT_KEYS,
  MILESTONE_TEMPLATE_KEYS,
  REGIMEN_TEMPLATE_KEYS,
  REGIMEN_TEMPLATE_LEAN,
  milestoneTemplateRows,
  regimenTemplateRows,
  withBuiltInDimensions,
  withBuiltInTagGroups
} from './builtins.ts';
import type { GenderDimension, TagGroup } from '../types.ts';

const allKeys = [
  ...BUILT_IN_DIMENSIONS.map((d) => d.key),
  ...BUILT_IN_PRESETS.map((p) => p.key),
  ...BUILT_IN_TAG_GROUPS.map((g) => g.key),
  ...BUILT_IN_TAG_GROUPS.flatMap((g) => g.tags),
  ...MILESTONE_TEMPLATE_KEYS,
  ...REGIMEN_TEMPLATE_KEYS,
  ...GUIDED_PROMPT_KEYS,
  ...BUILT_IN_BODY_REGIONS
];

test('every built-in carries a key', () => {
  expect(allKeys.every((key) => typeof key === 'string' && key.length > 0)).toBe(true);
});

test('every body region carries a unique key', () => {
  expect(new Set(BUILT_IN_BODY_REGIONS).size).toBe(BUILT_IN_BODY_REGIONS.length);
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

test('built-in presets map to the exact dimension sets ticket 09 specifies, multi-axis presets leading (ticket 28)', () => {
  expect(BUILT_IN_PRESETS).toEqual([
    { key: 'p-fem-masc', dims: ['euphoria_dysphoria', 'femininity', 'masculinity'] },
    { key: 'p-fluid', dims: ['euphoria_dysphoria', 'femininity', 'masculinity', 'binary_nonbinary'] },
    { key: 'p-agender', dims: ['euphoria_dysphoria', 'agender_gendered'] },
    { key: 'p-demi-fem', dims: ['euphoria_dysphoria', 'femininity', 'agender_gendered'] },
    { key: 'p-demi-masc', dims: ['euphoria_dysphoria', 'masculinity', 'agender_gendered'] },
    {
      key: 'p-nb',
      dims: ['euphoria_dysphoria', 'femininity', 'masculinity', 'binary_nonbinary', 'agender_gendered']
    },
    { key: 'p-btw', dims: ['euphoria_dysphoria', 'femininity'] },
    { key: 'p-masc', dims: ['euphoria_dysphoria', 'masculinity'] }
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

test('dysphoria type seeds with exactly the seven confirmed categories', () => {
  const groups = withBuiltInTagGroups([]);
  const dysphoriaType = groups.find((g) => g.key === 'dysphoria_type')!;

  expect(dysphoriaType.tags.map((t) => t.id)).toEqual([
    'dt-physical',
    'dt-biochemical',
    'dt-social',
    'dt-societal',
    'dt-sexual',
    'dt-presentational',
    'dt-existential'
  ]);
});

test('the euphoria tag lives in the gender group, separate from every dysphoria type key', () => {
  const groups = withBuiltInTagGroups([]);
  const gender = groups.find((g) => g.key === 'gender')!;
  const dysphoriaTypeKeys = new Set(groups.find((g) => g.key === 'dysphoria_type')!.tags.map((t) => t.id));

  expect(gender.tags.map((t) => t.id)).toContain('g-euphoria');
  expect(dysphoriaTypeKeys.has('g-euphoria')).toBe(false);
});

test('regimen template keys are unique', () => {
  expect(new Set(REGIMEN_TEMPLATE_KEYS).size).toBe(REGIMEN_TEMPLATE_KEYS.length);
});

test('regimen templates seed with no display text, because wording is resolved by key', () => {
  const rows = regimenTemplateRows();

  expect(rows).toHaveLength(REGIMEN_TEMPLATE_KEYS.length);
  expect(rows.every((t) => t.name === '' && t.drug === '' && t.ester === null && t.route === '')).toBe(true);
});

/* Acceptance box 2: every regimen template carries a
   hand-authored lean. Milestone templates carry none since functional
   audit ticket 32: all eight were neutral, so the lean ordered nothing. */
test('milestone templates are a key and a name, in the order the picker lists them', () => {
  expect(milestoneTemplateRows()).toEqual(MILESTONE_TEMPLATE_KEYS.map((key) => ({ key, name: '' })));
});

test('every regimen template carries a lean matching the hormone it starts', () => {
  expect(REGIMEN_TEMPLATE_LEAN).toEqual({
    estradiol_valerate_im: 'femme',
    estradiol_oral: 'femme',
    estradiol_gel: 'femme',
    testosterone_cypionate_im: 'masc',
    testosterone_gel: 'masc',
    spironolactone_oral: 'femme',
    cyproterone_oral: 'femme',
    bicalutamide_oral: 'femme',
    progesterone_oral: 'femme',
    gnrh_agonist_im: 'neutral'
  });

  const rows = regimenTemplateRows();
  REGIMEN_TEMPLATE_KEYS.forEach((key, i) => {
    expect(rows[i].lean).toBe(REGIMEN_TEMPLATE_LEAN[key]);
  });
});

test('guided prompt keys are unique', () => {
  expect(new Set(GUIDED_PROMPT_KEYS).size).toBe(GUIDED_PROMPT_KEYS.length);
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
