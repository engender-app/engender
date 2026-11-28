/* Today's "time since" line: how long ago the journey anchor's milestone was, in the
   duration words the rest of the app uses. */

import assert from 'node:assert/strict';
import { test, vi } from 'vitest';

// Real messages, reached by the relative path this tier uses (see
// vocabulary/doseLabels.test.ts for why not a hand-written fake).
vi.mock('$lib/paraglide/messages', async () => await import('../paraglide/messages.js'));
vi.mock('$lib/paraglide/runtime', async () => await import('../paraglide/runtime.js'));

const { journeyAnchorLine } = await import('./journeyAnchor.ts');
const { overwriteGetLocale, baseLocale } = await import('../paraglide/runtime.js');
const { epochDayFromDateInputValue } = await import('./epochDay.ts');

const day = (value: string) => epochDayFromDateInputValue(value) as number;
const anchor = { name: 'Started HRT', epochDay: day('2026-01-15') };

function inLocale(locale: 'en' | 'pl', body: () => void) {
  overwriteGetLocale(() => locale);
  try {
    body();
  } finally {
    overwriteGetLocale(() => baseLocale);
  }
}

test('no anchor, no line', () => {
  assert.equal(journeyAnchorLine(null, day('2026-10-22')), null);
});

test('an anchor still ahead has no time since it yet', () => {
  assert.equal(journeyAnchorLine(anchor, day('2026-01-14')), null);
});

test('the anchor day itself says today rather than zero days', () => {
  inLocale('en', () => assert.equal(journeyAnchorLine(anchor, anchor.epochDay), 'Started HRT, today'));
  inLocale('pl', () => assert.equal(journeyAnchorLine(anchor, anchor.epochDay), 'Started HRT, dziś'));
});

test('the line moves from days to a month on the day the month completes', () => {
  inLocale('en', () => {
    assert.equal(journeyAnchorLine(anchor, day('2026-02-14')), 'Started HRT, 30 days ago');
    assert.equal(journeyAnchorLine(anchor, day('2026-02-15')), 'Started HRT, 1 month ago');
    assert.equal(journeyAnchorLine(anchor, day('2026-09-14')), 'Started HRT, 7 months ago');
    assert.equal(journeyAnchorLine(anchor, day('2026-09-15')), 'Started HRT, 8 months ago');
    assert.equal(journeyAnchorLine(anchor, day('2027-04-20')), 'Started HRT, 1 year 3 months ago');
  });
});

test('Polish counts the same way, with temu after the duration', () => {
  inLocale('pl', () => {
    assert.equal(journeyAnchorLine(anchor, day('2026-02-14')), 'Started HRT, 30 dni temu');
    assert.equal(journeyAnchorLine(anchor, day('2026-09-15')), 'Started HRT, 8 miesięcy temu');
    assert.equal(journeyAnchorLine(anchor, day('2028-01-15')), 'Started HRT, 2 lata temu');
  });
});
