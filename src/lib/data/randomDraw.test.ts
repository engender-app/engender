/* The random draw (phase 8 features ticket 08). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { drawRandomEntry } from './randomDraw.ts';
import type { Entry } from './types.ts';

const entry = (id: number): Entry => ({
  id,
  epochDay: 100,
  timestamp: 1,
  mood: 3,
  note: `entry ${id}`,
  dims: {},
  tags: [],
  photos: [],
  recordings: [],
  videos: [],
  bodyRegions: {},
  starred: false,
  presentationId: null
});

test('drawing from an empty set finds nothing', () => {
  assert.equal(drawRandomEntry([], new Set()), null);
});

test('a draw always picks an entry present in the hits', () => {
  const hits = [entry(1), entry(2), entry(3)];
  const draw = drawRandomEntry(hits, new Set(), () => 0.5);
  assert.ok(hits.some((e) => e.id === draw!.entry.id));
});

test('does not repeat until every entry has been drawn', () => {
  const hits = [entry(1), entry(2), entry(3)];
  let drawnIds = new Set<number>();
  const seen: number[] = [];

  // A fixed sequence of random() values, always picking from whatever the
  // remaining pool happens to be at that point.
  const randoms = [0, 0, 0];
  for (const r of randoms) {
    const draw = drawRandomEntry(hits, drawnIds, () => r)!;
    assert.ok(!seen.includes(draw.entry.id), 'repeated an entry before the set was exhausted');
    seen.push(draw.entry.id);
    drawnIds = draw.drawnIds;
  }
  assert.equal(seen.length, 3);
});

test('resets and draws again once the set is exhausted', () => {
  const hits = [entry(1), entry(2)];
  let drawnIds = new Set<number>();
  drawnIds = drawRandomEntry(hits, drawnIds, () => 0)!.drawnIds;
  drawnIds = drawRandomEntry(hits, drawnIds, () => 0.9)!.drawnIds;
  assert.equal(drawnIds.size, 2, 'both entries drawn, the set is exhausted');

  // A third draw resets rather than finding nothing to pick from.
  const third = drawRandomEntry(hits, drawnIds, () => 0)!;
  assert.ok(hits.some((e) => e.id === third.entry.id));
  assert.equal(third.drawnIds.size, 1, 'the reset set holds only the entry just drawn');
});

test('a single entry keeps drawing itself rather than erroring', () => {
  const hits = [entry(1)];
  let drawnIds = new Set<number>();
  for (let i = 0; i < 3; i++) {
    const draw = drawRandomEntry(hits, drawnIds, () => 0)!;
    assert.equal(draw.entry.id, 1);
    drawnIds = draw.drawnIds;
  }
});
