import assert from 'node:assert/strict';
import { test } from 'vitest';
import { startOfDayTimestamp } from './epochDay.ts';
import type { DoseEvent, RegimenEpisode } from './types.ts';
import {
  QUALITATIVE_LOOKBACK_DAYS,
  QUALITATIVE_CURVE_KEYS,
  dosesWithNoCurve,
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
    endEpochDay: null,
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
    drug: null,
    route: 'oral',
    ...over
  };
}

const WINDOW = { drug: 'estradiol', fromEpochDay: 0, toEpochDay: 6 } as const;

test('one curve per route dosed in the window, from the dose log', () => {
  const result = qualitativeCurves({ doses: [dose(0), dose(1), dose(2)], episodes: [episode()], ...WINDOW });

  assert.equal(result.curves.length, 1);
  assert.equal(result.curves[0].key, 'estradiol:oral');
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
    result.curves.map((c) => c.key),
    ['estradiol:oral', 'estradiol:gel']
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
  const result = qualitativeCurves({ drug: 'estradiol', doses: [dose(0)], episodes: [episode()], fromEpochDay: 0, toEpochDay: 3 });
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

test('a patch dose logged in mcg reaches the qualitative curve at the right milligram value', () => {
  // Patches are labelled in mcg/24h (25-100), so this is the case ticket 39
  // exists for: a microgram dose must produce the same curve a milligram
  // dose of the same underlying strength would.
  const patchEpisode = episode({ drug: 'estradiol', route: 'patch' });
  const mg = qualitativeCurves({
    ...WINDOW,
    doses: [{ ...dose(0), route: 'patch', dose: 0.05, doseUnit: 'mg' } as DoseEvent],
    episodes: [patchEpisode]
  });
  const mcg = qualitativeCurves({
    ...WINDOW,
    doses: [{ ...dose(0), route: 'patch', dose: 50, doseUnit: 'mcg' } as DoseEvent],
    episodes: [patchEpisode]
  });

  assert.equal(mcg.dosesWithoutMilligrams, 0);
  assert.equal(mcg.curves[0].key, 'estradiol:patch');
  for (const [i, point] of mg.curves[0].points.entries()) {
    assert.ok(Math.abs(mcg.curves[0].points[i].value - point.value) < 1e-9);
  }
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
    result.curves.map((c) => c.key),
    ['estradiol:oral']
  );
});

test('the lookback reaches at least as far as the widest shape still contributes', () => {
  /* A testosterone injection is still contributing a week and more after it is
     given, where the topical shapes are spent within a day or two - so the
     lookback has to cover the injection or a window's first days would be drawn
     without the dose that made them. Derived rather than picked, so it follows
     the shapes if any of them changes. */
  const injectedReachDays = (36 + 12 + 216) / 24;
  assert.ok(
    QUALITATIVE_LOOKBACK_DAYS >= injectedReachDays,
    `lookback ${QUALITATIVE_LOOKBACK_DAYS} must cover ${injectedReachDays}`
  );
  // And still far shorter than the fitted band's, which the posteriors put at 63.
  assert.ok(QUALITATIVE_LOOKBACK_DAYS < 63);
});

test('a scale factor multiplies the curve and nothing else about it', () => {
  const plain = qualitativeCurves({ doses: [dose(0)], episodes: [episode()], ...WINDOW });
  const scaled = scaleQualitativeCurves(plain.curves, 1.5);

  assert.equal(scaled[0].key, plain.curves[0].key);
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

test('the curves this app can draw, and only those', () => {
  /* Estradiol keeps its four routes. Testosterone gets three curves and picks
     the injected one by ester, not by route, because that is what decides the
     shape. Estradiol has no injected key: its injections have a real posterior
     and get the fitted band instead. */
  assert.deepEqual(QUALITATIVE_CURVE_KEYS, [
    'estradiol:oral',
    'estradiol:sublingual',
    'estradiol:patch',
    'estradiol:gel',
    'testosterone:injected',
    'testosterone:patch',
    'testosterone:gel'
  ]);
});

test('testosterone gel gets a curve of its own, on the same shape as estradiol gel', () => {
  const result = qualitativeCurves({
    ...WINDOW,
    drug: 'testosterone',
    doses: [{ ...dose(0), route: 'gel', dose: 50 } as DoseEvent],
    episodes: [episode({ drug: 'testosterone', route: 'gel' })]
  });

  assert.equal(result.curves.length, 1);
  assert.equal(result.curves[0].key, 'testosterone:gel');
  assert.equal(result.curves[0].doseCount, 1);
  assert.ok(result.curves[0].points.some((point) => point.value > 0));
});

test('testosterone by mouth or under the tongue gets no curve at all', () => {
  /* Fail-closed, the same way an ester outside the vocabulary gets none. Oral
     testosterone undecanoate has a food dependency no trapezoid here describes,
     and sublingual testosterone is not a route in use. */
  for (const route of ['oral', 'sublingual'] as const) {
    const result = qualitativeCurves({
      ...WINDOW,
      drug: 'testosterone',
      doses: [{ ...dose(0), route } as DoseEvent],
      episodes: [episode({ drug: 'testosterone', route })]
    });
    assert.deepEqual(result.curves, [], route);
  }
});

test('a testosterone patch gets its own shape, not the estradiol patch depot', () => {
  const patch = (drug: 'estradiol' | 'testosterone') =>
    qualitativeCurves({
      ...WINDOW,
      drug,
      doses: [{ ...dose(0), route: 'patch', dose: 5 } as DoseEvent],
      episodes: [episode({ drug, route: 'patch' })]
    }).curves[0];

  const t = patch('testosterone');
  const e2 = patch('estradiol');
  assert.equal(t.key, 'testosterone:patch');
  assert.equal(e2.key, 'estradiol:patch');

  /* The estradiol patch is worn for days, so it is still at its plateau three
     days on. The testosterone one is changed daily and has fallen away by
     then. */
  const at = (curve: typeof t, day: number) => curve.points.find((point) => point.day >= day)!.value;
  assert.ok(at(e2, 3) > 0, 'estradiol patch still contributing on day 3');
  assert.equal(at(t, 3), 0);
});

test('one hormone’s gel dose never adds height to the other hormone’s gel curve', () => {
  /* The whole reason the two vocabularies are kept apart. Same route, same
     window, two drugs - and each call sees only its own doses. Both
     episodes are concurrently active from day 2 on (phase 5 ticket 38),
     so the second dose names its own drug the way the dose editor would
     have prompted for it - a drug-less dose in that window would be
     genuinely ambiguous, which the next test covers. */
  const doses = [
    { ...dose(0), route: 'gel' } as DoseEvent,
    { ...dose(3), route: 'gel', dose: 50, drug: 'testosterone' } as DoseEvent
  ];
  const episodes = [
    episode({ drug: 'estradiol', route: 'gel', startEpochDay: -1000 }),
    episode({ id: 'ep2', drug: 'testosterone', route: 'gel', startEpochDay: 2 })
  ];

  const e2 = qualitativeCurves({ ...WINDOW, drug: 'estradiol', doses, episodes });
  const t = qualitativeCurves({ ...WINDOW, drug: 'testosterone', doses, episodes });

  assert.equal(e2.curves.length, 1);
  assert.equal(e2.curves[0].doseCount, 1);
  assert.equal(t.curves.length, 1);
  assert.equal(t.curves[0].doseCount, 1);

  // The estradiol curve has fallen back to nothing by the day the
  // testosterone dose lands, rather than picking that dose up.
  const at = (points: { day: number; value: number }[], day: number) => points.find((point) => point.day >= day)!.value;
  assert.equal(at(e2.curves[0].points, 3.4), 0);
  assert.ok(at(t.curves[0].points, 3.4) > 0);
});

test('a drug-less dose logged while a same-route episode of a different drug is also active is drawn into neither curve (case 4)', () => {
  /* The bug ticket 38 exists to close: before concurrency was representable,
     a route match alone was enough to draw a dose into whichever episode
     resolveEpisodeAt happened to return, so a spironolactone tablet logged
     the same way as an oral estradiol dose could get drawn straight into
     the estradiol curve at full value. Two concurrent oral episodes for
     different drugs, and a dose naming no drug of its own, must now be
     excluded from both curves rather than guessed into either - and
     counted by dosesWithNoCurve, not silently dropped. */
  const doses = [{ ...dose(0), route: 'oral' } as DoseEvent];
  const episodes = [
    episode({ drug: 'estradiol', route: 'oral', startEpochDay: -1000 }),
    episode({ id: 'ep2', drug: 'spironolactone', route: 'oral', startEpochDay: -1000 })
  ];

  const e2 = qualitativeCurves({ ...WINDOW, drug: 'estradiol', doses, episodes });

  assert.equal(e2.curves.length, 0, 'the ambiguous dose must not seed an estradiol curve');
  assert.equal(
    dosesWithNoCurve({ fromEpochDay: WINDOW.fromEpochDay, toEpochDay: WINDOW.toEpochDay, doses, episodes }),
    1,
    'excluded for want of unambiguous attribution, and counted rather than silently dropped'
  );
});

test('a drug that is neither hormone still gets nothing, however familiar its route', () => {
  const result = qualitativeCurves({
    doses: [{ ...dose(0), route: 'gel' } as DoseEvent],
    episodes: [episode({ drug: 'progesterone', route: 'gel' })],
    ...WINDOW
  });

  assert.deepEqual(result.curves, []);
});

test('doses on something this app draws no curve for at all are counted', () => {
  /* What the empty state needs to know before it points anyone at the dose log:
     whether the reason nothing is drawn is the reader's log or this app's
     scope. Drug-agnostic, because the question is about the whole screen. */
  const window = { fromEpochDay: 0, toEpochDay: 20 };
  const injection = (day: number) =>
    ({ ...dose(day), route: 'im', dose: 100, injectionSite: null, vehicle: 'oil' }) as DoseEvent;

  // Undecanoate: recognized testosterone, but no shape and no band.
  assert.equal(
    dosesWithNoCurve({
      ...window,
      doses: [injection(0), injection(7)],
      episodes: [episode({ drug: 'testosterone', ester: 'undecanoate', route: 'IM' })]
    }),
    2
  );

  // Cypionate draws a shape, so it is not counted.
  assert.equal(
    dosesWithNoCurve({
      ...window,
      doses: [injection(0)],
      episodes: [episode({ drug: 'testosterone', ester: 'cypionate', route: 'IM' })]
    }),
    0
  );

  // An estradiol injection draws the band, which is also a curve.
  assert.equal(
    dosesWithNoCurve({
      ...window,
      doses: [injection(0)],
      episodes: [episode({ drug: 'estradiol', ester: 'valerate', route: 'IM' })]
    }),
    0
  );

  /* A drug this app curves for neither hormone is not counted. Someone logging
     only an antiandrogen has not yet logged anything this screen could draw, so
     the dose log is still worth offering them - the count exists to tell that
     apart from a log full of doses on an ester with no curve. */
  assert.equal(
    dosesWithNoCurve({
      ...window,
      doses: [dose(0)],
      episodes: [episode({ drug: 'spironolactone', route: 'oral' })]
    }),
    0
  );

  // A dose at midnight after the window belongs to the next day (ADR-0001).
  assert.equal(
    dosesWithNoCurve({
      fromEpochDay: 0,
      toEpochDay: 6,
      doses: [{ ...injection(0), timestamp: startOfDayTimestamp(7) } as DoseEvent],
      episodes: [episode({ drug: 'testosterone', ester: 'undecanoate', route: 'IM' })]
    }),
    0
  );

  // A skipped dose is not a dose, and neither is one outside the window.
  assert.equal(
    dosesWithNoCurve({
      ...window,
      doses: [{ ...injection(0), status: 'skipped' } as DoseEvent, injection(40)],
      episodes: [episode({ drug: 'testosterone', ester: 'undecanoate', route: 'IM' })]
    }),
    0
  );
});
