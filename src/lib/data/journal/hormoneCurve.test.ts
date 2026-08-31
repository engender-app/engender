/* The hormone curve area (phase 4 tickets 10 and 11): every curve the screen
   draws, over one read of the dose log, with the user's own lab results
   placed against them and recomputed on every read.

   Three parts, in this order: the band (injectable estradiol esters), the
   shapes (everything else this app draws, per hormone), and the arithmetic
   the screen used to hold - the axes, the unit and the ester matching rule
   (phase 5 audit-deepening ticket 17). The shape tests moved here with
   their area.

   The caching tests (ticket 04, phase 5 performance audit finding 06) spy on
   esterCurves and qualitativeCurves rather than counting anything the caches
   themselves expose, so what they prove is what the screen actually gets:
   whether the 313-sample-per-day model underneath getCurves ran again, not
   whether some internal flag was set. */

import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { startOfDayTimestamp } from '../epochDay.ts';
import { CURVE_DRUGS, type CurveDrug } from '../hormoneDrug.ts';
import { journalWithBuiltIns } from './test-support.ts';
import type { Journal } from './journal.ts';
import type { QualitativeSection } from './hormoneCurve.ts';
import * as hormoneCurveModel from '../hormoneCurve.ts';
import * as qualitativeCurveModel from '../hormoneCurveQualitative.ts';

const at = (epochDay: number, hour = 8) => startOfDayTimestamp(epochDay) + hour * 3600000;

const FROM = 19000;
const TO = 19084;
/** The shapes act over hours and days where an injection acts over weeks, so
    their own tests use a window the width of the original ticket 11 file's. */
const SHAPE_TO = 19010;

async function episode(journal: Journal, startEpochDay: number, overrides: Partial<Parameters<Journal['regimen']['upsertEpisode']>[0]> = {}) {
  return journal.regimen.upsertEpisode({
    drug: 'estradiol valerate',
    ester: 'valerate',
    dose: 5,
    doseUnit: 'mg',
    route: 'im',
    interval: 'every 7 days',
    startEpochDay,
    endEpochDay: null,
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

  assert.equal(view.injectable.charts.length, 1);
  assert.equal(view.injectable.charts[0].ester, 'valerate');
  assert.equal(view.injectable.charts[0].doseCount, 12);
  assert.ok(view.injectable.charts[0].band.some((point) => point.upper > point.lower));
});

test('the user’s own estradiol results are overlaid, as logged and placed on the curve’s axis', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);
  await journal.labs.upsertResult({ epochDay: FROM + 20, analyte: 'estradiol', value: 180, unit: 'pg/mL', drawTime: '09:30' });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.equal(view.injectable.labPoints.length, 1);
  assert.equal(view.injectable.labPoints[0].result.value, 180);
  assert.equal(view.injectable.labPoints[0].result.unit, 'pg/mL');
  assert.equal(view.injectable.labPoints[0].value, 180);
  // 09:30 on day FROM+20, so a bit over a third of the way into it.
  assert.ok(Math.abs(view.injectable.labPoints[0].day - (FROM + 20 + 9.5 / 24)) < 0.01);
});

test('a result logged in pmol/L is placed by its converted value and still reads as pmol/L', async () => {
  // ADR-0026 both ways round: the native value stays what the screen shows,
  // and the conversion is only how the point finds its height.
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);
  await journal.labs.upsertResult({ epochDay: FROM + 20, analyte: 'estradiol', value: 367.1, unit: 'pmol/L' });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.equal(view.injectable.labPoints[0].result.unit, 'pmol/L');
  assert.ok(Math.abs(view.injectable.labPoints[0].value - 100) < 0.01);
  assert.equal(view.labPointsOffAxis, 0);
});

test('an estradiol result in a unit outside the allowlist is counted, never converted by guesswork', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);
  await journal.labs.upsertResult({ epochDay: FROM + 20, analyte: 'estradiol', value: 5, unit: 'ng/L?' });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.deepEqual(view.injectable.labPoints, []);
  assert.equal(view.labPointsOffAxis, 1);
});

test('another analyte’s results are not overlaid on an estradiol curve', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);
  await journal.labs.upsertResult({ epochDay: FROM + 20, analyte: 'testosterone', value: 20, unit: 'ng/dL' });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.deepEqual(view.injectable.labPoints, []);
  assert.equal(view.labPointsOffAxis, 0);
});

