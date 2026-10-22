/* The roadmap's country pack (phase 4 ticket 23, trimmed to the legal track
   by functional audit ticket 34). What is under test here is the pack
   structure, not the wording: a pack holds keys and a review date, and
   roadmapLabels.ts turns a key into text. */

import { readFileSync } from 'node:fs';
import { test, expect } from 'vitest';
import {
  POLISH_PACK,
  ROADMAP_PACKS,
  LEGACY_ROADMAP_TRACKS,
  isCutTrackGoal,
  ownStepsLeft,
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
  expect(POLISH_PACK.goals.length).toBe(24);
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

  expect(roadmapList(stub, true, [], [], []).goals.map((goal) => goal.key)).toEqual(['xx-legal-first', 'xx-legal-second']);
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

const CATEGORIES = [
  { id: 'k1', name: 'Coming out' },
  /* A category migration 98 made from a track cut before round two: its
     uuid is the old track key and its name is empty until somebody gives it
     one, so the screen says the old track's name in the current language. */
  { id: 'medical', name: '' },
  { id: 'k2', name: 'Nothing here yet' }
];

const CUSTOM = [
  { id: 'c1', track: 'medical', text: 'Ask about a second opinion', status: 'unchecked' as const },
  { id: 'c2', track: 'k1', text: 'Come out to my book club', status: 'checked' as const },
  { id: 'c3', track: 'legal', text: 'Find a notary', status: 'unchecked' as const },
  { id: 'c4', track: 'k1', text: 'Tell my sister', status: 'unchecked' as const }
];

test('with the switch on, the legal group is the whole pack and the goals added to it', () => {
  const list = roadmapList(POLISH_PACK, true, CUSTOM, [], CATEGORIES);
  expect(list.goals.map((goal) => goal.key)).toEqual(POLISH_PACK.goals.map((goal) => goal.key));
  expect(list.legalGoals.map((goal) => goal.id)).toEqual(['c3']);
});

test('every category of the person shows with its own goals, an empty one included, in the order made', () => {
  const list = roadmapList(POLISH_PACK, true, CUSTOM, [], CATEGORIES);
  expect(list.categories.map(({ category, goals }) => [category.id, goals.map((goal) => goal.id)])).toEqual([
    ['k1', ['c2', 'c4']],
    ['medical', ['c1']],
    ['k2', []]
  ]);
});

test('with the switch off, no Polish step shows and the person\'s categories are untouched', () => {
  const on = roadmapList(POLISH_PACK, true, CUSTOM, [], CATEGORIES);
  const off = roadmapList(POLISH_PACK, false, CUSTOM, [], CATEGORIES);
  expect(off.goals).toEqual([]);
  expect(off.legalGoals).toEqual([]);
  expect(off.categories).toEqual(on.categories);
});

test('hidden built-in goals leave the list and the remaining count', () => {
  const key = 'pl-legal-court-fee';
  const before = roadmapList(POLISH_PACK, true, CUSTOM, [], CATEGORIES);
  const after = roadmapList(POLISH_PACK, true, CUSTOM, [key], CATEGORIES);
  expect(after.goals.some((goal) => goal.key === key)).toBe(false);
  expect(after.legalGoals).toEqual(before.legalGoals);
  expect(roadmapStepsLeft(after, () => 'unchecked')).toBe(roadmapStepsLeft(before, () => 'unchecked') - 1);
});

test('steps left counts the legal group, built-ins and own goals, and not-my-path resolves one', () => {
  const list = roadmapList(POLISH_PACK, true, CUSTOM, [], CATEGORIES);
  const statuses: Record<string, RoadmapGoalStatus> = { 'pl-legal-court-fee': 'checked', 'pl-legal-appeal': 'not-my-path' };
  expect(roadmapStepsLeft(list, (key) => statuses[key] ?? 'unchecked')).toBe(POLISH_PACK.goals.length - 2 + 1);
  expect(ownStepsLeft(list.categories[0].goals)).toBe(1);
  expect(ownStepsLeft(list.categories[2].goals)).toBe(0);
});

test('a track cut before round two is a legacy category key, and nothing else is', () => {
  expect([...LEGACY_ROADMAP_TRACKS]).toEqual(['social', 'presentational', 'medical']);
});

/* Functional audit ticket 34 (decided by Alicja on 2026-10-22): the court
   application attaches a psychologist's and a doctor's opinion, and with
   the medical track gone no legal step named them. */
test("the legal steps name the psychologist's and doctor's opinions, just before the application", () => {
  const keys = POLISH_PACK.goals.map((goal) => goal.key) as string[];
  expect(keys).toContain('pl-legal-opinions');
  expect(keys.indexOf('pl-legal-opinions')).toBe(keys.indexOf('pl-legal-application') - 1);
});

test('the roadmap screen draws the legal group and the person\'s categories, gated by the switch', () => {
  /* Read as source rather than mounted: what is under test is where the
     screen gets its rows from. A screen filtering the pack for itself could
     show a Polish step with the switch off and no test above would notice. */
  const screen = readFileSync(new URL('../../routes/transition/roadmap/+page.svelte', import.meta.url), 'utf8');

  expect(screen).toContain('polishLegalStepsShown(prefs.roadmapPolishStepsChoice, getLocale())');
  expect(screen).toContain('roadmapList(pack, polishShown, customGoals, hiddenGoals, categories)');
  expect(screen).toContain('journal.roadmap.addCategory(');
  expect(screen).toContain('journal.roadmap.renameCategory(');
  expect(screen).toContain('journal.roadmap.deleteCategory(');
  expect(screen).not.toContain('<Segmented');
  expect(screen).not.toContain('data-track-toggle');
  expect(screen).toContain('prefs.roadmapMilestoneSyncEnabled = v');
});
