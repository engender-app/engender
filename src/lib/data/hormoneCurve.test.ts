import assert from 'node:assert/strict';
import { test } from 'vitest';
import { startOfDayTimestamp } from './epochDay.ts';
import type { DoseEvent, RegimenEpisode } from './types.ts';
import {
  BAND_PERCENTILES,
  CURVE_LOOKBACK_DAYS,
  CURVE_UNIT,
  bandMidpointAt,
  esterCurves,
  scaleCurves,
  settlingDays
} from './hormoneCurve.ts';
import { ESTER_POSTERIORS } from './hormoneCurveModels.ts';

function episode(ester: string, over: Partial<RegimenEpisode> = {}): RegimenEpisode {
  return {
    id: 'ep',
    drug: 'estradiol',
    ester,
    dose: 5,
    doseUnit: 'mg',
    route: 'IM',
    interval: 'every 7 days',
    startEpochDay: -1000,
    hidden: false,
    ...over
  };
}

function dose(epochDay: number, over: Partial<Extract<DoseEvent, { route: 'im' | 'sc' }>> = {}): DoseEvent {
  return {
    id: `d${epochDay}`,
    timestamp: startOfDayTimestamp(epochDay) + 12 * 3600000,
    dose: 5,
    doseUnit: 'mg',
    status: 'taken',
    scheduled: null,
    route: 'im',
    injectionSite: 'thigh-left',
    vehicle: 'oil',
    ...over
  };
}

const WINDOW = { fromEpochDay: 0, toEpochDay: 28 };

test('the model reports the unit it works in, and the band percentiles it draws', () => {
  assert.equal(CURVE_UNIT, 'pg/mL');
  assert.deepEqual(BAND_PERCENTILES, [5, 95]);
});

test('one curve per ester dosed in the window, from the dose log', () => {
  const result = esterCurves({
    doses: [dose(0), dose(7), dose(14), dose(21)],
    episodes: [episode('valerate')],
    ...WINDOW
  });

  assert.equal(result.curves.length, 1);
  assert.equal(result.curves[0].ester, 'valerate');
  assert.equal(result.curves[0].doseCount, 4);
  assert.ok(result.curves[0].band.length > 100);
});

test('two esters dosed in one window get a curve each, never one merged line', () => {
  const result = esterCurves({
    doses: [dose(0), dose(14, { id: 'later' })],
    episodes: [episode('valerate'), episode('cypionate', { id: 'ep2', startEpochDay: 10 })],
    ...WINDOW
  });

  assert.deepEqual(
    result.curves.map((c) => c.ester),
    ['valerate', 'cypionate']
  );
  assert.deepEqual(
    result.curves.map((c) => c.doseCount),
    [1, 1]
  );
});

test('every point of every band is a range, and a band carries no single value to draw a line from', () => {
  // Box 2 of the acceptance, pinned as a shape test as well as a value one:
  // adding a `median` or `value` to a band point is how a single-line
  // presentation would get built by accident later.
  const result = esterCurves({ doses: [dose(0), dose(7)], episodes: [episode('valerate')], ...WINDOW });
  const band = result.curves[0].band;

  for (const point of band) {
    assert.deepEqual(Object.keys(point).sort(), ['day', 'lower', 'upper']);
    assert.ok(point.lower <= point.upper, `lower ${point.lower} should not sit above upper ${point.upper}`);
    assert.ok(point.lower >= 0);
  }

  /* Before the first injection the band is legitimately a point at zero -
     nothing is in the body and every sample agrees on that. Everywhere
     after it, the two edges have to be genuinely apart. */
  const afterFirstDose = band.filter((point) => point.day > 0.5);
  assert.ok(afterFirstDose.length > 100);
  for (const point of afterFirstDose) {
    assert.ok(point.lower < point.upper, `at day ${point.day} the band collapsed to ${point.lower}`);
  }
});

test('the band spans the window that was asked for, and no more', () => {
  const result = esterCurves({ doses: [dose(0)], episodes: [episode('valerate')], ...WINDOW });
  const band = result.curves[0].band;

  assert.equal(band[0].day, 0);
  assert.equal(band[band.length - 1].day, 28);
  for (const point of band) assert.ok(point.day >= 0 && point.day <= 28);
});

