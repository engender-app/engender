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

const { nativeAmount, tagInsightRows } = await import('./wrappedDisplay.ts');

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