test('results outside the window are not overlaid', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);
  await journal.labs.upsertResult({ epochDay: FROM - 5, analyte: 'estradiol', value: 180, unit: 'pg/mL' });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
  assert.deepEqual(view.injectable.labPoints, []);
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

  assert.equal(plain.injectable.scaleFactor, null);
  assert.equal(plain.injectable.fitPointCount, 0);

  assert.ok(fitted.injectable.scaleFactor !== null);
  assert.ok(fitted.injectable.scaleFactor > 1, `expected the curve to be scaled up, got ${fitted.injectable.scaleFactor}`);
  assert.equal(fitted.injectable.fitPointCount, 2);

  const day = (view: typeof plain, d: number) => view.injectable.charts[0].band.find((point) => point.day >= d)!;
  assert.ok(Math.abs(day(fitted, 50).upper - day(plain, 50).upper * fitted.injectable.scaleFactor!) < 1e-6);
});

test('asking for a fit with no results of your own leaves the curve where it was, and still draws it', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: true });

  assert.equal(view.injectable.scaleFactor, null);
  assert.equal(view.injectable.fitPointCount, 0);
  assert.equal(view.injectable.charts.length, 1);
  assert.ok(view.injectable.charts[0].band.some((point) => point.upper > 0));
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

  assert.equal(view.injectable.dosesWithoutMilligrams, 1);
  assert.equal(view.injectable.scaleFactor, null);
  assert.equal(view.injectable.labPoints.length, 1);
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

  assert.equal(view.injectable.charts.length, 1);
  assert.equal(view.injectable.charts[0].doseCount, 1);
  assert.ok(view.injectable.charts[0].band[0].upper > 0, 'the window should open part-way down the previous injection');
});

test('nothing injected at all is an empty view rather than a flat line at zero', async () => {
  const { journal } = await journalWithBuiltIns();

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: true });

  assert.deepEqual(view.injectable.charts, []);
  assert.deepEqual(view.injectable.labPoints, []);
  assert.equal(view.injectable.scaleFactor, null);
});

test('a result is attributed to the ester that was in effect when it was drawn', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30, { endEpochDay: FROM + 39 });
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
    view.injectable.labPoints.map((point) => [point.result.value, point.ester]),
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

  assert.equal(view.injectable.labPoints.length, 1);
  assert.equal(view.injectable.labPoints[0].ester, null);
});

test('a result drawn under a non-estradiol regimen is attributed to no ester either', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30, { drug: 'testosterone enanthate', ester: 'enanthate' });
  await journal.labs.upsertResult({ epochDay: FROM + 2, analyte: 'estradiol', value: 90, unit: 'pg/mL', drawTime: '09:00' });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.equal(view.injectable.labPoints[0].ester, null);
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

  assert.equal(view.injectable.charts.length, 1);
  assert.equal(view.injectable.subcutaneousDoses, 1);
});

test('an all-intramuscular log has nothing to state about the subcutaneous route', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 4);

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
  assert.equal(view.injectable.subcutaneousDoses, 0);
});

test('an ester with no curve worth drawing produces no curve and no special case', async () => {
  // Polyestradiol phosphate and undecylate both land here now: the model has
  // nothing to say about either, and the screen's one empty state covers it.
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30, { drug: 'polyestradiol phosphate', ester: null, dose: 80 });
  await injectWeekly(journal, 4, { dose: 80 });

  const pep = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
  assert.deepEqual(pep.injectable.charts, []);

  const { journal: second } = await journalWithBuiltIns();
  await episode(second, FROM - 30, { drug: 'estradiol undecylate', ester: 'undecylate', dose: 50 });
  await injectWeekly(second, 4, { dose: 50 });

  const undecylate = await second.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
  assert.deepEqual(undecylate.injectable.charts, []);
});

test('asking for the same window twice models it once', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);

  const spy = vi.spyOn(hormoneCurveModel, 'esterCurves');
  try {
    await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
    await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
    assert.equal(spy.mock.calls.length, 1);
  } finally {
    spy.mockRestore();
  }
});

test('switching windows twice does not model the curve twice', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);

  const spy = vi.spyOn(hormoneCurveModel, 'esterCurves');
  try {
    await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
    // A different window: a genuine miss.
    await journal.hormoneCurve.getCurves({ fromEpochDay: FROM + 10, toEpochDay: TO + 10, fitToOwnLabs: false });
    assert.equal(spy.mock.calls.length, 2);

    // Back to the first window: already modelled, so this must not model it
    // again.
    await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
    assert.equal(spy.mock.calls.length, 2);
  } finally {
    spy.mockRestore();
  }
});