test('doubling the dose doubles the whole band, because dose scales linearly within an ester', () => {
  const one = esterCurves({ doses: [dose(0)], episodes: [episode('valerate')], ...WINDOW });
  const two = esterCurves({ doses: [dose(0, { dose: 10 })], episodes: [episode('valerate')], ...WINDOW });

  for (const [i, point] of one.curves[0].band.entries()) {
    const doubled = two.curves[0].band[i];
    assert.ok(Math.abs(doubled.lower - 2 * point.lower) < 1e-9);
    assert.ok(Math.abs(doubled.upper - 2 * point.upper) < 1e-9);
  }
});

test('a second injection adds to what the first one left behind', () => {
  const once = esterCurves({ doses: [dose(0)], episodes: [episode('valerate')], ...WINDOW });
  const twice = esterCurves({ doses: [dose(0), dose(7)], episodes: [episode('valerate')], ...WINDOW });

  const at = (band: { day: number; lower: number }[], day: number) => band.find((p) => p.day >= day)!.lower;
  assert.ok(at(twice.curves[0].band, 8) > at(once.curves[0].band, 8));
  // And before the second dose the two are the same curve.
  assert.ok(Math.abs(at(twice.curves[0].band, 3) - at(once.curves[0].band, 3)) < 1e-9);
});

test('a dose before the window still raises the curve inside it', () => {
  // Why the journal area reads a lookback: an injection four days before the
  // window opens is most of what the first days of the window are made of.
  const inside = esterCurves({ doses: [dose(0)], episodes: [episode('valerate')], ...WINDOW });
  const before = esterCurves({ doses: [dose(-4)], episodes: [episode('valerate')], ...WINDOW });

  assert.ok(before.curves[0].band[0].upper > 0);
  // And it is past its peak by then, unlike the injection given on day 0.
  assert.ok(before.curves[0].band[0].upper < inside.curves[0].band.find((point) => point.day >= 2)!.upper);
  assert.equal(before.curves[0].doseCount, 1);
});

test('an injection older than its ester can still be carrying is left out of the arithmetic', () => {
  // The performance guard in bandFor. A valerate injection a year before the
  // window contributes nothing measurable, and the band must not change when
  // one is added - if it did, the reach would be cutting real signal.
  const without = esterCurves({ doses: [dose(0)], episodes: [episode('valerate')], ...WINDOW });
  const withAncient = esterCurves({
    doses: [dose(-300), dose(0)],
    episodes: [episode('valerate')],
    ...WINDOW
  });

  assert.equal(withAncient.curves[0].doseCount, 2);
  assert.deepEqual(withAncient.curves[0].band, without.curves[0].band);
});

test('the lookback covers every posterior sample of every fitted ester, with room to spare', () => {
  for (const [ester, samples] of Object.entries(ESTER_POSTERIORS)) {
    if (ester === 'undecylate') continue;
    const slowest = Math.max(...samples!.map(settlingDays));
    assert.ok(slowest < CURVE_LOOKBACK_DAYS, `${ester} needs ${slowest.toFixed(0)} days, lookback is ${CURVE_LOOKBACK_DAYS}`);
    assert.ok(slowest < 100, `${ester} settling in ${slowest.toFixed(0)} days is not what this test was written against`);
  }
});

test('undecylate is the ester the lookback cannot cover, which is part of why it is hypothetical', () => {
  // Pinned so that "a year is enough" is never read as covering this one.
  const slowest = Math.max(...ESTER_POSTERIORS.undecylate!.map(settlingDays));
  assert.ok(slowest > CURVE_LOOKBACK_DAYS * 5, `undecylate's slowest sample settles in ${slowest.toFixed(0)} days`);
});

test('undecylate is drawn, and flagged hypothetical; a fitted ester is not flagged', () => {
  const undecylate = esterCurves({ doses: [dose(0)], episodes: [episode('undecylate')], ...WINDOW });
  assert.equal(undecylate.curves[0].hypothetical, true);
  assert.ok(undecylate.curves[0].band.some((p) => p.upper > 0));

  const valerate = esterCurves({ doses: [dose(0)], episodes: [episode('valerate')], ...WINDOW });
  assert.equal(valerate.curves[0].hypothetical, false);
});

test('polyestradiol phosphate is named as an ester with no curve rather than silently dropped', () => {
  const result = esterCurves({ doses: [dose(0)], episodes: [episode('PEP')], ...WINDOW });

  assert.deepEqual(result.curves, []);
  assert.deepEqual(result.unmodelledEsters, ['polyestradiol-phosphate']);
});

test('a skipped dose puts nothing into the body and nothing into the curve', () => {
  const result = esterCurves({
    doses: [dose(0), dose(7, { status: 'skipped' })],
    episodes: [episode('valerate')],
    ...WINDOW
  });
  const only = esterCurves({ doses: [dose(0)], episodes: [episode('valerate')], ...WINDOW });

  assert.equal(result.curves[0].doseCount, 1);
  assert.deepEqual(result.curves[0].band, only.curves[0].band);
});

