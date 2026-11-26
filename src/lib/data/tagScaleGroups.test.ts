/* The tag card's row model (ticket 20): cards grouped by the scale they
   were measured on, bars signed and sized inside their own group. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { groupCardsByScale } from './tagScaleGroups';
import type { CorrelationCard } from './correlationCards';

const ranges: Record<string, { min: number; max: number }> = {
  mood: { min: 1, max: 5 },
  dysphoria_euphoria: { min: 0, max: 100 }
};
const rangeOf = (metric: string) => ranges[metric];

const tag = (id: string, metric: string, withAvg: number, withoutAvg: number, count = 5): CorrelationCard => ({
  occurrence: { kind: 'tag', id },
  metric,
  count,
  withAvg,
  withoutAvg
});

test('one group per scale, so a tag measured on two scales sits once in each and never twice in one', () => {
  const groups = groupCardsByScale(
    [
      tag('pronouns', 'mood', 5, 3.4),
      tag('pronouns', 'dysphoria_euphoria', 70, 49),
      tag('rain', 'mood', 3, 4)
    ],
    rangeOf
  );

  assert.deepEqual(groups.map((g) => g.metric).sort(), ['dysphoria_euphoria', 'mood']);
  for (const group of groups) {
    const keys = group.rows.map((r) => r.key);
    assert.equal(new Set(keys).size, keys.length);
  }
  assert.equal(groups.find((g) => g.metric === 'mood')!.rows.length, 2);
});

test('a bar points the way withAvg minus withoutAvg does', () => {
  const [group] = groupCardsByScale([tag('up', 'mood', 4.5, 3), tag('down', 'mood', 2, 3.5)], rangeOf);

  const byKey = Object.fromEntries(group.rows.map((r) => [r.card.occurrence.kind === 'tag' ? r.card.occurrence.id : 'dose', r]));
  assert.ok(byKey.up.gap > 0 && byKey.up.share > 0);
  assert.ok(byKey.down.gap < 0 && byKey.down.share < 0);
});

test('bar length is proportional to the gap inside the group, the largest one at 1', () => {
  const [group] = groupCardsByScale([tag('a', 'mood', 5, 3), tag('b', 'mood', 4, 3), tag('c', 'mood', 2.5, 3)], rangeOf);

  assert.deepEqual(group.rows.map((r) => r.share), [1, 0.5, -0.25]);
});

test('rows rank by the size of the gap, not its direction', () => {
  const [group] = groupCardsByScale([tag('small', 'mood', 3.5, 3), tag('big down', 'mood', 1.5, 3.5), tag('mid', 'mood', 4, 3)], rangeOf);

  assert.deepEqual(group.rows.map((r) => (r.card.occurrence as { id: string }).id), ['big down', 'mid', 'small']);
});

test('groups order by their largest gap on a shared footing, since raw gaps on 1-5 and 0-100 do not compare', () => {
  const groups = groupCardsByScale(
    [
      // 5 points on 0-100 is 0.05 of its range, 1 point on 1-5 is 0.25.
      tag('a', 'dysphoria_euphoria', 55, 50),
      tag('b', 'mood', 4, 3)
    ],
    rangeOf
  );

  assert.deepEqual(groups.map((g) => g.metric), ['mood', 'dysphoria_euphoria']);
});

test('the dose day ranks inside its scale beside the tags', () => {
  const dose: CorrelationCard = { occurrence: { kind: 'doseDay' }, metric: 'mood', count: 4, withAvg: 5, withoutAvg: 2 };
  const [group] = groupCardsByScale([tag('a', 'mood', 4, 3), dose], rangeOf);

  assert.equal(group.rows[0].card.occurrence.kind, 'doseDay');
  assert.equal(group.rows.length, 2);
});

test('a group of zero gaps draws no length rather than dividing by zero', () => {
  const [group] = groupCardsByScale([tag('flat', 'mood', 3, 3)], rangeOf);

  assert.equal(group.rows[0].share, 0);
});