test('toggling the fit switch does not re-model the population it fits against', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);
  await journal.labs.upsertResult({ epochDay: FROM + 40, analyte: 'estradiol', value: 600, unit: 'pg/mL', drawTime: '09:00' });

  const spy = vi.spyOn(hormoneCurveModel, 'esterCurves');
  try {
    await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
    const fitted = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: true });

    assert.equal(spy.mock.calls.length, 1, 'the fit switch changes the scale, not the doses or the window');
    assert.ok(fitted.injectable.scaleFactor !== null);
  } finally {
    spy.mockRestore();
  }
});

test('a dose write invalidates the cached model for that window', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);

  const spy = vi.spyOn(hormoneCurveModel, 'esterCurves');
  try {
    const before = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
    await journal.doses.upsertDose({
      timestamp: at(FROM + 50),
      route: 'im',
      dose: 5,
      doseUnit: 'mg',
      injectionSite: 'thigh-left',
      vehicle: 'oil'
    });
    const after = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

    assert.equal(spy.mock.calls.length, 2, 'a dose write must not be served from the stale cache');
    assert.equal(after.injectable.charts[0].doseCount, before.injectable.charts[0].doseCount + 1);
  } finally {
    spy.mockRestore();
  }
});

test('an episode write invalidates the cached model for that window', async () => {
  // The population model reads episodes too (attributeDose), so an edited
  // regimen must not be served a band drawn against the old one.
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30, { endEpochDay: FROM + 39 });
  await injectWeekly(journal, 12);

  const spy = vi.spyOn(hormoneCurveModel, 'esterCurves');
  try {
    await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
    await episode(journal, FROM + 40, { drug: 'estradiol enanthate', ester: 'enanthate', interval: 'every 14 days' });
    const after = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

    assert.equal(spy.mock.calls.length, 2);
    assert.equal(after.injectable.charts.length, 2, 'the new episode has its own ester and so its own curve');
  } finally {
    spy.mockRestore();
  }
});

test('a lab result write changes the fit without re-modelling the population', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);

  const spy = vi.spyOn(hormoneCurveModel, 'esterCurves');
  try {
    const before = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: true });
    assert.equal(before.injectable.labPoints.length, 0);

    await journal.labs.upsertResult({ epochDay: FROM + 20, analyte: 'estradiol', value: 180, unit: 'pg/mL' });
    const after = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: true });

    assert.equal(after.injectable.labPoints.length, 1);
    assert.equal(spy.mock.calls.length, 1, 'a lab write changes what the fit reads, not the doses the population is drawn from');
  } finally {
    spy.mockRestore();
  }
});

// --- the shapes (phase 4 ticket 11) ---------------------------------------
// Illustrative rise/plateau/fall curves over the dose log for everything the
// band has no published fit for, with the user's own results placed on the
// same axis - never drawn on top of a shape, but what its optional factor is
// fitted from.

