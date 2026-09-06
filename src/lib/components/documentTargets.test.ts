/* The picker's ordering rule (phase 8 features ticket 56). Here rather than
   beside the component because the reactive half is a `.svelte.ts` a node
   test cannot compile; this is the part worth pinning either way. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { documentTargetHref, orderedSections, type TargetSection } from './documentTargets.ts';

const sections = (): TargetSection[] => [
  { kind: 'milestone', heading: 'Milestones', rows: [{ id: 'm1', title: 'HRT start' }] },
  { kind: 'procedure', heading: 'Surgery', rows: [] },
  { kind: 'episode', heading: 'Regimen', rows: [{ id: 'e1', title: 'estradiol' }] },
  {
    kind: 'goal',
    heading: 'Roadmap',
    rows: [
      { id: 'g1', title: 'The first person you tell' },
      { id: 'g2', title: 'Keep every opinion' },
      { id: 'g3', title: 'The court fee' }
    ]
  }
];

test('a kind with nothing in it is dropped rather than headed over an empty card', () => {
  assert.deepEqual(
    orderedSections(sections(), null).map((section) => section.kind),
    ['milestone', 'episode', 'goal']
  );
});

test('with no link, the sections keep their own order and so do their rows', () => {
  const [, , goals] = orderedSections(sections(), null);
  assert.deepEqual(
    goals.rows.map((row) => row.id),
    ['g1', 'g2', 'g3']
  );
});

test("the linked kind comes first, with the linked row at the top of it", () => {
  const ordered = orderedSections(sections(), { kind: 'goal', id: 'g2' });
  assert.deepEqual(
    ordered.map((section) => section.kind),
    ['goal', 'milestone', 'episode']
  );
  assert.deepEqual(
    ordered[0].rows.map((row) => row.id),
    ['g2', 'g1', 'g3'],
    'only the linked row moves; the rest keep their order'
  );
});

test('a link whose target is gone pins nothing and still leads with its kind', () => {
  const ordered = orderedSections(sections(), { kind: 'episode', id: 'e-gone' });
  assert.equal(ordered[0].kind, 'episode');
  assert.deepEqual(
    ordered[0].rows.map((row) => row.id),
    ['e1']
  );
});

test('each kind has a screen to open, and a goal carries its own key', () => {
  assert.equal(documentTargetHref({ kind: 'milestone', id: 'm1' }), '/transition/milestones');
  assert.equal(documentTargetHref({ kind: 'procedure', id: 'p1' }), '/health/surgery');
  assert.equal(documentTargetHref({ kind: 'episode', id: 'e1' }), '/settings/regimen');
  assert.equal(
    documentTargetHref({ kind: 'goal', id: 'pl-medical-keep-opinions' }),
    '/transition/roadmap?goal=pl-medical-keep-opinions'
  );
});
