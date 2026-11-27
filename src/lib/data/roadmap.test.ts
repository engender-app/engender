/* The roadmap's country pack. What is under test here is the pack structure, not the
   wording: a pack holds keys and a review date, and roadmapLabels.ts turns a key into text. */

import { readFileSync } from 'node:fs';
import { test, expect } from 'vitest';
import {
  BUILT_IN_GOALS,
  POLISH_PACK,
  ROADMAP_PACKS,
  SOCIAL_PACK,
  LEGACY_ROADMAP_TRACKS,
  isCutTrackGoal,
  INSTITUTIONS_REVIEWED_ON,
  POLISH_INSTITUTIONS,
  institutionList,
  institutionState,
  institutionsLeft,
  keptTick,
  ownStepsLeft,
  polishLegalStepsShown,
  roadmapList,
  roadmapStepsLeft,
  isBuiltInGoal,
  packKeyOf,
  socialGoalsInView,
  type RoadmapPack
} from './roadmap.ts';
import type { RoadmapGoalStatus } from './types.ts';

const allGoals = ROADMAP_PACKS.flatMap((pack) => pack.goals);

/* The social, presentational and medical tracks repeated other modules (milestones, voice,
   hair removal, tryouts) or were the most clinical text outside Care, so only the court
   procedure and its paperwork stay. */