async function shapeEpisode(
  journal: Journal,
  startEpochDay: number,
  overrides: Partial<Parameters<Journal['regimen']['upsertEpisode']>[0]> = {}
) {
  return journal.regimen.upsertEpisode({
    drug: 'estradiol',
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'every day',
    startEpochDay,
    endEpochDay: null,
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

/** One hormone's section, or null when it has nothing to draw. The section is
    what the screen loops over, so a test that wants "estradiol's shapes" asks
    the same way. */
async function shapes(journal: Journal, drug: CurveDrug, fitToOwnLabs = false): Promise<QualitativeSection | null> {
  const view = await journal.hormoneCurve.getCurves({
    fromEpochDay: FROM,
    toEpochDay: SHAPE_TO,
    fitToOwnLabs
  });
  return view.qualitative.sections.find((section) => section.drug === drug) ?? null;
}

test('a daily oral regimen gets one shape, drawn from the dose log', async () => {
  const { journal } = await journalWithBuiltIns();
  await shapeEpisode(journal, FROM - 5);
  await doseDaily(journal, 8);

  const section = await shapes(journal, 'estradiol');

  assert.equal(section?.charts.length, 1);
  assert.equal(section?.charts[0].key, 'estradiol:oral');
  assert.equal(section?.charts[0].doseCount, 8);
  assert.ok(section?.charts[0].points.some((point) => point.value > 0));
});

test('two routes dosed in one window get a shape each', async () => {
  const { journal } = await journalWithBuiltIns();
  await shapeEpisode(journal, FROM - 5);
  await doseDaily(journal, 3);
  await journal.doses.upsertDose({ timestamp: at(FROM + 4), route: 'gel', dose: 1.5, doseUnit: 'mg', applicationSite: 'abdomen' });

  const section = await shapes(journal, 'estradiol');

  assert.deepEqual(
    section?.charts.map((chart) => chart.key),
    ['estradiol:oral', 'estradiol:gel']
  );
});

test('the shapes read the user’s own results off the same axis the band does', async () => {
  const { journal } = await journalWithBuiltIns();
  await shapeEpisode(journal, FROM - 5);
  await doseDaily(journal, 8);
  await journal.labs.upsertResult({ epochDay: FROM + 4, analyte: 'estradiol', value: 80, unit: 'pg/mL', drawTime: '09:30' });

  const section = await shapes(journal, 'estradiol');

  assert.equal(section?.labPoints.length, 1);
  assert.equal(section?.labPoints[0].result.value, 80);
  assert.equal(section?.labPoints[0].result.unit, 'pg/mL');
  assert.equal(section?.labPoints[0].value, 80);
});

test('a result logged in pmol/L reaches a shape by its converted value and still reads as pmol/L', async () => {
  const { journal } = await journalWithBuiltIns();
  await shapeEpisode(journal, FROM - 5);
  await doseDaily(journal, 8);
  await journal.labs.upsertResult({ epochDay: FROM + 4, analyte: 'estradiol', value: 367.1, unit: 'pmol/L' });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: SHAPE_TO, fitToOwnLabs: false });
  const section = view.qualitative.sections[0];

  assert.equal(section.labPoints[0].result.unit, 'pmol/L');
  assert.ok(Math.abs(section.labPoints[0].value - 100) < 0.01);
  assert.equal(view.labPointsOffAxis, 0);
});

test('results outside the window are not placed against a shape', async () => {
  const { journal } = await journalWithBuiltIns();
  await shapeEpisode(journal, FROM - 5);
  await doseDaily(journal, 8);
  await journal.labs.upsertResult({ epochDay: FROM - 20, analyte: 'estradiol', value: 80, unit: 'pg/mL' });

  const section = await shapes(journal, 'estradiol');
  assert.deepEqual(section?.labPoints, []);
});

test('declining the fit leaves the published shape alone; asking for it moves the shape onto the user’s own points', async () => {
  const { journal } = await journalWithBuiltIns();
  await shapeEpisode(journal, FROM - 5);
  await doseDaily(journal, 8);
  await journal.labs.upsertResult({ epochDay: FROM + 3, analyte: 'estradiol', value: 200, unit: 'pg/mL', drawTime: '10:00' });
  await journal.labs.upsertResult({ epochDay: FROM + 6, analyte: 'estradiol', value: 220, unit: 'pg/mL', drawTime: '10:00' });

  const plain = await shapes(journal, 'estradiol', false);
  const fitted = await shapes(journal, 'estradiol', true);

  assert.equal(plain?.scaleFactor, null);
  assert.equal(plain?.fitPointCount, 0);

  assert.ok(fitted !== null && fitted.scaleFactor !== null);
  assert.equal(fitted.fitPointCount, 2);

  const day = (section: QualitativeSection, d: number) => section.charts[0].points.find((point) => point.day >= d)!;
  assert.ok(Math.abs(day(fitted, 5).value - day(plain!, 5).value * fitted.scaleFactor!) < 1e-6);
});

test('asking for a fit with no results of your own leaves the shape where it was, and still draws it', async () => {
  const { journal } = await journalWithBuiltIns();
  await shapeEpisode(journal, FROM - 5);
  await doseDaily(journal, 8);

  const section = await shapes(journal, 'estradiol', true);

  assert.equal(section?.scaleFactor, null);
  assert.equal(section?.fitPointCount, 0);
  assert.equal(section?.charts.length, 1);
});

test('no shape fit is attempted while the model is knowingly drawing less than went in', async () => {
  const { journal } = await journalWithBuiltIns();
  await shapeEpisode(journal, FROM - 5);
  await doseDaily(journal, 4);
  await journal.doses.upsertDose({ timestamp: at(FROM + 5), route: 'oral', dose: 1, doseUnit: 'tablet' });
  await journal.labs.upsertResult({ epochDay: FROM + 6, analyte: 'estradiol', value: 200, unit: 'pg/mL', drawTime: '09:00' });

  const section = await shapes(journal, 'estradiol', true);

  assert.equal(section?.dosesWithoutMilligrams, 1);
  assert.equal(section?.scaleFactor, null);
  assert.equal(section?.labPoints.length, 1);
});

test('a dose before the window still feeds the first hours of a shape', async () => {
  const { journal } = await journalWithBuiltIns();
  await shapeEpisode(journal, FROM - 5);
  await journal.doses.upsertDose({ timestamp: at(FROM, 2), route: 'oral', dose: 2, doseUnit: 'mg' });

  const section = await shapes(journal, 'estradiol');

  assert.equal(section?.charts.length, 1);
  assert.equal(section?.charts[0].doseCount, 1);
  assert.ok(section!.charts[0].points[0].value >= 0);
});

test('nothing dosed at all leaves no section rather than a flat line at zero', async () => {
  const { journal } = await journalWithBuiltIns();

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: SHAPE_TO, fitToOwnLabs: true });

  assert.deepEqual(view.qualitative.sections, []);
  assert.deepEqual(view.injectable.charts, []);
});

