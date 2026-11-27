/* The wording a dose row's trailing attribution uses (audit U8, ticket 17).
   Whether the row shows it at all is `showAttributionLabel`'s question,
   tested with the rest of regimenEpisode. */

import assert from 'node:assert/strict';
import { test, vi } from 'vitest';

// $lib has no alias on the plain node tier (vitest.config.ts) - real
// messages, reached by the relative path everything else on this tier
// uses, rather than a hand-written fake that could drift from the actual
// English copy this test means to pin down.
vi.mock('$lib/paraglide/messages', async () => await import('../../paraglide/messages.js'));
vi.mock('$lib/paraglide/runtime', async () => await import('../../paraglide/runtime.js'));
vi.mock('$lib/data/dates', async () => await import('../dates.ts'));

import type { DoseAttribution } from '../regimenEpisode.ts';

const { attributionLabel, regimenIntervalLabel, regimenIntervalToStore, regimenPeriodLabel } = await import('./doseLabels.ts');
const { overwriteGetLocale, baseLocale } = await import('../../paraglide/runtime.js');
const { epochDayFromDateInputValue } = await import('../epochDay.ts');

function inLocale(locale: 'en' | 'pl', body: () => void) {
  overwriteGetLocale(() => locale);
  try {
    body();
  } finally {
    overwriteGetLocale(() => baseLocale);
  }
}

const day = (value: string) => epochDayFromDateInputValue(value) as number;

const resolved: DoseAttribution = {
  episode: {
    id: 'ep-1', drug: 'Estradiol valerate', drugClass: 'hrt', ester: null, dose: 4, doseUnit: 'mg', route: 'im',
    interval: 'P2W', startEpochDay: 0, endEpochDay: null, endReason: null
  },
  ambiguous: false
};

test('the three attribution states each have their own wording', () => {
  assert.equal(attributionLabel(resolved), 'under Estradiol valerate');
  assert.equal(attributionLabel({ episode: null, ambiguous: false }), 'No regimen episode covers this date');
  assert.equal(
    attributionLabel({ episode: null, ambiguous: true }),
    'Drug unknown: more than one regimen was running'
  );
});

/* Audit U50: the Polish regimen row read "50 mg ·
   Doustnie · daily · lut 2026 do trwa" - the stored interval went out raw,
   and the ongoing word was dropped into the end of a from-to sentence. */
test('the interval values the app itself stores read in the reader\'s language', () => {
  inLocale('pl', () => {
    assert.equal(regimenIntervalLabel('daily'), 'codziennie');
    assert.equal(regimenIntervalLabel('weekly'), 'co tydzień');
  });
  inLocale('en', () => {
    assert.equal(regimenIntervalLabel('daily'), 'daily');
    assert.equal(regimenIntervalLabel('weekly'), 'weekly');
  });
});

test('an interval a person typed is their own words and stays as written', () => {
  inLocale('pl', () => {
    assert.equal(regimenIntervalLabel('co 10 dni'), 'co 10 dni');
    assert.equal(regimenIntervalLabel('Daily'), 'Daily');
    assert.equal(regimenIntervalLabel('constructor'), 'constructor');
    assert.equal(regimenIntervalLabel(''), '');
  });
});

test('an untouched interval saves back as the value it was stored as', () => {
  inLocale('pl', () => {
    assert.equal(regimenIntervalToStore('codziennie', 'daily'), 'daily');
    assert.equal(regimenIntervalToStore('  co tydzień ', 'weekly'), 'weekly');
    assert.equal(regimenIntervalToStore('co 2 tygodnie', 'weekly'), 'co 2 tygodnie');
    assert.equal(regimenIntervalToStore(' co 2 tygodnie ', null), 'co 2 tygodnie');
    assert.equal(regimenIntervalToStore('codziennie', null), 'codziennie');
  });
});

test('an ended period reads as a from-to range in both languages', () => {
  inLocale('pl', () => assert.equal(regimenPeriodLabel(day('2025-01-03'), day('2026-02-03')), 'od sty 2025 do lut 2026'));
  inLocale('en', () => assert.equal(regimenPeriodLabel(day('2025-01-03'), day('2026-02-03')), 'Jan 2025 to Feb 2026'));
});

test('an ongoing period names only its start rather than ending on the word for ongoing', () => {
  inLocale('pl', () => assert.equal(regimenPeriodLabel(day('2026-02-03'), null), 'od lut 2026'));
  inLocale('en', () => assert.equal(regimenPeriodLabel(day('2026-02-03'), null), 'from Feb 2026'));
});
