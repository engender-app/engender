/* The roadmap's tracks and its country packs (phase 4 ticket 23). What is
   under test here is the pack structure, not the wording: a pack holds
   keys and a review date, and roadmapLabels.ts turns a key into text. */

import { readFileSync } from 'node:fs';
import { test, expect } from 'vitest';
import {
  POLISH_PACK,
  ROADMAP_PACKS,
  ROADMAP_TRACKS,
  goalsInTrack,
  roadmapSections,
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

/* Acceptance box 2 (phase 5 ticket 43): every goal carries a hand-authored
   lean, not left undefined by an incomplete pack entry. */
test('every goal carries a lean of femme, masc, or neutral', () => {
  for (const goal of allGoals) {
    expect(['femme', 'masc', 'neutral']).toContain(goal.lean);
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
      { key: 'xx-social-first', track: 'social', lean: 'neutral' },
      { key: 'xx-legal-first', track: 'legal', lean: 'neutral' }
    ]
  } satisfies RoadmapPack;

  expect(goalsInTrack(stub, 'legal').map((goal) => goal.key)).toEqual(['xx-legal-first']);
  expect(goalsInTrack(stub, 'medical')).toEqual([]);
});

/* "Not my path" at track grain (phase 8 features ticket 49 item 5). The
   fold has to be driven off ROADMAP_TRACKS rather than off a list the
   screen keeps for itself, or a fifth track would arrive un-foldable and
   nothing would say so - which is what the first test below is for. It runs
   the real `roadmapSections` over every track the app declares, so it grows
   with that list instead of restating it. */

const CUSTOM = [
  { id: 'c1', track: 'medical', text: 'Ask about a second opinion' },
  { id: 'c2', track: 'social', text: 'Come out to my book club' }
];

/** The rule itself, so it can be run against something other than the real
    fold - the same shape textSearch.test.ts's coverage tests use. Returns
    the tracks the fold got wrong: one it failed to declare at all, one it
    failed to fold when dismissed, or one it folded that nobody dismissed. */
const unfoldableTracks = (fold: typeof roadmapSections): string[] =>
  ROADMAP_TRACKS.filter((track) => {
    const sections = fold(POLISH_PACK, CUSTOM, [track]);
    const dismissed = sections.find((section) => section.track === track);
    if (!dismissed) return true;
    if (!dismissed.dismissed || dismissed.goals.length > 0 || dismissed.customGoals.length > 0) return true;
    /* And only that one. A fold reaching past its own track would be the
       worse bug of the two: it would hide work somebody is doing. */
    return sections.some((section) => section.track !== track && section.dismissed);
  });

test('every track the app declares is folded by the same rule, with none left out', () => {
  expect(unfoldableTracks(roadmapSections)).toEqual([]);

  for (const track of ROADMAP_TRACKS) {
    const sections = roadmapSections(POLISH_PACK, CUSTOM, [track]);
    for (const other of sections.filter((section) => section.track !== track)) {
      expect(other.goals).toEqual(goalsInTrack(POLISH_PACK, other.track));
      expect(other.customGoals).toEqual(CUSTOM.filter((goal) => goal.track === other.track));
    }
  }
});

test('the roadmap screen draws its tracks through the fold rather than from its own list', () => {
  /* The half of box 5 the two tests around this one cannot reach. Nobody
     would break the fold by editing `roadmapSections`, which walks
     ROADMAP_TRACKS and so folds a fifth track for free. The way a fifth
     track would actually arrive un-foldable is a screen keeping its own
     list of tracks - which is exactly what this screen used to do, an
     `{#each ROADMAP_TRACKS}` with the goals filtered inline - so what has
     to hold is that it no longer can.

     Read as source rather than mounted, the way ClinicianSummaryDossier's
     own contract tests read theirs: what is under test is where the screen
     gets its tracks from, and a render would answer that only for the
     tracks that happen to exist today. */
  const screen = readFileSync(
    new URL('../../routes/transition/roadmap/+page.svelte', import.meta.url),
    'utf8'
  );

  expect(screen).toContain('roadmapSections(pack, customGoals, dismissedTracks)');
  expect(screen).toContain('{#each sections as section');
  expect(screen).not.toMatch(/\{#each ROADMAP_TRACKS/);
  // And it must not re-derive a track's goals beside the fold that just did.
  expect(screen).not.toMatch(/goalsInTrack\(/);
  expect(screen).not.toMatch(/customGoals\.filter\(/);
});

test('a fold that knows about one track fewer fails the rule the real one passes', () => {
  /* The proof that the test above can fail. This stands in for the way a
     fifth track would actually arrive broken: not by anybody editing
     `roadmapSections`, but by a screen or a helper keeping its own list of
     tracks and never being told about the new one. */
  const short: typeof roadmapSections = (pack, customGoals, dismissedTracks) =>
    roadmapSections(pack, customGoals, dismissedTracks).filter((section) => section.track !== 'medical');

  expect(unfoldableTracks(short)).toEqual(['medical']);
});

test('with nothing dismissed the sections carry the whole pack, goal for goal', () => {
  const sections = roadmapSections(POLISH_PACK, CUSTOM, []);

  expect(sections.every((section) => !section.dismissed)).toBe(true);
  expect(sections.flatMap((section) => section.goals.map((goal) => goal.key)).sort()).toEqual(
    POLISH_PACK.goals.map((goal) => goal.key).sort()
  );
  expect(sections.flatMap((section) => section.customGoals)).toHaveLength(CUSTOM.length);
});

test('several tracks can be dismissed at once, and each still names itself', () => {
  const sections = roadmapSections(POLISH_PACK, CUSTOM, ['legal', 'medical']);

  expect(sections.filter((section) => section.dismissed).map((section) => section.track)).toEqual(['legal', 'medical']);
  expect(sections.flatMap((section) => section.goals).some((goal) => goal.track === 'legal')).toBe(false);
  expect(sections.flatMap((section) => section.goals).some((goal) => goal.track === 'social')).toBe(true);
});

test('a stored dismissal naming a track this build does not have folds nothing', () => {
  // The same no-cleanup-job property a mute naming a deleted era has: the
  // stored row is never the name of anything ROADMAP_TRACKS still lists.
  const sections = roadmapSections(POLISH_PACK, CUSTOM, ['financial']);
  expect(sections.some((section) => section.dismissed)).toBe(false);
});
