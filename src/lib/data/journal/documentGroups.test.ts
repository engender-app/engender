/* The documents index's grouping rule (phase 10 redesign ticket 58). */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { groupDocumentsByTarget } from './documentGroups.ts';
import type { JournalDocument } from '../types.ts';

let nextId = 0;
const doc = (fields: Partial<JournalDocument> = {}): JournalDocument => ({
  id: fields.id ?? `d${nextId++}`,
  epochDay: fields.epochDay ?? 20000,
  title: fields.title ?? 'Referral',
  fileName: fields.fileName ?? 'f.jpg',
  targetKind: fields.targetKind ?? null,
  targetId: fields.targetId ?? null
});

test('a document with no link lands in its own group, last', () => {
  const groups = groupDocumentsByTarget([doc({ targetKind: null })]);
  assert.deepEqual(
    groups.map((g) => g.kind),
    ['unattached']
  );
});

test('groups come in kind order, unattached always last, empty kinds dropped', () => {
  const groups = groupDocumentsByTarget([
    doc({ id: 'goal-doc', targetKind: 'goal', targetId: 'g1' }),
    doc({ id: 'loose', targetKind: null }),
    doc({ id: 'milestone-doc', targetKind: 'milestone', targetId: 'm1' })
  ]);
  assert.deepEqual(
    groups.map((g) => g.kind),
    ['milestone', 'goal', 'unattached']
  );
});

test('a kind nothing is filed under gets no group at all', () => {
  const groups = groupDocumentsByTarget([doc({ targetKind: 'milestone', targetId: 'm1' })]);
  assert.deepEqual(
    groups.map((g) => g.kind),
    ['milestone']
  );
});

test('within a group, documents keep the order they arrived in', () => {
  const newer = doc({ id: 'newer', epochDay: 20100, targetKind: 'episode', targetId: 'e1' });
  const older = doc({ id: 'older', epochDay: 19000, targetKind: 'episode', targetId: 'e1' });
  const [group] = groupDocumentsByTarget([newer, older]);
  assert.deepEqual(
    group.documents.map((d) => d.id),
    ['newer', 'older']
  );
});

test('two documents filed under different things of the same kind share one group', () => {
  const groups = groupDocumentsByTarget([
    doc({ id: 'a', targetKind: 'procedure', targetId: 'p1' }),
    doc({ id: 'b', targetKind: 'procedure', targetId: 'p2' })
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].documents.map((d) => d.id),
    ['a', 'b']
  );
});

test('an empty vault groups to nothing', () => {
  assert.deepEqual(groupDocumentsByTarget([]), []);
});
