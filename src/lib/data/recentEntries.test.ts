import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { Entry } from './types.ts';
import { entryDayGroups, entryMarks } from './recentEntries.ts';

/** Only the three fields the grouping reads. */
function entry(id: number, epochDay: number): Entry {
  return { id, epochDay, timestamp: epochDay * 86_400_000 + id, tags: [] } as unknown as Entry;
}

test('groups a day\'s entries under that day, in the order the read returned them', () => {
  const groups = entryDayGroups([entry(3, 20676), entry(2, 20676), entry(1, 20675)]);
  assert.deepEqual(
    groups.map((g) => [g.epochDay, g.entries.map((e) => e.id)]),
    [
      [20676, [3, 2]],
      [20675, [1]]
    ]
  );
});

test('is empty for an empty read', () => {
  assert.deepEqual(entryDayGroups([]), []);
});

test('an entry\'s marks are the media it carries, in drawing order', () => {
  // Only the lengths are read, so one stand-in per kind is the whole fixture.
  const one = [{}] as unknown;
  const media = (fields: Record<string, unknown>) =>
    entryMarks({ ...entry(1, 20676), ...fields } as unknown as Entry);
  assert.deepEqual(media({}), []);
  assert.deepEqual(media({ photos: one }), ['image']);
  assert.deepEqual(media({ recordings: one }), ['mic']);
  assert.deepEqual(media({ photos: one, recordings: one, videos: one }), ['image', 'mic', 'video']);
});
