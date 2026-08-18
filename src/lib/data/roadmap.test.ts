/* The roadmap's tracks and its country packs (phase 4 ticket 23). What is
   under test here is the pack structure, not the wording: a pack holds
   keys and a review date, and roadmapLabels.ts turns a key into text. */

import { test, expect } from 'vitest';
import {
  POLISH_PACK,
  ROADMAP_PACKS,
  ROADMAP_TRACKS,
  goalsInTrack,
  type RoadmapPack
} from './roadmap.ts';

const allGoals = ROADMAP_PACKS.flatMap((pack) => pack.goals);

test('there are exactly the four tracks the ticket names', () => {
  expect([...ROADMAP_TRACKS]).toEqual(['social', 'legal', 'presentational', 'medical']);
});

test('every goal sits in one of the four tracks and carries a key', () => {
  for (const goal of allGoals) {
    expect(ROADMAP_TRACKS).toContain(goal.track);
    expect(goal.key.length).toBeGreaterThan(0);
  }
});

/* Goal keys have to be unique across packs, not just within one: the
   labels are one map over every bundled key, and a stored tick names a
   pack and a goal, so two packs reusing a key would read as one goal in
   the wording and two in the journal. */
test('goal keys are unique across every bundled pack, and prefixed with their pack', () => {
  const keys = allGoals.map((goal) => goal.key);
  expect(new Set(keys).size).toBe(keys.length);

  for (const pack of ROADMAP_PACKS) {
    for (const goal of pack.goals) {
      expect(goal.key.startsWith(`${pack.key}-`)).toBe(true);
    }
  }
});

test('the Polish pack populates all four tracks', () => {
  for (const track of ROADMAP_TRACKS) {
    expect(goalsInTrack(POLISH_PACK, track).length).toBeGreaterThan(0);
  }
});

test('goalsInTrack keeps the pack own order, which is the order of the procedure', () => {
  const legal = goalsInTrack(POLISH_PACK, 'legal').map((goal) => goal.key);
  const asBundled = POLISH_PACK.goals.filter((goal) => goal.track === 'legal').map((goal) => goal.key);

  expect(legal).toEqual(asBundled);
});

/* Acceptance box 4: the review date is recorded alongside the content
   rather than left implicit, because Polish gender-recognition procedure
   changes with legislation. */
test('every pack records the date its content was reviewed, as a plain ISO day', () => {
  for (const pack of ROADMAP_PACKS) {
    expect(pack.reviewedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(pack.reviewedOn))).toBe(false);
  }
});

/* Acceptance box 2: bundled and fully offline. A pack that survives a
   JSON round trip unchanged is inert data compiled into the bundle - no
   lazy getter, no promise, nothing that could reach for the network when
   a screen reads it. */
test('a pack is inert data, so reading it can never fetch anything', () => {
  expect(JSON.parse(JSON.stringify(POLISH_PACK))).toEqual(POLISH_PACK);
});

/* Acceptance box 3: a second country's pack is content alone. Nothing
   here is Polish-specific, and the stub below never touches the schema -
   the journal stores a tick against whatever pack key it is handed
   (roadmap.ts in journal/). */
test('a second pack satisfies the same shape without any change to it', () => {
  const stub = {
    key: 'xx',
    reviewedOn: '2026-01-31',
    goals: [
      { key: 'xx-social-first', track: 'social' },
      { key: 'xx-legal-first', track: 'legal' }
    ]
  } satisfies RoadmapPack;

  expect(goalsInTrack(stub, 'legal').map((goal) => goal.key)).toEqual(['xx-legal-first']);
  expect(goalsInTrack(stub, 'medical')).toEqual([]);
});
