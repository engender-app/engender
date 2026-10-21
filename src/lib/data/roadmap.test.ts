/* The roadmap's country pack (phase 4 ticket 23, trimmed to the legal track
   by functional audit ticket 34). What is under test here is the pack
   structure, not the wording: a pack holds keys and a review date, and
   roadmapLabels.ts turns a key into text. */

import { readFileSync } from 'node:fs';
import { test, expect } from 'vitest';
import {
  POLISH_PACK,
  ROADMAP_PACKS,
  isCutTrackGoal,
  polishLegalStepsShown,
  roadmapList,
  roadmapStepsLeft,
  type RoadmapPack
} from './roadmap.ts';
import type { RoadmapGoalStatus } from './types.ts';

const allGoals = ROADMAP_PACKS.flatMap((pack) => pack.goals);

/* Functional audit ticket 34: the social, presentational and medical tracks
   repeated other modules (milestones, voice, hair removal, tryouts) or were
   the most clinical text outside Care, so only the court procedure and its
   paperwork stay. */
test('the Polish pack holds the legal steps and nothing else', () => {
  expect(POLISH_PACK.goals.length).toBe(23);
  for (const goal of POLISH_PACK.goals) expect(goal.key.startsWith('pl-legal-')).toBe(true);
  expect(POLISH_PACK.goals[0].key).toBe('pl-legal-birth-certificate');
  expect(POLISH_PACK.goals.at(-1)!.key).toBe('pl-legal-document-set');
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

/* The review date is recorded alongside the content rather than left
   implicit, because Polish gender-recognition procedure changes with
   legislation. */
test('every pack records the date its content was reviewed, as a plain ISO day', () => {
  for (const pack of ROADMAP_PACKS) {
    expect(pack.reviewedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(pack.reviewedOn))).toBe(false);
  }
});

/* Bundled and fully offline. A pack that survives a JSON round trip
   unchanged is inert data compiled into the bundle - no lazy getter, no
   promise, nothing that could reach for the network when a screen reads
   it. */
test('a pack is inert data, so reading it can never fetch anything', () => {
  expect(JSON.parse(JSON.stringify(POLISH_PACK))).toEqual(POLISH_PACK);
});

/* A second country's pack is content alone: the journal stores a tick
   against whatever pack key it is handed (roadmap.ts in journal/). */
test('a second pack satisfies the same shape without any change to it', () => {
  const stub = {
    key: 'xx',
    reviewedOn: '2026-01-31',
    goals: [{ key: 'xx-legal-first' }, { key: 'xx-legal-second' }]
  } satisfies RoadmapPack;

  expect(roadmapList(stub, true, [], []).goals.map((goal) => goal.key)).toEqual(['xx-legal-first', 'xx-legal-second']);
});

test('a stored tick is cut only when it names one of the three dropped tracks', () => {
  expect(isCutTrackGoal('pl-social-tell-one-person')).toBe(true);
  expect(isCutTrackGoal('pl-presentational-voice')).toBe(true);
  expect(isCutTrackGoal('pl-medical-bloodwork')).toBe(true);
  expect(isCutTrackGoal('pl-legal-court-fee')).toBe(false);
  // A legal key an earlier pack used (the rc.1 fixture holds one) is kept.
  expect(isCutTrackGoal('pl-legal-court-file')).toBe(false);
});

/* The "Polish legal steps" switch: on by default for the Polish locale and
   off otherwise, and an explicit answer wins over the locale either way. */
test('the Polish legal steps follow the locale until somebody answers the switch', () => {
  expect(polishLegalStepsShown(null, 'pl')).toBe(true);
  expect(polishLegalStepsShown(null, 'en')).toBe(false);
  expect(polishLegalStepsShown(true, 'en')).toBe(true);
  expect(polishLegalStepsShown(false, 'pl')).toBe(false);
});

const CUSTOM = [
  /* Tracks a custom goal was filed under before the trim. They stay what the
     person wrote, so the list carries them whatever track they name. */
  { id: 'c1', track: 'medical', text: 'Ask about a second opinion', status: 'unchecked' as const },
  { id: 'c2', track: 'social', text: 'Come out to my book club', status: 'checked' as const },
  { id: 'c3', track: 'legal', text: 'Find a notary', status: 'unchecked' as const }
];

test('with the switch on, the list is the whole pack and every custom goal', () => {
  const list = roadmapList(POLISH_PACK, true, CUSTOM, []);
  expect(list.goals.map((goal) => goal.key)).toEqual(POLISH_PACK.goals.map((goal) => goal.key));
  expect(list.customGoals).toEqual(CUSTOM);
});

test('with the switch off, no Polish step shows and custom goals are untouched', () => {
  const list = roadmapList(POLISH_PACK, false, CUSTOM, []);
  expect(list.goals).toEqual([]);
  expect(list.customGoals).toEqual(CUSTOM);
});

test('hidden built-in goals leave the list and the remaining count', () => {
  const key = 'pl-legal-court-fee';
  const before = roadmapList(POLISH_PACK, true, CUSTOM, []);
  const after = roadmapList(POLISH_PACK, true, CUSTOM, [key]);
  expect(after.goals.some((goal) => goal.key === key)).toBe(false);
  expect(after.customGoals).toEqual(before.customGoals);
  expect(roadmapStepsLeft(after, () => 'unchecked')).toBe(roadmapStepsLeft(before, () => 'unchecked') - 1);
});

test('steps left counts unchecked built-ins and custom goals, and not-my-path resolves one', () => {
  const list = roadmapList(POLISH_PACK, true, CUSTOM, []);
  const statuses: Record<string, RoadmapGoalStatus> = { 'pl-legal-court-fee': 'checked', 'pl-legal-appeal': 'not-my-path' };
  expect(roadmapStepsLeft(list, (key) => statuses[key] ?? 'unchecked')).toBe(POLISH_PACK.goals.length - 2 + 2);
  expect(roadmapStepsLeft(roadmapList(POLISH_PACK, false, CUSTOM, []), () => 'checked')).toBe(2);
});

test('the roadmap screen draws one list, gated by the switch, with no track picker', () => {
  /* Read as source rather than mounted: what is under test is where the
     screen gets its rows from. A screen filtering the pack for itself could
     show a Polish step with the switch off and no test above would notice. */
  const screen = readFileSync(new URL('../../routes/transition/roadmap/+page.svelte', import.meta.url), 'utf8');

  expect(screen).toContain('polishLegalStepsShown(prefs.roadmapPolishStepsChoice, getLocale())');
  expect(screen).toContain('roadmapList(pack, polishShown, customGoals, hiddenGoals)');
  expect(screen).not.toContain('<Segmented');
  expect(screen).not.toContain('data-track-toggle');
  expect(screen).toContain('prefs.roadmapMilestoneSyncEnabled = v');
});
