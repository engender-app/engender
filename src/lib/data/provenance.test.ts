/* The provenance line's own decisions (phase 5 deepening ticket 22): which
   of a milestone's three links wins, what a since-cleared or since-stale
   one renders as, and a reminder's auto_source read the same way. */

import assert from 'node:assert/strict';
import { test, vi } from 'vitest';

// $lib has no alias on the plain node tier (vitest.config.ts) - real
// messages, reached by the relative path everything else on this tier
// uses, rather than a hand-written fake that could drift from the actual
// English copy this test means to pin down.
vi.mock('$lib/paraglide/messages', async () => await import('../paraglide/messages.js'));

import type { Milestone, Reminder } from './types.ts';

const { resolveMilestoneOrigin, resolveReminderOrigin } = await import('./provenance.ts');

const milestone = (overrides: Partial<Milestone> = {}): Milestone => ({
  id: 'm-1',
  name: 'A milestone',
  epochDay: 20000,
  description: '',
  templateKey: null,
  roadmapGoalKey: null,
  procedureId: null,
  tryoutId: null,
  procedureName: null,
  tryoutLabel: null,
  customRoadmapGoalText: null,
  photo: null,
  ...overrides
});

const reminder = (overrides: Partial<Reminder> = {}): Reminder => ({
  id: 'r-1',
  title: 'Estradiol',
  type: 'med',
  time: '09:00',
  recurrence: null,
  interval: null,
  anchorEpochDay: null,
  epochDay: 20000,
  enabled: true,
  autoSource: null,
  ...overrides
});

test('a hand-written milestone carries no provenance', () => {
  assert.equal(resolveMilestoneOrigin(milestone()), null);
});

test('a milestone linked to a procedure names it and links to the surgery journey screen', () => {
  const origin = resolveMilestoneOrigin(milestone({ procedureId: 'p-1', procedureName: 'Top surgery' }));
  assert.deepEqual(origin, { text: 'From your surgery journey: Top surgery', href: '/settings/surgery' });
});

test('a milestone linked to a built-in roadmap goal names the goal and links to the roadmap screen', () => {
  const origin = resolveMilestoneOrigin(milestone({ roadmapGoalKey: 'pl-legal-id-card' }));
  assert.equal(origin?.href, '/settings/roadmap');
  assert.ok(origin?.text.startsWith('From your roadmap: '));
});

test('a milestone linked to a custom roadmap goal reads its own text, not the built-in table', () => {
  const origin = resolveMilestoneOrigin(
    milestone({ roadmapGoalKey: 'custom-goal-uuid', customRoadmapGoalText: 'Tell my sister' })
  );
  assert.deepEqual(origin, { text: 'From your roadmap: Tell my sister', href: '/settings/roadmap' });
});

test('a roadmap goal key that resolves to nothing degrades to the shared honest fallback, not a dangling reference', () => {
  const origin = resolveMilestoneOrigin(milestone({ roadmapGoalKey: 'not-a-real-goal-key' }));
  assert.deepEqual(origin, { text: "From something that's since been removed.", href: null });
});

test('a milestone adopted from a tryout names it and links to that tryout', () => {
  const origin = resolveMilestoneOrigin(milestone({ tryoutId: 't-1', tryoutLabel: 'Alicja' }));
  assert.deepEqual(origin, { text: 'From adopting Alicja', href: '/settings/tryouts/t-1' });
});

test('a procedure link takes precedence over a roadmap or tryout link on the same row', () => {
  const origin = resolveMilestoneOrigin(
    milestone({ procedureId: 'p-1', procedureName: 'Top surgery', roadmapGoalKey: 'pl-legal-id-card', tryoutId: 't-1' })
  );
  assert.equal(origin?.href, '/settings/surgery');
});

test('a reminder nobody has touched has no provenance', () => {
  assert.equal(resolveReminderOrigin(reminder()), null);
});

test("a reminder taken over by its own edit reads as ordinary - the editor already cleared autoSource, so there's nothing left to distinguish it", () => {
  assert.equal(resolveReminderOrigin(reminder({ autoSource: null })), null);
});

test('a stock-managed reminder names the drug, explains the handoff, and links to stock', () => {
  const origin = resolveReminderOrigin(reminder({ autoSource: 'stock:Estradiol' }));
  assert.deepEqual(origin, {
    text: 'Kept in step with your Estradiol stock.',
    hint: "Edit it, and it's yours to manage from here on.",
    href: '/settings/stock',
    actionLabel: 'View stock'
  });
});

test('a wear-session reminder is recognised too, not just stock - the same auto_source column carries both', () => {
  const origin = resolveReminderOrigin(reminder({ autoSource: 'wear:session-1' }));
  assert.deepEqual(origin, {
    text: 'Set from a wear session you logged.',
    hint: "Edit it, and it's yours to manage from here on.",
    href: '/settings/wear',
    actionLabel: 'View wear log'
  });
});