test('non-injectable routes are ticket 11’s, and are left out of this model entirely', () => {
  const result = esterCurves({
    doses: [{ ...dose(0), route: 'oral' } as DoseEvent, { ...dose(3), route: 'gel', applicationSite: 'arm' } as DoseEvent],
    episodes: [episode('valerate')],
    ...WINDOW
  });

  assert.deepEqual(result.curves, []);
});

test('a dose logged by volume is counted out loud rather than guessed at', () => {
  const result = esterCurves({
    doses: [dose(0), dose(7, { dose: 0.5, doseUnit: 'mL' })],
    episodes: [episode('valerate')],
    ...WINDOW
  });

  assert.equal(result.curves[0].doseCount, 1);
  assert.equal(result.dosesWithoutMilligrams, 1);
});

test('a dose under a non-estradiol regimen draws nothing, ester word or not', () => {
  const result = esterCurves({
    doses: [dose(0)],
    episodes: [episode('enanthate', { drug: 'testosterone' })],
    ...WINDOW
  });

  assert.deepEqual(result.curves, []);
  assert.deepEqual(result.unmodelledEsters, []);
});

test('each dose resolves its own episode, so a backdated dose gets the ester in effect then', () => {
  const result = esterCurves({
    doses: [dose(2), dose(20)],
    episodes: [episode('valerate'), episode('enanthate', { id: 'ep2', startEpochDay: 15 })],
    ...WINDOW
  });

  assert.deepEqual(
    result.curves.map((c) => [c.ester, c.doseCount]),
    [
      ['valerate', 1],
      ['enanthate', 1]
    ]
  );
});

test('a scale factor multiplies the band and nothing else about the curve', () => {
  const plain = esterCurves({ doses: [dose(0)], episodes: [episode('valerate')], ...WINDOW });
  const scaled = scaleCurves(plain.curves, 1.4);

  assert.equal(scaled[0].ester, plain.curves[0].ester);
  assert.equal(scaled[0].doseCount, plain.curves[0].doseCount);
  assert.equal(scaled[0].hypothetical, plain.curves[0].hypothetical);
  for (const [i, point] of plain.curves[0].band.entries()) {
    assert.equal(scaled[0].band[i].day, point.day);
    assert.ok(Math.abs(scaled[0].band[i].lower - 1.4 * point.lower) < 1e-9);
    assert.ok(Math.abs(scaled[0].band[i].upper - 1.4 * point.upper) < 1e-9);
  }
});

test('scaling leaves the curves it was given untouched', () => {
  const plain = esterCurves({ doses: [dose(0)], episodes: [episode('valerate')], ...WINDOW });
  const before = plain.curves[0].band[40].upper;
  scaleCurves(plain.curves, 3);
  assert.equal(plain.curves[0].band[40].upper, before);
});

test('the band midpoint is available for fitting, and only inside the window', () => {
  const result = esterCurves({ doses: [dose(0)], episodes: [episode('valerate')], ...WINDOW });
  const curve = result.curves[0];
  const point = curve.band.find((p) => p.day >= 2)!;

  const midpoint = bandMidpointAt(curve, point.day);
  assert.ok(midpoint !== null);
  assert.ok(Math.abs(midpoint - (point.lower + point.upper) / 2) < 1e-9);

  assert.equal(bandMidpointAt(curve, -5), null);
  assert.equal(bandMidpointAt(curve, 99), null);
});

test('the midpoint interpolates between the samples either side of a day', () => {
  const result = esterCurves({ doses: [dose(0)], episodes: [episode('valerate')], ...WINDOW });
  const curve = result.curves[0];
  const [a, b] = curve.band.slice(10, 12);
  const halfway = bandMidpointAt(curve, (a.day + b.day) / 2)!;

  const mid = (p: { lower: number; upper: number }) => (p.lower + p.upper) / 2;
  const lo = Math.min(mid(a), mid(b));
  const hi = Math.max(mid(a), mid(b));
  assert.ok(halfway >= lo - 1e-9 && halfway <= hi + 1e-9);
});

test('no doses at all is an empty answer, not a flat band at zero', () => {
  const result = esterCurves({ doses: [], episodes: [episode('valerate')], ...WINDOW });
  assert.deepEqual(result.curves, []);
  assert.equal(result.dosesWithoutMilligrams, 0);
});
