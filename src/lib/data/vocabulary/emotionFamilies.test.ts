/* Emotion families (pre-release-human 22): a family is an ordinary emotion
   tag that opens its finer words. These pin the tap cycle Alicja settled and
   that the six emotion tags older entries carry keep their meaning. */

import { test, expect } from 'vitest';
import { BUILT_IN_TAG_GROUPS, EMOTION_FAMILIES } from './builtins.ts';
import { familyOf, tapFamily, toggleTag } from './emotionFamilies.ts';

const emotions: readonly string[] = BUILT_IN_TAG_GROUPS.find((g) => g.key === 'emotions')!.tags;

test('the six emotion tags older entries carry are all still emotions, and in the first six places', () => {
  expect(emotions.slice(0, 6)).toEqual(['e-happy', 'e-calm', 'e-anxious', 'e-sad', 'e-hopeful', 'e-tired']);
});

test('every family and every finer word is a built-in emotion tag, each named once', () => {
  const named = EMOTION_FAMILIES.flatMap((f) => [f.key, ...f.finer]);
  expect(new Set(named).size).toBe(named.length);
  expect([...named].sort()).toEqual([...emotions].sort());
});

test('the families are happy, calm, anxious, sad, angry and tired; hopeful is a finer word under happy', () => {
  expect(EMOTION_FAMILIES.map((f) => f.key)).toEqual(['e-happy', 'e-calm', 'e-anxious', 'e-sad', 'e-angry', 'e-tired']);
  expect(familyOf('e-hopeful')).toBe('e-happy');
  expect(familyOf('e-happy')).toBeUndefined();
  expect(familyOf('own-tag-uuid')).toBeUndefined();
});

test('tapping an unpicked family picks it and opens it', () => {
  expect(tapFamily({ selected: ['a-work'], open: null }, 'e-anxious')).toEqual({ selected: ['a-work', 'e-anxious'], open: 'e-anxious' });
});

test('tapping a picked family that another family hides opens it without unpicking', () => {
  expect(tapFamily({ selected: ['e-anxious', 'e-worried'], open: 'e-sad' }, 'e-anxious'))
    .toEqual({ selected: ['e-anxious', 'e-worried'], open: 'e-anxious' });
  expect(tapFamily({ selected: ['e-anxious'], open: null }, 'e-anxious')).toEqual({ selected: ['e-anxious'], open: 'e-anxious' });
});

test('tapping a picked, open family unpicks it and its finer words, and closes it', () => {
  expect(tapFamily({ selected: ['a-work', 'e-anxious', 'e-worried', 'e-sad', 'e-lonely'], open: 'e-anxious' }, 'e-anxious'))
    .toEqual({ selected: ['a-work', 'e-sad', 'e-lonely'], open: null });
});

test('picking a finer word picks its family too; unpicking it leaves the family', () => {
  expect(toggleTag(['a-work'], 'e-overwhelmed')).toEqual(['a-work', 'e-overwhelmed', 'e-anxious']);
  expect(toggleTag(['e-anxious'], 'e-overwhelmed')).toEqual(['e-anxious', 'e-overwhelmed']);
  expect(toggleTag(['e-anxious', 'e-overwhelmed'], 'e-overwhelmed')).toEqual(['e-anxious']);
});

test('any other tag toggles on its own', () => {
  expect(toggleTag([], 'a-work')).toEqual(['a-work']);
  expect(toggleTag(['a-work'], 'a-work')).toEqual([]);
});
