/* dayAheadRows.ts (phase 8 features ticket 62): every kind gets a row that
   says only its kind, never a specific record, and the five kinds' rows
   never collide on an icon within the card they can both land in. */

import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import type { DayAheadMark, DayAheadMarkKind } from '$lib/data/journal/dayAhead';

// vitest.config.ts (node tier) has no `$lib` alias, so the module under
// test's own `$lib/paraglide/messages` import is pointed at the real
// compiled catalogue instead of failing to resolve (the pattern
// provenance.test.ts uses for the same reason).
vi.mock('$lib/paraglide/messages', async () => await import('../paraglide/messages.js'));
const { dayAheadRows } = await import('./dayAheadRows.ts');

const KINDS: DayAheadMarkKind[] = ['appointment', 'surgery', 'milestone', 'letterUnlock', 'doseSlot'];

const mark = (kind: DayAheadMarkKind, epochDay = 20000): DayAheadMark => ({ kind, epochDay });

test('every kind produces exactly one row, keyed by its kind', () => {
  const rows = dayAheadRows(KINDS.map((kind) => mark(kind)));
  assert.equal(rows.length, KINDS.length);
  for (const kind of KINDS) {
    const row = rows.find((r) => r.key === `coming-${kind}`);
    assert.ok(row, `no row for ${kind}`);
    assert.ok(row!.title.length > 0);
    assert.ok(row!.href.length > 0);
    assert.ok(row!.icon && row!.icon.length > 0);
  }
});

test('never names a specific record - no id, date or place lands in a title', () => {
  // The whole point of a mark (ADR-0067, dayAhead.ts's own header): never
  // which appointment, which milestone, which letter. A row's title cannot
  // prove that on its own, but it can at least never carry the epoch day or
  // an id-shaped string.
  const rows = dayAheadRows(KINDS.map((kind) => mark(kind, 99999)));
  for (const row of rows) {
    assert.ok(!row.title.includes('99999'), `${row.key} leaked its epoch day`);
  }
});

test('milestone and surgery never share an icon, since one day can carry both', () => {
  // hubRows.ts already resolved this exact pair apart on the More hub for
  // the same reason: a duplicate icon reads as one row drawn twice.
  const rows = dayAheadRows([mark('surgery'), mark('milestone')]);
  const bySurgery = rows.find((r) => r.key === 'coming-surgery')!;
  const byMilestone = rows.find((r) => r.key === 'coming-milestone')!;
  assert.notEqual(bySurgery.icon, byMilestone.icon);
});

test('an empty mark list is an empty row list', () => {
  assert.deepEqual(dayAheadRows([]), []);
});
