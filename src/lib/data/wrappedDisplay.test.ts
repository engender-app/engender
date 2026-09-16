/* Carpet ticket 18: a bar's length and its printed number used to come from
   two different precisions - `amount` off the raw delta, `value` off
   `nativeValue`'s rounding - so two rows that printed the same figure could
   draw at different lengths. */

import assert from 'node:assert/strict';
import { test, vi } from 'vitest';

// $lib has no alias on the plain node tier (vitest.config.ts) - real
// messages, reached by the relative path everything else on this tier uses,
// rather than a hand-written fake that could drift from the actual copy.
vi.mock('$lib/paraglide/messages', async () => await import('../paraglide/messages.js'));

import type { WrappedTagInsight } from './wrappedSections.ts';
import type { CorrelationBarInput } from './wrappedDisplay.ts';

const { correlationBarRows, nativeAmount, tagInsightRows } = await import('./wrappedDisplay.ts');

const insight = (
  overrides: Partial<WrappedTagInsight & { label: string }> = {}
): WrappedTagInsight & { label: string } => ({
  id: 'shopping',
  label: 'Shopping',
  count: 3,
  withAvg: 60,
  withoutAvg: 58,
  delta: 2,
  ...overrides
});

test('nativeAmount rounds to the same precision nativeValue prints', () => {
  assert.equal(nativeAmount('femininity', 1.6), 2);
  assert.equal(nativeAmount('femininity', 2.4), 2);
  assert.equal(nativeAmount('mood', 0.34), 0.3);
  assert.equal(nativeAmount('mood', -0.26), -0.3);
});

test('two dimension insights that print the same delta draw the same length', () => {
  const rows = tagInsightRows(
    [
      insight({ id: 'shopping', label: 'Shopping', delta: 1.6 }),
      insight({ id: 'self-care', label: 'Self-care', delta: -2.4 })
    ],
    'femininity'
  );
  assert.equal(rows[0].value, '+2');
  assert.equal(rows[1].value, '−2');
  assert.equal(rows[0].amount, rows[1].amount);
  assert.equal(rows[0].amount, 2);
});

test('two mood insights that print the same delta draw the same length', () => {
  const rows = tagInsightRows(
    [
      insight({ id: 'a', label: 'A', delta: 0.34 }),
      insight({ id: 'b', label: 'B', delta: -0.26 })
    ],
    'mood'
  );
  assert.equal(rows[0].value, '+0.3');
  assert.equal(rows[1].value, '−0.3');
  assert.equal(rows[0].amount, rows[1].amount);
  assert.equal(rows[0].amount, 0.3);
});

const barInput = (overrides: Partial<CorrelationBarInput> = {}): CorrelationBarInput => ({
  key: 'tag-shopping-mood',
  label: 'Shopping',
  metric: 'mood',
  metricName: 'Mood',
  range: { min: 1, max: 5 },
  count: 3,
  withAvg: 4,
  withoutAvg: 3.6,
  ...overrides
});

test('correlationBarRows names the scale on every row, since a card is no longer one metric', () => {
  const rows = correlationBarRows([
    barInput({ key: 'tag-shopping-mood', label: 'Shopping', metric: 'mood', metricName: 'Mood' }),
    barInput({
      key: 'tag-shopping-femininity',
      label: 'Shopping',
      metric: 'femininity',
      metricName: 'Femininity',
      range: { min: 0, max: 100 },
      withAvg: 70,
      withoutAvg: 50
    })
  ]);
  assert.match(rows[0].note ?? '', /^Mood ·/);
  assert.match(rows[1].note ?? '', /^Femininity ·/);
});

/* The bug the merge introduced a chance for: a raw native delta put a
   20-point move on a 0-100 dimension next to a 1-point move on mood's 1-to-5
   and drew the smaller-looking number as the longer bar. Normalized to each
   metric's own width, the mood move (a quarter of its range) outranks the
   dimension move (a fifth of its own) even though 20 > 1. */
test('correlationBarRows compares movement as a share of each metric\'s own range, not as a raw delta', () => {
  const rows = correlationBarRows([
    barInput({ key: 'mood-row', metric: 'mood', metricName: 'Mood', range: { min: 1, max: 5 }, withAvg: 4, withoutAvg: 3 }),
    barInput({
      key: 'dimension-row',
      metric: 'femininity',
      metricName: 'Femininity',
      range: { min: 0, max: 100 },
      withAvg: 70,
      withoutAvg: 50
    })
  ]);
  const [moodRow, dimensionRow] = rows;
  assert.ok(moodRow.amount > dimensionRow.amount, `${moodRow.amount} should be greater than ${dimensionRow.amount}`);
});