test('a dose under a non-estradiol regimen draws no estradiol shape', async () => {
  const { journal } = await journalWithBuiltIns();
  await shapeEpisode(journal, FROM - 5, { drug: 'progesterone' });
  await doseDaily(journal, 4);

  assert.equal(await shapes(journal, 'estradiol'), null);
});

test('a daily testosterone gel regimen gets its own shape, fitted against testosterone results', async () => {
  const { journal } = await journalWithBuiltIns();
  await shapeEpisode(journal, FROM - 5, { drug: 'testosterone', route: 'gel' });
  for (let i = 0; i < 8; i++) {
    await journal.doses.upsertDose({ timestamp: at(FROM + i), route: 'gel', dose: 50, doseUnit: 'mg', applicationSite: 'shoulder' });
  }
  await journal.labs.upsertResult({ epochDay: FROM + 4, analyte: 'testosterone', value: 480, unit: 'ng/dL', drawTime: '10:00' });

  const section = await shapes(journal, 'testosterone', true);

  assert.equal(section?.charts.length, 1);
  assert.equal(section?.charts[0].key, 'testosterone:gel');
  assert.equal(section?.charts[0].doseCount, 8);
  assert.equal(section?.labPoints.length, 1);
  assert.ok(section!.scaleFactor !== null);
  assert.equal(section?.fitPointCount, 1);
});

test('a testosterone result logged in nmol/L is placed by conversion and keeps its own unit', async () => {
  const { journal } = await journalWithBuiltIns();
  await shapeEpisode(journal, FROM - 5, { drug: 'testosterone', route: 'gel' });
  await journal.doses.upsertDose({ timestamp: at(FROM), route: 'gel', dose: 50, doseUnit: 'mg', applicationSite: 'shoulder' });
  await journal.labs.upsertResult({ epochDay: FROM + 1, analyte: 'testosterone', value: 17, unit: 'nmol/L', drawTime: '09:00' });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: SHAPE_TO, fitToOwnLabs: false });
  const section = view.qualitative.sections[0];

  assert.equal(section.labPoints.length, 1);
  assert.equal(view.labPointsOffAxis, 0);
  // ADR-0026: the native value and unit stay exactly as logged.
  assert.equal(section.labPoints[0].result.unit, 'nmol/L');
  assert.equal(section.labPoints[0].result.value, 17);
  // Placed on the ng/dL axis the testosterone curve is drawn in.
  assert.ok(Math.abs(section.labPoints[0].value - 17 * 28.842) < 1e-6);
});

