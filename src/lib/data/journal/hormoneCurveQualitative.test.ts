/* The qualitative curve area (phase 4 ticket 11): illustrative shapes over
   the dose log for oral, sublingual, patch and gel estradiol, with the
   user's own lab results overlaid the same way journal/hormoneCurve.ts's
   band is. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { startOfDayTimestamp } from '../epochDay.ts';
import { journalWithBuiltIns } from './test-support.ts';
import type { Journal } from './journal.ts';

const at = (epochDay: number, hour = 8) => startOfDayTimestamp(epochDay) + hour * 3600000;

const FROM = 19000;
const TO = 19010;

async function episode(journal: Journal, startEpochDay: number, overrides: Partial<Parameters<Journal['regimen']['upsertEpisode']>[0]> = {}) {
  return journal.regimen.upsertEpisode({
    drug: 'estradiol',
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'every day',
    startEpochDay,
    ...overrides
  });
}

async function doseDaily(journal: Journal, count: number, overrides: { dose?: number; doseUnit?: string } = {}) {
  for (let i = 0; i < count; i++) {
    await journal.doses.upsertDose({
      timestamp: at(FROM + i),
      route: 'oral',
      dose: overrides.dose ?? 2,
      doseUnit: overrides.doseUnit ?? 'mg'
    });
  }
}

test('a daily oral regimen gets one curve, drawn from the dose log', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 5);
  await doseDaily(journal, 8);

  const view = await journal.qualitativeCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.equal(view.curves.length, 1);
  assert.equal(view.curves[0].route, 'oral');
  assert.equal(view.curves[0].doseCount, 8);
  assert.ok(view.curves[0].points.some((point) => point.value > 0));
});

test('two routes dosed in one window get a curve each', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 5);
  await doseDaily(journal, 3);
  await journal.doses.upsertDose({ timestamp: at(FROM + 4), route: 'gel', dose: 1.5, doseUnit: 'mg', applicationSite: 'abdomen' });

  const view = await journal.qualitativeCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.deepEqual(
    view.curves.map((c) => c.route),
    ['oral', 'gel']
  );
});

test('the user’s own estradiol results are overlaid, as logged and placed on the curve’s axis', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 5);
  await doseDaily(journal, 8);
  await journal.labs.upsertResult({ epochDay: FROM + 4, analyte: 'estradiol', value: 80, unit: 'pg/mL', drawTime: '09:30' });

  const view = await journal.qualitativeCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.equal(view.labPoints.length, 1);
  assert.equal(view.labPoints[0].result.value, 80);
  assert.equal(view.labPoints[0].result.unit, 'pg/mL');
  assert.equal(view.labPoints[0].value, 80);
});

test('a result logged in pmol/L is placed by its converted value and still reads as pmol/L', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 5);
  await doseDaily(journal, 8);
  await journal.labs.upsertResult({ epochDay: FROM + 4, analyte: 'estradiol', value: 367.1, unit: 'pmol/L' });

  const view = await journal.qualitativeCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.equal(view.labPoints[0].result.unit, 'pmol/L');
  assert.ok(Math.abs(view.labPoints[0].value - 100) < 0.01);
  assert.equal(view.labPointsOffAxis, 0);
});

test('an estradiol result in a unit outside the allowlist is counted, never converted by guesswork', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 5);
  await doseDaily(journal, 8);
  await journal.labs.upsertResult({ epochDay: FROM + 4, analyte: 'estradiol', value: 5, unit: 'ng/L?' });

  const view = await journal.qualitativeCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.deepEqual(view.labPoints, []);
  assert.equal(view.labPointsOffAxis, 1);
});

test('results outside the window are not overlaid', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 5);
  await doseDaily(journal, 8);
  await journal.labs.upsertResult({ epochDay: FROM - 20, analyte: 'estradiol', value: 80, unit: 'pg/mL' });

  const view = await journal.qualitativeCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
  assert.deepEqual(view.labPoints, []);
});

test('declining the fit leaves the published shape alone; asking for it moves the curve onto the user’s own points', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 5);
  await doseDaily(journal, 8);
  await journal.labs.upsertResult({ epochDay: FROM + 3, analyte: 'estradiol', value: 200, unit: 'pg/mL', drawTime: '10:00' });
  await journal.labs.upsertResult({ epochDay: FROM + 6, analyte: 'estradiol', value: 220, unit: 'pg/mL', drawTime: '10:00' });

  const plain = await journal.qualitativeCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
  const fitted = await journal.qualitativeCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: true });

  assert.equal(plain.scaleFactor, null);
  assert.equal(plain.fitPointCount, 0);

  assert.ok(fitted.scaleFactor !== null);
  assert.equal(fitted.fitPointCount, 2);

  const day = (view: typeof plain, d: number) => view.curves[0].points.find((point) => point.day >= d)!;
  assert.ok(Math.abs(day(fitted, 5).value - day(plain, 5).value * fitted.scaleFactor!) < 1e-6);
});

test('asking for a fit with no results of your own leaves the curve where it was, and still draws it', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 5);
  await doseDaily(journal, 8);

  const view = await journal.qualitativeCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: true });

  assert.equal(view.scaleFactor, null);
  assert.equal(view.fitPointCount, 0);
  assert.equal(view.curves.length, 1);
});

test('no fit is attempted while the model is knowingly drawing less than went in', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 5);
  await doseDaily(journal, 4);
  await journal.doses.upsertDose({ timestamp: at(FROM + 5), route: 'oral', dose: 1, doseUnit: 'tablet' });
  await journal.labs.upsertResult({ epochDay: FROM + 6, analyte: 'estradiol', value: 200, unit: 'pg/mL', drawTime: '09:00' });

  const view = await journal.qualitativeCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: true });

  assert.equal(view.dosesWithoutMilligrams, 1);
  assert.equal(view.scaleFactor, null);
  assert.equal(view.labPoints.length, 1);
});

test('a dose before the window still feeds the first hours of it', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 5);
  await journal.doses.upsertDose({ timestamp: at(FROM, 2), route: 'oral', dose: 2, doseUnit: 'mg' });

  const view = await journal.qualitativeCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.equal(view.curves.length, 1);
  assert.equal(view.curves[0].doseCount, 1);
  assert.ok(view.curves[0].points[0].value >= 0);
});

test('nothing dosed at all is an empty view rather than a flat line at zero', async () => {
  const { journal } = await journalWithBuiltIns();

  const view = await journal.qualitativeCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: true });

  assert.deepEqual(view.curves, []);
  assert.deepEqual(view.labPoints, []);
  assert.equal(view.scaleFactor, null);
});

test('a dose under a non-estradiol regimen draws nothing', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 5, { drug: 'progesterone' });
  await doseDaily(journal, 4);

  const view = await journal.qualitativeCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
  assert.deepEqual(view.curves, []);
});
