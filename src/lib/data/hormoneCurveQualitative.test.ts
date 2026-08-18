import assert from 'node:assert/strict';
import { test } from 'vitest';
import { startOfDayTimestamp } from './epochDay.ts';
import type { DoseEvent, RegimenEpisode } from './types.ts';
import {
  QUALITATIVE_LOOKBACK_DAYS,
  QUALITATIVE_ROUTES,
  latestQualitativeValue,
  qualitativeCurves,
  qualitativeValueAt,
  scaleQualitativeCurves
} from './hormoneCurveQualitative.ts';

function episode(over: Partial<RegimenEpisode> = {}): RegimenEpisode {
  return {
    id: 'ep',
    drug: 'estradiol',
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'every day',
    startEpochDay: -1000,
    hidden: false,
    ...over
  };
}

function dose(epochDay: number, over: Partial<Extract<DoseEvent, { route: 'oral' | 'sublingual' }>> = {}): DoseEvent {
  return {
    id: `d${epochDay}`,
    timestamp: startOfDayTimestamp(epochDay) + 8 * 3600000,
    dose: 2,
    doseUnit: 'mg',
    status: 'taken',
    scheduled: null,
    route: 'oral',
    ...over
  };
}

const WINDOW = { fromEpochDay: 0, toEpochDay: 6 };

test('the four routes this ticket draws, and only those', () => {
  assert.deepEqual(QUALITATIVE_ROUTES, ['oral', 'sublingual', 'patch', 'gel']);
});

test('one curve per route dosed in the window, from the dose log', () => {
  const result = qualitativeCurves({ doses: [dose(0), dose(1), dose(2)], episodes: [episode()], ...WINDOW });

  assert.equal(result.curves.length, 1);
  assert.equal(result.curves[0].route, 'oral');
  assert.equal(result.curves[0].doseCount, 3);
  assert.ok(result.curves[0].points.length > 100);
});

test('two routes dosed in one window get a curve each', () => {
  const result = qualitativeCurves({
    doses: [dose(0), { ...dose(1), route: 'gel' } as DoseEvent],
    episodes: [episode()],
    ...WINDOW
  });

  assert.deepEqual(
    result.curves.map((c) => c.route),
    ['oral', 'gel']
  );
});

test('every point is a single value, not a range - the opposite guard from the injectable band', () => {
  // This is what "no uncertainty-band mathematics" (ticket 11) means at the
  // type level: a `lower`/`upper` pair here would be how the band this
  // ticket rules out gets built by accident later.
  const result = qualitativeCurves({ doses: [dose(0)], episodes: [episode()], ...WINDOW });
  for (const point of result.curves[0].points) {
    assert.deepEqual(Object.keys(point).sort(), ['day', 'value']);
  }
});

test('the curve is zero before the first dose and rises after it', () => {
  const result = qualitativeCurves({ doses: [dose(2)], episodes: [episode()], ...WINDOW });
  const points = result.curves[0].points;

  for (const point of points.filter((p) => p.day < 2)) assert.equal(point.value, 0);
  assert.ok(points.some((p) => p.day > 2 && p.value > 0));
});

test('the curve settles back towards zero well after the last dose', () => {
  const result = qualitativeCurves({ doses: [dose(0)], episodes: [episode()], fromEpochDay: 0, toEpochDay: 3 });
  const last = result.curves[0].points[result.curves[0].points.length - 1];
  assert.ok(last.value < 0.05, `oral should have settled by day 3, was ${last.value}`);
});

test('doubling the dose doubles the curve, the same linear scaling the injectable model uses', () => {
  const one = qualitativeCurves({ doses: [dose(0)], episodes: [episode()], ...WINDOW });
  const two = qualitativeCurves({ doses: [dose(0, { dose: 4 })], episodes: [episode()], ...WINDOW });

  for (const [i, point] of one.curves[0].points.entries()) {
    assert.ok(Math.abs(two.curves[0].points[i].value - 2 * point.value) < 1e-9);
  }
});

test('two doses close together add up rather than replacing one another', () => {
  // Both doses land well inside oral's 20-hour rise-plateau-fall window (2 +
  // 3 + 15 hours), so their contributions overlap instead of one having
  // fully decayed before the other starts.
  const second = { ...dose(0), id: 'd0b', timestamp: startOfDayTimestamp(0) + 12 * 3600000 };
  const once = qualitativeCurves({ doses: [dose(0)], episodes: [episode()], ...WINDOW });
  const twice = qualitativeCurves({ doses: [dose(0), second], episodes: [episode()], ...WINDOW });

  const at = (points: { day: number; value: number }[], day: number) => points.find((p) => p.day >= day)!.value;
  assert.ok(at(twice.curves[0].points, 0.6) > at(once.curves[0].points, 0.6));
});