test('the Polish pack holds the legal steps and nothing else', () => {
  expect(POLISH_PACK.goals.length).toBe(17);
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

/* The "Polish legal steps" switch: off in every language until somebody
   turns it on. The group is 721 of the 754
   words the Polish roadmap opened with, so it starts closed there too. */
test('the Polish legal steps stay closed until somebody answers the switch', () => {
  expect(polishLegalStepsShown(null)).toBe(false);
  // It used to take the locale and open for Polish; a locale passed by an
  // old caller must not open it again.
  expect((polishLegalStepsShown as (choice: boolean | null, locale?: string) => boolean)(null, 'pl')).toBe(false);
  expect(polishLegalStepsShown(true)).toBe(true);
  expect(polishLegalStepsShown(false)).toBe(false);
});

const CATEGORIES = [
  { id: 'k1', name: 'Coming out' },
  /* A category migration 111 made from a track cut before round two: its
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

/* The court application attaches a psychologist's and a doctor's opinion, and with the
   medical track gone no legal step named them. */
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

  expect(screen).toContain('polishLegalStepsShown(prefs.roadmapPolishStepsChoice)');
  expect(screen).toContain('roadmapList(pack, polishShown, customGoals, hiddenGoals, categories)');
  expect(screen).toContain('journal.roadmap.addCategory(');
  expect(screen).toContain('journal.roadmap.renameCategory(');
  // Through the Undo window (deleteUndo.ts).
  expect(screen).toContain('j.roadmap.deleteCategory(');
  expect(screen).not.toContain('<Segmented');
  expect(screen).not.toContain('data-track-toggle');
  expect(screen).toContain('prefs.roadmapMilestoneSyncEnabled = v');
});

/* After the ruling every institution is updated on its own, so the generic post-ruling
   steps became a list of institutions, each moved through submitted, waiting and done with
   a date. The six that were steps keep their keys, so paper filed against one before stays
   filed against it. */
test('the post-ruling goals are now institutions, and the legal steps keep the court procedure', () => {
  const steps = POLISH_PACK.goals.map((goal) => goal.key) as string[];
  const institutions = POLISH_INSTITUTIONS.map((one) => one.key) as string[];
  expect(institutions).toEqual([
    'pl-legal-pesel',
    'pl-legal-id-card',
    'pl-legal-passport',
    'pl-legal-driving-licence',
    'pl-legal-bank',
    'pl-legal-zus-ceidg',
    'pl-legal-employer',
    'pl-legal-diplomas'
  ]);
  for (const key of institutions) expect(steps).not.toContain(key);
  expect(steps).not.toContain('pl-legal-institutions');
  expect(steps).toContain('pl-legal-final-copy');
  expect(steps).toContain('pl-legal-name-usc');
  expect(new Set([...steps, ...institutions]).size).toBe(steps.length + institutions.length);
});

test('the institution list carries its own reviewed-on day for the release guard', () => {
  expect(INSTITUTIONS_REVIEWED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(Number.isNaN(Date.parse(INSTITUTIONS_REVIEWED_ON))).toBe(false);
});

const change = (id: string, institution: string, status: string, epochDay: number) => ({ id, institution, status, epochDay, note: null });

test('an institution with no change has not started, and otherwise stands where its latest dated change put it', () => {
  expect(institutionState([])).toEqual({ status: null, epochDay: null });
  /* Read oldest first, the order the journal returns. Two on one day: the
     one written later is the later change. */
  const changes = [change('a', 'x', 'submitted', 10), change('b', 'x', 'waiting', 12), change('c', 'x', 'done', 12)];
  expect(institutionState(changes)).toEqual({ status: 'done', epochDay: 12 });
  /* A change dated back before the others is history, not the present. */
  expect(institutionState([...changes, change('d', 'x', 'submitted', 5)])).toEqual({ status: 'done', epochDay: 12 });
});

test('the institutions show with the switch, hidden built-ins leave, and the person\'s own follow in the order made', () => {
  const own = [{ id: 'u1', name: 'Gym' }, { id: 'u2', name: 'Library' }];
  const on = institutionList(true, own, ['pl-legal-driving-licence']);
  expect(on.builtIns.map((one) => one.key)).toEqual(
    POLISH_INSTITUTIONS.map((one) => one.key).filter((key) => key !== 'pl-legal-driving-licence')
  );
  expect(on.own).toEqual(own);
  expect(institutionList(false, own, [])).toEqual({ builtIns: [], own: [] });
});

test('institutions left counts every one shown that is not done', () => {
  const list = institutionList(true, [{ id: 'u1', name: 'Gym' }], []);
  const changes = [change('a', 'pl-legal-pesel', 'done', 3), change('b', 'pl-legal-bank', 'waiting', 4), change('c', 'u1', 'done', 5)];
  expect(institutionsLeft(list, changes)).toBe(POLISH_INSTITUTIONS.length + 1 - 2);
});

/* A tick on a step that became an institution is history the institution
   does not read: it is dropped, and only a hidden flag carries over (the
   person said the step was not theirs to see). The generic "bank, insurers,
   clinic" step is gone entirely. */
test('a stored tick on a step that became an institution keeps only its hidden flag', () => {
  const tick = (goalKey: string, status: RoadmapGoalStatus, hidden: boolean) => ({ packKey: 'pl', goalKey, status, hidden });
  expect(keptTick(tick('pl-legal-court-fee', 'checked', false))).toEqual(tick('pl-legal-court-fee', 'checked', false));
  expect(keptTick(tick('pl-legal-passport', 'checked', false))).toBeNull();
  expect(keptTick(tick('pl-legal-passport', 'checked', true))).toEqual(tick('pl-legal-passport', 'unchecked', true));
  expect(keptTick(tick('pl-legal-institutions', 'unchecked', true))).toBeNull();
  expect(keptTick(tick('pl-social-tell-one-person', 'checked', false))).toBeNull();
});

test('the roadmap screen draws the institutions under the same switch, from the shared list', () => {
  const screen = readFileSync(new URL('../../routes/transition/roadmap/+page.svelte', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../../routes/transition/roadmap/Institutions.svelte', import.meta.url), 'utf8');
  expect(screen).toContain('<Institutions');
  expect(screen).toContain('shown={polishShown}');
  expect(panel).toContain('institutionList(shown, own, hiddenGoals)');
  expect(panel).toContain('journal.roadmap.addInstitutionChange(');
  expect(panel).toContain('<LinkedDocuments kind="goal" {id} />');
});

/* Pre-release human a built-in social and presentation group beside the Polish legal one.
   It is not Polish content, so it is a pack of its own: a tick names pack 'social', and
   nothing here carries a review date because nothing in it is a legal claim. */
test('the social group is eight plain steps in a pack of its own, named like no cut track', () => {
  expect(SOCIAL_PACK.key).toBe('social');
  expect(SOCIAL_PACK.goals.length).toBe(8);
  for (const goal of SOCIAL_PACK.goals) {
    expect(goal.key.startsWith('social-')).toBe(true);
    // isCutTrackGoal drops ticks by key prefix: a new step must never match it.
    expect(isCutTrackGoal(goal.key)).toBe(false);
  }
  expect(ROADMAP_PACKS.some((pack) => (pack.key as string) === SOCIAL_PACK.key)).toBe(false);
});

test('every built-in goal key is unique across the legal and social groups, and maps back to its pack', () => {
  const keys = BUILT_IN_GOALS.map((goal) => goal.key);
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys.length).toBe(POLISH_PACK.goals.length + SOCIAL_PACK.goals.length);
  expect(packKeyOf('pl-legal-court-fee')).toBe('pl');
  expect(packKeyOf('social-family')).toBe('social');
  expect(isBuiltInGoal('social-voice')).toBe(true);
  expect(isBuiltInGoal('pl-legal-appeal')).toBe(true);
  expect(isBuiltInGoal('pl-social-tell-one-person')).toBe(false);
});

test('a stored tick on a social step is kept whole, hidden flag included', () => {
  const tick = { packKey: 'social', goalKey: 'social-family', status: 'checked', hidden: true };
  expect(keptTick(tick)).toEqual(tick);
});

test('the social group shows with its switch, hidden steps leave it, and the count follows', () => {
  expect(socialGoalsInView(false, []).length).toBe(0);
  expect(socialGoalsInView(true, []).map((goal) => goal.key)).toEqual(SOCIAL_PACK.goals.map((goal) => goal.key));
  const trimmed = socialGoalsInView(true, ['social-voice', 'pl-legal-appeal']);
  expect(trimmed.some((goal) => goal.key === 'social-voice')).toBe(false);
  expect(trimmed.length).toBe(SOCIAL_PACK.goals.length - 1);
});

test('the roadmap screen draws the social group behind its own switch', () => {
  const screen = readFileSync(new URL('../../routes/transition/roadmap/+page.svelte', import.meta.url), 'utf8');
  expect(screen).toContain('prefs.roadmapSocialStepsShown');
  expect(screen).toContain('socialGoalsInView(prefs.roadmapSocialStepsShown, hiddenGoals)');
  expect(screen).toContain('data-roadmap-social');
});
