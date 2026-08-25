/* Presets never store their own lean - it is derived purely from `dims`
   (ADR-0030, CONTEXT: "Lean"). */

import { test, expect } from 'vitest';
import { scaleLean, rankByLean } from './lean.ts';
import { BUILT_IN_PRESETS } from './vocabulary/builtins.ts';

test('every built-in preset derives the lean ticket 43 expects', () => {
  const expected: Record<string, 'femme' | 'masc' | null> = {
    'p-fem-masc': null,
    'p-fluid': null,
    'p-agender': null,
    'p-demi-fem': 'femme',
    'p-demi-masc': 'masc',
    'p-nb': null,
    'p-btw': 'femme',
    'p-masc': 'masc'
  };

  for (const preset of BUILT_IN_PRESETS) {
    expect(scaleLean(preset.dims)).toBe(expected[preset.key]);
  }
});

test('a custom preset with both femininity and masculinity has no lean', () => {
  expect(scaleLean(['euphoria_dysphoria', 'femininity', 'masculinity', 'binary_nonbinary'])).toBeNull();
});

test('a custom preset with neither femininity nor masculinity has no lean', () => {
  expect(scaleLean(['euphoria_dysphoria', 'agender_gendered'])).toBeNull();
});

test('rankByLean sorts matching items first, keeping each group in its own order', () => {
  const items = [
    { key: 'a', lean: 'neutral' as const },
    { key: 'b', lean: 'masc' as const },
    { key: 'c', lean: 'femme' as const },
    { key: 'd', lean: 'femme' as const },
    { key: 'e', lean: 'neutral' as const }
  ];

  expect(rankByLean(items, 'femme').map((i) => i.key)).toEqual(['c', 'd', 'a', 'b', 'e']);
});

test('rankByLean leaves the list untouched when the preset has no lean', () => {
  const items = [
    { key: 'a', lean: 'neutral' as const },
    { key: 'b', lean: 'masc' as const },
    { key: 'c', lean: 'femme' as const }
  ];

  expect(rankByLean(items, null)).toEqual(items);
});
