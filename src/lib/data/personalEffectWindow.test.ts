import assert from 'node:assert/strict';
import { test } from 'vitest';
import { epochDayFromLocalDate } from './epochDay.ts';
import { literatureWindow, literatureWindowDays, PERSONAL_EFFECT_TYPES } from './personalEffectWindow.ts';

const ANCHOR = epochDayFromLocalDate(new Date(2024, 0, 1)); // 2024-01-01

test('every one of the four fixed effects has a literature window', () => {
  assert.deepEqual(PERSONAL_EFFECT_TYPES, ['breast_development', 'fat_redistribution', 'skin_softening', 'hair_changes']);
  for (const effect of PERSONAL_EFFECT_TYPES) assert.ok(literatureWindow(effect));
});

test('onset and completion are counted forward from the anchor in calendar months', () => {
  const days = literatureWindowDays('breast_development', ANCHOR);
  assert.equal(days.onset.start, epochDayFromLocalDate(new Date(2024, 3, 1))); // +3 months
  assert.equal(days.onset.end, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(days.completion?.start, epochDayFromLocalDate(new Date(2026, 0, 1))); // +24 months
  assert.equal(days.completion?.end, epochDayFromLocalDate(new Date(2027, 0, 1))); // +36 months
});

test('skin softening has no defined completion window at all', () => {
  const days = literatureWindowDays('skin_softening', ANCHOR);
  assert.ok(days.onset);
  assert.equal(days.completion, null);
});

test('hair changes has an open-ended completion window - a start with no end', () => {
  const days = literatureWindowDays('hair_changes', ANCHOR);
  assert.equal(days.completion?.start, epochDayFromLocalDate(new Date(2027, 0, 1))); // +36 months
  assert.equal(days.completion?.end, null);
});