test('neither hormone’s results reach the other hormone’s shape', async () => {
  /* Both gels dosed, both analytes logged. Each hormone's section must see
     only its own hormone's doses and only its own hormone's results -
     crossing either way would fit a curve to a measurement of a different
     molecule. One call answers for both now, which is exactly why this is
     worth pinning here: the two used to be separate calls that could not
     reach each other's rows even by accident. */
  const { journal } = await journalWithBuiltIns();
  await shapeEpisode(journal, FROM - 5, { drug: 'estradiol', route: 'gel' });
  await journal.doses.upsertDose({ timestamp: at(FROM), route: 'gel', dose: 2, doseUnit: 'mg', applicationSite: 'thigh' });
  await journal.labs.upsertResult({ epochDay: FROM, analyte: 'estradiol', value: 210, unit: 'pg/mL', drawTime: '10:00' });

  // Both episodes are concurrently active by now (phase 5 ticket 38), so the
  // dose names its own drug the way the dose editor would have prompted for
  // it - see hormoneCurveQualitative.test.ts for the drug-less, ambiguous
  // case at the pure-function seam.
  await shapeEpisode(journal, FROM + 3, { drug: 'testosterone', route: 'gel' });
  await journal.doses.upsertDose({
    timestamp: at(FROM + 4),
    route: 'gel',
    dose: 50,
    doseUnit: 'mg',
    applicationSite: 'shoulder',
    drug: 'testosterone'
  });
  await journal.labs.upsertResult({ epochDay: FROM + 4, analyte: 'testosterone', value: 500, unit: 'ng/dL', drawTime: '10:00' });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: SHAPE_TO, fitToOwnLabs: true });
  const e2 = view.qualitative.sections.find((section) => section.drug === 'estradiol')!;
  const t = view.qualitative.sections.find((section) => section.drug === 'testosterone')!;

  assert.equal(e2.charts.length, 1);
  assert.equal(e2.charts[0].doseCount, 1);
  assert.deepEqual(e2.labPoints.map((point) => point.result.analyte), ['estradiol']);

  assert.equal(t.charts.length, 1);
  assert.equal(t.charts[0].doseCount, 1);
  assert.deepEqual(t.labPoints.map((point) => point.result.analyte), ['testosterone']);

  // Two separate fits, each from its own single point, in its own unit.
  assert.ok(e2.scaleFactor !== null && t.scaleFactor !== null);
  assert.notEqual(e2.scaleFactor, t.scaleFactor);
  assert.deepEqual([e2.unit, t.unit], ['pg/mL', 'ng/dL']);
});

test('a testosterone injection on an ester with no shape draws nothing at this seam either', async () => {
  const { journal } = await journalWithBuiltIns();
  await shapeEpisode(journal, FROM - 5, { drug: 'testosterone', ester: 'undecanoate', route: 'IM' });
  await journal.doses.upsertDose({
    timestamp: at(FROM),
    route: 'im',
    dose: 1000,
    doseUnit: 'mg',
    injectionSite: 'dorsogluteal-left',
    vehicle: 'oil'
  });

  assert.equal(await shapes(journal, 'testosterone'), null);
});

test('a weekly testosterone injection gets a shape, fitted against testosterone results', async () => {
  const { journal } = await journalWithBuiltIns();
  await shapeEpisode(journal, FROM - 5, { drug: 'testosterone', ester: 'cypionate', route: 'IM' });
  for (const day of [FROM, FROM + 7]) {
    await journal.doses.upsertDose({
      timestamp: at(day),
      route: 'im',
      dose: 100,
      doseUnit: 'mg',
      injectionSite: 'thigh-left',
      vehicle: 'oil'
    });
  }
  await journal.labs.upsertResult({ epochDay: FROM + 2, analyte: 'testosterone', value: 610, unit: 'ng/dL', drawTime: '09:00' });

  const section = await shapes(journal, 'testosterone', true);

  assert.equal(section?.charts.length, 1);
  assert.equal(section?.charts[0].key, 'testosterone:injected');
  assert.equal(section?.charts[0].doseCount, 2);
  assert.ok(section!.scaleFactor !== null);
  assert.equal(section?.fitPointCount, 1);

  /* The shape peaks a day or two after the injection rather than at it, which
     is what separates it from the topical shapes. */
  const valueAt = (day: number) => section!.charts[0].points.find((point) => point.day >= day)!.value;
  assert.ok(valueAt(FROM + 1.5) > valueAt(FROM + 0.1));
});

test('one call models each hormone once, and asking twice models neither again', async () => {
  const { journal } = await journalWithBuiltIns();
  await shapeEpisode(journal, FROM - 5);
  await doseDaily(journal, 8);

  const spy = vi.spyOn(qualitativeCurveModel, 'qualitativeCurves');
  try {
    await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: SHAPE_TO, fitToOwnLabs: false });
    assert.equal(spy.mock.calls.length, CURVE_DRUGS.length, 'one model run per hormone this app curves');

    /* And the second call none: the cache is keyed by drug as well as window,
       so neither hormone evicts the other's slot. A key without the drug in
       it would evict on every call and this would be twice as high. */
    await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: SHAPE_TO, fitToOwnLabs: false });
    assert.equal(spy.mock.calls.length, CURVE_DRUGS.length);
  } finally {
    spy.mockRestore();
  }
});

