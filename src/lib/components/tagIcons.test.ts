/* Tag icons (pre-release-human 22). */

import { test, expect } from 'vitest';
import { BUILT_IN_TAG_GROUPS } from '../data/vocabulary/builtins';
import { BUILT_IN_TAG_ICONS, TAG_ICON_NAMES, tagIconOf, tagIconSvg } from './tagIcons';

test('the set a person picks from is 120 distinct names, each with path data', () => {
  expect(TAG_ICON_NAMES.length).toBe(120);
  expect(new Set(TAG_ICON_NAMES).size).toBe(120);
  for (const name of TAG_ICON_NAMES) expect(tagIconSvg(name)).toMatch(/^<svg[\s\S]*<(path|circle|rect|line|polyline|ellipse|polygon) /);
});

test('every built-in tag wears an icon from that set', () => {
  const names = new Set<string>(TAG_ICON_NAMES);
  for (const id of BUILT_IN_TAG_GROUPS.flatMap((g) => [...g.tags])) {
    expect(names.has(BUILT_IN_TAG_ICONS[id]), id).toBe(true);
  }
});

test('a built-in takes its icon from this build; an own tag wears what it stores, or none', () => {
  expect(tagIconOf({ id: 'e-anxious', builtIn: true })).toBe('tornado');
  expect(tagIconOf({ id: 'e-anxious', builtIn: true, icon: 'bike' })).toBe('tornado');
  expect(tagIconOf({ id: 'uuid-1', builtIn: false, icon: 'bike' })).toBe('bike');
  expect(tagIconOf({ id: 'uuid-1', builtIn: false })).toBeUndefined();
});

test('no icon and a name this build lacks both draw nothing', () => {
  expect(tagIconSvg(undefined)).toBe('');
  expect(tagIconSvg('from-a-later-release')).toBe('');
});
