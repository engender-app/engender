import assert from 'node:assert/strict';
import { test } from 'vitest';
import { epochDayFromLocalDate } from './epochDay.ts';
import { literatureWindow, literatureWindowDays, PERSONAL_EFFECT_TYPES } from './personalEffectWindow.ts';

const ANCHOR = epochDayFromLocalDate(new Date(2024, 0, 1)); // 2024-01-01

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

test('masculinizing fat redistribution onset and completion count forward from the anchor', () => {
  const days = literatureWindowDays('masculinizing_fat_redistribution', ANCHOR);
  assert.equal(days.onset.start, epochDayFromLocalDate(new Date(2024, 1, 1))); // +1 month
  assert.equal(days.onset.end, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(days.completion?.start, epochDayFromLocalDate(new Date(2026, 0, 1))); // +24 months
  assert.equal(days.completion?.end, epochDayFromLocalDate(new Date(2029, 0, 1))); // +60 months
});

test('voice drop and facial/body hair windows match the masculinizing time-course table', () => {
  const voice = literatureWindowDays('voice_drop', ANCHOR);
  assert.equal(voice.onset.start, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(voice.onset.end, epochDayFromLocalDate(new Date(2025, 0, 1))); // +12 months
  assert.equal(voice.completion?.start, epochDayFromLocalDate(new Date(2025, 0, 1))); // +12 months
  assert.equal(voice.completion?.end, epochDayFromLocalDate(new Date(2026, 0, 1))); // +24 months

  const hair = literatureWindowDays('facial_body_hair', ANCHOR);
  assert.equal(hair.onset.start, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(hair.onset.end, epochDayFromLocalDate(new Date(2025, 0, 1))); // +12 months
  assert.equal(hair.completion?.start, epochDayFromLocalDate(new Date(2028, 0, 1))); // +48 months
  assert.equal(hair.completion?.end, epochDayFromLocalDate(new Date(2029, 0, 1))); // +60 months
});

test('cycle cessation has no defined completion ceiling, like skin softening', () => {
  const days = literatureWindowDays('cycle_cessation', ANCHOR);
  assert.equal(days.onset.start, epochDayFromLocalDate(new Date(2024, 1, 1))); // +1 month
  assert.equal(days.onset.end, epochDayFromLocalDate(new Date(2024, 6, 1))); // +6 months
  assert.equal(days.completion, null);
});
