import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { Entry } from './types.ts';
import { entryDayGroups, entryMarks, recentDayMonths } from './recentEntries.ts';
import { epochDayFromLocalDate } from './epochDay.ts';

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

test('the first day names the list\'s month, and a divider falls wherever the month changes after it', () => {
  const aug31 = epochDayFromLocalDate(new Date(2026, 7, 31));
  const aug15 = epochDayFromLocalDate(new Date(2026, 7, 15));
  const jul20 = epochDayFromLocalDate(new Date(2026, 6, 20));
  const headed = recentDayMonths(entryDayGroups([entry(1, aug31), entry(2, aug15), entry(3, jul20)]));
  // August is the heading's sub-line, not a divider over its own first day:
  // one heading above the first day (ux-carpet ticket 282).
  assert.deepEqual(headed.month, { year: 2026, month: 7 });
  assert.deepEqual(
    headed.groups.map((g) => [g.epochDay, g.monthDivider]),
    [
      [aug31, undefined],
      [aug15, undefined],
      [jul20, { year: 2026, month: 6 }]
    ]
  );
});

test('a year boundary is a month change like any other', () => {
  const jan2 = epochDayFromLocalDate(new Date(2027, 0, 2));
  const dec30 = epochDayFromLocalDate(new Date(2026, 11, 30));
  const headed = recentDayMonths(entryDayGroups([entry(1, jan2), entry(2, dec30)]));
  assert.deepEqual(headed.month, { year: 2027, month: 0 });
  assert.deepEqual(headed.groups[1].monthDivider, { year: 2026, month: 11 });
});

test('is empty for an empty read, with no month to name, and grouping is untouched', () => {
  assert.deepEqual(recentDayMonths([]), { month: undefined, groups: [] });
  const groups = entryDayGroups([entry(1, epochDayFromLocalDate(new Date(2026, 7, 1)))]);
  const headed = recentDayMonths(groups);
  assert.deepEqual(headed.groups[0].entries, groups[0].entries);
  assert.equal(headed.groups[0].monthDivider, undefined);
});

test('growing the limit only appends - nothing already drawn repaginates (ADR-0069)', () => {
  // Five days' worth, the shape "Earlier entries" reads before a tap.
  const first = [5, 4, 3, 2, 1].map((d) => entry(d, epochDayFromLocalDate(new Date(2026, 7, d))));
  // Ten days' worth - what the same read returns once the limit has grown by
  // one step, five older days appended after the first five and crossing
  // into July.
  const grown = [
    ...first,
    ...[31, 30, 29, 28, 27].map((d) => entry(d, epochDayFromLocalDate(new Date(2026, 6, d))))
  ];
  const before = recentDayMonths(entryDayGroups(first));
  const after = recentDayMonths(entryDayGroups(grown));
  // The heading's month and the first five days are byte-identical whether
  // ten days are in hand or five - a tap grows what is drawn, it does not
  // redraw it.
  assert.deepEqual(after.month, before.month);
  assert.deepEqual(after.groups.slice(0, before.groups.length), before.groups);
  // And growing past a month boundary opens exactly one divider, on the
  // first day of the new month rather than on every day inside it.
  assert.deepEqual(
    after.groups.slice(before.groups.length).map((g) => g.monthDivider),
    [{ year: 2026, month: 6 }, undefined, undefined, undefined, undefined]
  );
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