test('switching windows twice does not model the shapes twice', async () => {
  const { journal } = await journalWithBuiltIns();
  await shapeEpisode(journal, FROM - 5);
  await doseDaily(journal, 8);

  const spy = vi.spyOn(qualitativeCurveModel, 'qualitativeCurves');
  try {
    await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: SHAPE_TO, fitToOwnLabs: false });
    await journal.hormoneCurve.getCurves({ fromEpochDay: FROM + 3, toEpochDay: SHAPE_TO + 3, fitToOwnLabs: false });
    assert.equal(spy.mock.calls.length, 2 * CURVE_DRUGS.length);

    await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: SHAPE_TO, fitToOwnLabs: false });
    assert.equal(spy.mock.calls.length, 2 * CURVE_DRUGS.length);
  } finally {
    spy.mockRestore();
  }
});

test('an episode write invalidates the cached shapes for that window', async () => {
  // The population model reads episodes too (attributeDose), so an edited
  // regimen must not be served curves drawn against the old one.
  const { journal } = await journalWithBuiltIns();
  const episodeId = await shapeEpisode(journal, FROM - 5);
  await journal.doses.upsertDose({ timestamp: at(FROM + 2), route: 'oral', dose: 2, doseUnit: 'mg' });

  const spy = vi.spyOn(qualitativeCurveModel, 'qualitativeCurves');
  try {
    assert.equal((await shapes(journal, 'estradiol'))?.charts.length, 1);

    // Ending the episode before the dose was drawn leaves it with no active
    // episode to attribute to, so it drops out of the curve entirely - a
    // change this app can only see by re-reading episodes.
    await journal.regimen.endEpisode(episodeId, FROM + 1);

    assert.equal(await shapes(journal, 'estradiol'), null);
    assert.equal(spy.mock.calls.length, 2 * CURVE_DRUGS.length, 'an episode write must not be served from the stale cache');
  } finally {
    spy.mockRestore();
  }
});

test('a dose write invalidates the cached shapes for that window', async () => {
  const { journal } = await journalWithBuiltIns();
  await shapeEpisode(journal, FROM - 5);
  await doseDaily(journal, 8);

  const spy = vi.spyOn(qualitativeCurveModel, 'qualitativeCurves');
  try {
    const before = await shapes(journal, 'estradiol');
    await journal.doses.upsertDose({ timestamp: at(FROM + 9), route: 'oral', dose: 2, doseUnit: 'mg' });
    const after = await shapes(journal, 'estradiol');

    assert.equal(spy.mock.calls.length, 2 * CURVE_DRUGS.length, 'a dose write must not be served from the stale cache');
    assert.equal(after!.charts[0].doseCount, before!.charts[0].doseCount + 1);
  } finally {
    spy.mockRestore();
  }
});

test('a lab result write changes a shape’s fit without re-modelling the population', async () => {
  const { journal } = await journalWithBuiltIns();
  await shapeEpisode(journal, FROM - 5);
  await doseDaily(journal, 8);

  const spy = vi.spyOn(qualitativeCurveModel, 'qualitativeCurves');
  try {
    assert.equal((await shapes(journal, 'estradiol', true))?.labPoints.length, 0);

    await journal.labs.upsertResult({ epochDay: FROM + 4, analyte: 'estradiol', value: 80, unit: 'pg/mL', drawTime: '09:30' });

    assert.equal((await shapes(journal, 'estradiol', true))?.labPoints.length, 1);
    assert.equal(
      spy.mock.calls.length,
      CURVE_DRUGS.length,
      'a lab write changes what the fit reads, not the doses the population is drawn from'
    );
  } finally {
    spy.mockRestore();
  }
});

// --- the axes, the unit and the ester matching rule -----------------------
// What the screen used to hold, untested, in markup (phase 5
// audit-deepening ticket 17): which chart a result belongs on, how high
// the axis reaches, and whether a unit may be printed beside a shape at
// all.

test('a result the dose log cannot attribute to an ester goes on every ester’s chart', async () => {
  /* Two esters drawn, and three results: one under each episode, and one
     drawn before any episode existed. The unattributed one belongs to no
     chart in particular, so it appears on both rather than disappearing. */
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM, { endEpochDay: FROM + 39 });
  await episode(journal, FROM + 40, { drug: 'estradiol enanthate', ester: 'enanthate', interval: 'every 14 days' });
  await injectWeekly(journal, 12);
  await journal.labs.upsertResult({ epochDay: FROM - 1, analyte: 'estradiol', value: 90, unit: 'pg/mL', drawTime: '09:00' });
  await journal.labs.upsertResult({ epochDay: FROM + 10, analyte: 'estradiol', value: 200, unit: 'pg/mL', drawTime: '09:00' });
  await journal.labs.upsertResult({ epochDay: FROM + 60, analyte: 'estradiol', value: 240, unit: 'pg/mL', drawTime: '09:00' });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM - 1, toEpochDay: TO, fitToOwnLabs: false });

  assert.deepEqual(
    view.injectable.charts.map((chart) => [chart.ester, chart.labPoints.map((point) => point.result.value)]),
    [
      ['valerate', [90, 200]],
      ['enanthate', [90, 240]]
    ]
  );
});