test('injectable routes are ticket 10’s, and are left out of this model entirely', () => {
  const result = qualitativeCurves({
    doses: [
      { ...dose(0), route: 'im', injectionSite: null, vehicle: 'oil' } as DoseEvent,
      { ...dose(1), route: 'sc', injectionSite: null, vehicle: 'oil' } as DoseEvent
    ],
    episodes: [episode()],
    ...WINDOW
  });

  assert.deepEqual(result.curves, []);
});

test('a dose logged by volume is counted out loud rather than guessed at', () => {
  const result = qualitativeCurves({
    doses: [dose(0), dose(1, { dose: 0.5, doseUnit: 'mL' })],
    episodes: [episode()],
    ...WINDOW
  });

  assert.equal(result.curves[0].doseCount, 1);
  assert.equal(result.dosesWithoutMilligrams, 1);
});

test('a dose under a non-estradiol regimen draws nothing', () => {
  const result = qualitativeCurves({ doses: [dose(0)], episodes: [episode({ drug: 'progesterone' })], ...WINDOW });
  assert.deepEqual(result.curves, []);
});

test('a skipped dose puts nothing into the curve', () => {
  const result = qualitativeCurves({
    doses: [dose(0), dose(1, { status: 'skipped' })],
    episodes: [episode()],
    ...WINDOW
  });
  const only = qualitativeCurves({ doses: [dose(0)], episodes: [episode()], ...WINDOW });

  assert.equal(result.curves[0].doseCount, 1);
  assert.deepEqual(result.curves[0].points, only.curves[0].points);
});

test('each dose resolves its own episode', () => {
  const result = qualitativeCurves({
    doses: [dose(0), { ...dose(4), route: 'gel' } as DoseEvent],
    episodes: [episode({ startEpochDay: -1000 }), episode({ id: 'ep2', drug: 'progesterone', startEpochDay: 3 })],
    ...WINDOW
  });

  // The gel dose on day 4 falls under the progesterone episode, so only the
  // oral one - still under the estradiol episode - draws a curve.
  assert.deepEqual(
    result.curves.map((c) => c.route),
    ['oral']
  );
});

test('the lookback is short, because these routes act over hours and days rather than weeks', () => {
  assert.ok(QUALITATIVE_LOOKBACK_DAYS < 10);
});

test('a scale factor multiplies the curve and nothing else about it', () => {
  const plain = qualitativeCurves({ doses: [dose(0)], episodes: [episode()], ...WINDOW });
  const scaled = scaleQualitativeCurves(plain.curves, 1.5);

  assert.equal(scaled[0].route, plain.curves[0].route);
  assert.equal(scaled[0].doseCount, plain.curves[0].doseCount);
  for (const [i, point] of plain.curves[0].points.entries()) {
    assert.equal(scaled[0].points[i].day, point.day);
    assert.ok(Math.abs(scaled[0].points[i].value - 1.5 * point.value) < 1e-9);
  }
});

test('scaling leaves the curves it was given untouched', () => {
  const plain = qualitativeCurves({ doses: [dose(0)], episodes: [episode()], ...WINDOW });
  const before = plain.curves[0].points[40].value;
  scaleQualitativeCurves(plain.curves, 3);
  assert.equal(plain.curves[0].points[40].value, before);
});

test('the curve value at a day is available for fitting, and only inside the window', () => {
  const result = qualitativeCurves({ doses: [dose(0)], episodes: [episode()], ...WINDOW });
  const curve = result.curves[0];
  const point = curve.points.find((p) => p.day >= 2)!;

  assert.ok(Math.abs(qualitativeValueAt(curve, point.day)! - point.value) < 1e-9);
  assert.equal(qualitativeValueAt(curve, -5), null);
  assert.equal(qualitativeValueAt(curve, 999), null);
});

test('the last point of the window is what a screen shows with nothing picked out', () => {
  const result = qualitativeCurves({ doses: [dose(0)], episodes: [episode()], ...WINDOW });
  const curve = result.curves[0];
  assert.deepEqual(latestQualitativeValue(curve), curve.points[curve.points.length - 1].value);
});

test('no doses at all is an empty answer, not a flat curve at zero', () => {
  const result = qualitativeCurves({ doses: [], episodes: [episode()], ...WINDOW });
  assert.deepEqual(result.curves, []);
  assert.equal(result.dosesWithoutMilligrams, 0);
});
