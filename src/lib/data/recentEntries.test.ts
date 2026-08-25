import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { Entry } from './types.ts';
import { RECENT_ENTRY_CAP, recentDayGroups } from './recentEntries.ts';

/** Only the three fields the grouping reads. */
function entry(id: number, epochDay: number): Entry {
  return { id, epochDay, timestamp: epochDay * 86_400_000 + id, tags: [] } as unknown as Entry;
}

test('groups a day\'s entries under that day, in the order the read returned them', () => {
  const groups = recentDayGroups([entry(3, 20676), entry(2, 20676), entry(1, 20675)], 10);
  assert.deepEqual(
    groups.map((g) => [g.epochDay, g.entries.map((e) => e.id)]),
    [
      [20676, [3, 2]],
      [20675, [1]]
    ]
  );
});

test('reports how many entries the whole day holds, not how many it drew', () => {
  /* The day bar says "3 that day" whether or not the cap cut the third one
     off: the count is the day's, and a count that shrank with the cap would
     be the cap describing itself. */
  const groups = recentDayGroups([entry(3, 20676), entry(2, 20676), entry(1, 20676)], 2);
  assert.deepEqual(groups.map((g) => [g.dayCount, g.entries.length]), [[3, 2]]);
});

test('stops at the cap, and says there was more behind it', () => {
  const entries = [entry(5, 20676), entry(4, 20676), entry(3, 20675), entry(2, 20674), entry(1, 20673)];
  const capped = recentDayGroups(entries, 3);
  assert.equal(capped.reduce((n, g) => n + g.entries.length, 0), 3);
  assert.deepEqual(capped.map((g) => g.epochDay), [20676, 20675]);
});

test('drops a day the cap never reached rather than heading an empty one', () => {
  const groups = recentDayGroups([entry(2, 20676), entry(1, 20675)], 1);
  assert.deepEqual(groups.map((g) => g.epochDay), [20676]);
});

test('is empty for an empty read, and for a cap of nothing', () => {
  assert.deepEqual(recentDayGroups([], 5), []);
  assert.deepEqual(recentDayGroups([entry(1, 20676)], 0), []);
});

test('caps at five entries, which is the number Home draws', () => {
  assert.equal(RECENT_ENTRY_CAP, 5);
});