test('the shared axis clears the tallest thing on it, band or result', async () => {
  /* A draw far above the band. The axis is what decides whether it is drawn
     at all, and a result clipped off the top is the number on this screen
     that matters most going missing. */
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);
  await journal.labs.upsertResult({ epochDay: FROM + 40, analyte: 'estradiol', value: 3000, unit: 'pg/mL', drawTime: '09:00' });

  const { injectable } = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  for (const chart of injectable.charts) {
    for (const point of chart.band) assert.ok(point.upper <= injectable.axisMax, 'a band edge above its own axis');
    for (const point of chart.labPoints) {
      assert.ok(point.value <= injectable.axisMax, `a result at ${point.value} is off an axis of ${injectable.axisMax}`);
    }
  }
  assert.ok(injectable.axisMax >= 3000);
});

test('an empty band still has an axis to draw nothing against', async () => {
  const { journal } = await journalWithBuiltIns();

  const { injectable } = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.deepEqual(injectable.charts, []);
  assert.equal(injectable.axisMax, 400);
});

test('unfitted shapes get their own scale and no unit; a fit gives them one axis and one unit', async () => {
  /* Two routes of the same hormone, dosed far apart in amount. Unfitted, the
     height of one has nothing to do with the height of the other, so sharing
     a scale would imply a comparison this app cannot back up - and no unit
     may be printed at all. */
  const { journal } = await journalWithBuiltIns();
  await shapeEpisode(journal, FROM - 5);
  await doseDaily(journal, 6);
  await journal.doses.upsertDose({ timestamp: at(FROM + 2), route: 'gel', dose: 0.1, doseUnit: 'mg', applicationSite: 'thigh' });
  await journal.labs.upsertResult({ epochDay: FROM + 3, analyte: 'estradiol', value: 150, unit: 'pg/mL', drawTime: '10:00' });

  const plain = (await shapes(journal, 'estradiol', false))!;
  assert.equal(plain.unit, null);
  assert.equal(plain.charts.length, 2);
  assert.notEqual(plain.charts[0].axisMax, plain.charts[1].axisMax);
  for (const chart of plain.charts) {
    for (const point of chart.points) assert.ok(point.value <= chart.axisMax);
  }

  const fitted = (await shapes(journal, 'estradiol', true))!;
  assert.ok(fitted.scaleFactor !== null);
  assert.equal(fitted.unit, 'pg/mL');
  assert.equal(fitted.charts[0].axisMax, fitted.charts[1].axisMax);
  for (const chart of fitted.charts) {
    for (const point of chart.points) assert.ok(point.value <= chart.axisMax);
  }
});

test('the whole screen reads the dose log once, and each analyte once', async () => {
  /* The three queries this replaced read the dose log three times and asked
     for the used analytes three times (phase 5 audit-deepening ticket 17). */
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);
  await journal.labs.upsertResult({ epochDay: FROM + 10, analyte: 'estradiol', value: 200, unit: 'pg/mL', drawTime: '09:00' });
  await journal.labs.upsertResult({ epochDay: FROM + 20, analyte: 'testosterone', value: 20, unit: 'ng/dL', drawTime: '09:00' });

  const doses = vi.spyOn(journal.doses, 'getDoses');
  const usedAnalytes = vi.spyOn(journal.labs, 'getUsedAnalytes');
  const results = vi.spyOn(journal.labs, 'getResults');
  try {
    await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: true });

    assert.equal(doses.mock.calls.length, 1);
    assert.equal(usedAnalytes.mock.calls.length, 1);
    assert.deepEqual(results.mock.calls.map(([analyte]) => analyte).sort(), ['estradiol', 'testosterone']);
  } finally {
    doses.mockRestore();
    usedAnalytes.mockRestore();
    results.mockRestore();
  }
});

test('a result whose unit converts for neither hormone is counted once, not once per curve', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, FROM - 30);
  await injectWeekly(journal, 12);
  await journal.labs.upsertResult({ epochDay: FROM + 10, analyte: 'estradiol', value: 5, unit: 'ng/L?' });

  const view = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });

  assert.equal(view.labPointsOffAxis, 1);
  assert.deepEqual(view.injectable.labPoints, []);
});
