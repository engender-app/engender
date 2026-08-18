/* The hormone curve area (phase 4 ticket 10): bands over the dose log with
   the user's own lab results overlaid, recomputed on every read. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { startOfDayTimestamp } from '../epochDay.ts';
import { journalWithBuiltIns } from './test-support.ts';
import type { Journal } from './journal.ts';

const at = (epochDay: number, hour = 8) => startOfDayTimestamp(epochDay) + hour * 3600000;

const FROM = 19000;
const TO = 19084;

async function episode(journal: Journal, startEpochDay: number, overrides: Partial<Parameters<Journal['regimen']['upsertEpisode']>[0]> = {}) {
  return journal.regimen.upsertEpisode({
    drug: 'estradiol valerate',
    ester: 'valerate',
    dose: 5,
    doseUnit: 'mg',
    route: 'im',
    interval: 'every 7 days',
    startEpochDay,
    ...overrides
  });
}

async function injectWeekly(journal: Journal, count: number, overrides: { dose?: number; doseUnit?: string } = {}) {
  for (let i = 0; i < count; i++) {
    await journal.doses.upsertDose({
      timestamp: at(FROM + i * 7),
      route: 'im',
      dose: overrides.dose ?? 5,
      doseUnit: overrides.doseUnit ?? 'mg',
      injectionSite: 'thigh-left',
      vehicle: 'oil'
    });
  }
}

test('a weekly valerate regimen gets one band, drawn from the dose log', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.equal(view.curves.length, 1);
  assert.equal(view.curves[0].ester, 'valerate');
  assert.equal(view.curves[0].doseCount, 12);
  assert.ok(view.curves[0].band.some((point) => point.upper > point.lower));
});

test('the user’s own estradiol results are overlaid, as logged and placed on the curve’s axis', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);
  await journal.labs.upsertResult({ epochDay: FROM + 20, analyte: 'estradiol', value: 180, unit: 'pg/mL', drawTime: '09:30' });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.equal(view.labPoints.length, 1);
  assert.equal(view.labPoints[0].result.value, 180);
  assert.equal(view.labPoints[0].result.unit, 'pg/mL');
  assert.equal(view.labPoints[0].value, 180);
  // 09:30 on day FROM+20, so a bit over a third of the way into it.
  assert.ok(Math.abs(view.labPoints[0].day - (FROM + 20 + 9.5 / 24)) < 0.01);
});

test('a result logged in pmol/L is placed by its converted value and still reads as pmol/L', async () => {
  // ADR-0026 both ways round: the native value stays what the screen shows,
  // and the conversion is only how the point finds its height.
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);
  await journal.labs.upsertResult({ epochDay: FROM + 20, analyte: 'estradiol', value: 367.1, unit: 'pmol/L' });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.equal(view.labPoints[0].result.unit, 'pmol/L');
  assert.ok(Math.abs(view.labPoints[0].value - 100) < 0.01);
  assert.equal(view.labPointsOffAxis, 0);
});

test('an estradiol result in a unit outside the allowlist is counted, never converted by guesswork', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);
  await journal.labs.upsertResult({ epochDay: FROM + 20, analyte: 'estradiol', value: 5, unit: 'ng/L?' });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.deepEqual(view.labPoints, []);
  assert.equal(view.labPointsOffAxis, 1);
});

test('another analyte’s results are not overlaid on an estradiol curve', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);
  await journal.labs.upsertResult({ epochDay: FROM + 20, analyte: 'testosterone', value: 20, unit: 'ng/dL' });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.deepEqual(view.labPoints, []);
  assert.equal(view.labPointsOffAxis, 0);
});

test('results outside the window are not overlaid', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);
  await journal.labs.upsertResult({ epochDay: FROM - 5, analyte: 'estradiol', value: 180, unit: 'pg/mL' });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
  assert.deepEqual(view.labPoints, []);
});

test('declining the fit leaves the published band alone; asking for it moves the band onto the user’s own points', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);
  // Two draws well above where the population curve sits.
  await journal.labs.upsertResult({ epochDay: FROM + 40, analyte: 'estradiol', value: 600, unit: 'pg/mL', drawTime: '09:00' });
  await journal.labs.upsertResult({ epochDay: FROM + 61, analyte: 'estradiol', value: 640, unit: 'pg/mL', drawTime: '09:00' });

  const plain = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
  const fitted = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: true });

  assert.equal(plain.scaleFactor, null);
  assert.equal(plain.fitPointCount, 0);

  assert.ok(fitted.scaleFactor !== null);
  assert.ok(fitted.scaleFactor > 1, `expected the curve to be scaled up, got ${fitted.scaleFactor}`);
  assert.equal(fitted.fitPointCount, 2);

  const day = (view: typeof plain, d: number) => view.curves[0].band.find((point) => point.day >= d)!;
  assert.ok(Math.abs(day(fitted, 50).upper - day(plain, 50).upper * fitted.scaleFactor!) < 1e-6);
});

test('asking for a fit with no results of your own leaves the curve where it was, and still draws it', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: true });

  assert.equal(view.scaleFactor, null);
  assert.equal(view.fitPointCount, 0);
  assert.equal(view.curves.length, 1);
  assert.ok(view.curves[0].band.some((point) => point.upper > 0));
});

test('no fit is attempted while the model is knowingly drawing less than went in', async () => {
  // A dose logged by volume means the band is low for a reason that has
  // nothing to do with the person's own response, and a fit would read the
  // gap as theirs and scale everything up.
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 6);
  await journal.doses.upsertDose({
    timestamp: at(FROM + 42),
    route: 'im',
    dose: 0.5,
    doseUnit: 'mL',
    injectionSite: 'thigh-left',
    vehicle: 'oil'
  });
  await journal.labs.upsertResult({ epochDay: FROM + 45, analyte: 'estradiol', value: 600, unit: 'pg/mL', drawTime: '09:00' });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: true });

  assert.equal(view.dosesWithoutMilligrams, 1);
  assert.equal(view.scaleFactor, null);
  assert.equal(view.labPoints.length, 1);
});

test('an injection before the window still feeds the first days of it', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 60);
  await journal.doses.upsertDose({
    timestamp: at(FROM - 3),
    route: 'im',
    dose: 5,
    doseUnit: 'mg',
    injectionSite: 'thigh-left',
    vehicle: 'oil'
  });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.equal(view.curves.length, 1);
  assert.equal(view.curves[0].doseCount, 1);
  assert.ok(view.curves[0].band[0].upper > 0, 'the window should open part-way down the previous injection');
});

test('nothing injected at all is an empty view rather than a flat line at zero', async () => {
  const { journal } = await journalWithBuiltIns();

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: true });

  assert.deepEqual(view.curves, []);
  assert.deepEqual(view.labPoints, []);
  assert.equal(view.scaleFactor, null);
});

test('a result is attributed to the ester that was in effect when it was drawn', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await episode(journal, FROM + 40, {
    drug: 'estradiol enanthate',
    ester: 'enanthate',
    interval: 'every 14 days'
  });
  await injectWeekly(journal, 12);
  await journal.labs.upsertResult({ epochDay: FROM + 10, analyte: 'estradiol', value: 200, unit: 'pg/mL', drawTime: '09:00' });
  await journal.labs.upsertResult({ epochDay: FROM + 60, analyte: 'estradiol', value: 240, unit: 'pg/mL', drawTime: '09:00' });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.deepEqual(
    view.labPoints.map((point) => [point.result.value, point.ester]),
    [
      [200, 'valerate'],
      [240, 'enanthate']
    ]
  );
});

test('a result drawn before any regimen episode is attributed to no ester', async () => {
  // It still has to be shown - it is a measurement, and the screen puts an
  // unattributed one on every chart rather than dropping it.
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM + 30);
  await injectWeekly(journal, 12);
  await journal.labs.upsertResult({ epochDay: FROM + 2, analyte: 'estradiol', value: 90, unit: 'pg/mL', drawTime: '09:00' });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.equal(view.labPoints.length, 1);
  assert.equal(view.labPoints[0].ester, null);
});

test('a result drawn under a non-estradiol regimen is attributed to no ester either', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30, { drug: 'testosterone enanthate', ester: 'enanthate' });
  await journal.labs.upsertResult({ epochDay: FROM + 2, analyte: 'estradiol', value: 90, unit: 'pg/mL', drawTime: '09:00' });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.equal(view.labPoints[0].ester, null);
});

test('a subcutaneous injection reaches the screen as an assumption to state', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await journal.doses.upsertDose({
    timestamp: at(FROM + 3),
    route: 'sc',
    dose: 5,
    doseUnit: 'mg',
    injectionSite: 'thigh-left',
    vehicle: 'oil'
  });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.equal(view.curves.length, 1);
  assert.equal(view.subcutaneousDoses, 1);
});

test('an all-intramuscular log has nothing to state about the subcutaneous route', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 4);

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
  assert.equal(view.subcutaneousDoses, 0);
});

test('an ester with no curve worth drawing produces no curve and no special case', async () => {
  // Polyestradiol phosphate and undecylate both land here now: the model has
  // nothing to say about either, and the screen's one empty state covers it.
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30, { drug: 'polyestradiol phosphate', ester: null, dose: 80 });
  await injectWeekly(journal, 4, { dose: 80 });

  const pep = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
  assert.deepEqual(pep.curves, []);

  const { journal: second } = await journalWithBuiltIns();
  await episode(second, FROM - 30, { drug: 'estradiol undecylate', ester: 'undecylate', dose: 50 });
  await injectWeekly(second, 4, { dose: 50 });

  const undecylate = await second.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
  assert.deepEqual(undecylate.curves, []);
});
