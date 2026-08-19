import assert from 'node:assert/strict';
import { test } from 'vitest';
import { startOfDayTimestamp } from './epochDay.ts';
import { esterCurves } from './hormoneCurve.ts';
import { qualitativeCurves } from './hormoneCurveQualitative.ts';
import type { DoseEvent, RegimenEpisode } from './types.ts';
import { isTestosteroneDrug } from './hormoneTestosteroneEster.ts';

test('isTestosteroneDrug answers the drug-identity question, in both catalogue languages', () => {
  assert.equal(isTestosteroneDrug('testosterone'), true);
  assert.equal(isTestosteroneDrug('Testosterone cypionate'), true);
  assert.equal(isTestosteroneDrug('testosteron'), true);
  assert.equal(isTestosteroneDrug('cypionian testosteronu'), true);
  assert.equal(isTestosteroneDrug('testosterone gel'), true);
});

test('the "T" people actually write counts, as a whole word only', () => {
  /* "T" is what a trans masc user types far more often than the full word,
     and in a drug field a bare letter T means nothing else. Only as a whole
     word: the letter inside another word is a coincidence. */
  assert.equal(isTestosteroneDrug('T'), true);
  assert.equal(isTestosteroneDrug('T gel'), true);
  assert.equal(isTestosteroneDrug('T cypionate'), true);
  assert.equal(isTestosteroneDrug('estradiol tablet'), false);
  assert.equal(isTestosteroneDrug('spironolactone'), false);
});

test('estradiol is never read as testosterone, the mirror of the guard hormoneEster.ts already has', () => {
  assert.equal(isTestosteroneDrug('estradiol'), false);
  assert.equal(isTestosteroneDrug('estradiol enanthate'), false);
  assert.equal(isTestosteroneDrug('walerianian estradiolu'), false);
  assert.equal(isTestosteroneDrug('E2'), false);
  assert.equal(isTestosteroneDrug(''), false);
});

test('another androgen is not testosterone, however close its name or its route', () => {
  /* Same fail-closed rule the estradiol side applies: a drug this app has no
     parameters for gets no curve rather than testosterone's. Nandrolone and
     boldenone share the ester words and the IM route. Methyltestosterone
     contains the whole word and is still a different drug - a
     17-alpha-alkylated androgen taken orally, with pharmacokinetics nothing
     here describes. */
  assert.equal(isTestosteroneDrug('nandrolone decanoate'), false);
  assert.equal(isTestosteroneDrug('boldenone undecylenate'), false);
  assert.equal(isTestosteroneDrug('methyltestosterone'), false);
  assert.equal(isTestosteroneDrug('metylotestosteron'), false);
});

test('an injectable testosterone dose draws nothing, in either model', () => {
  /* Phase 5 ticket 01's fail-closed outcome, pinned so it cannot be lost by
     accident. No published testosterone fit clears the bar the four estradiol
     esters clear (see this module's header), and ticket 01 reserves the
     qualitative curve for non-injectable routes - so an injection of
     testosterone resolves to no curve at all rather than to a band built from
     estradiol's parameters or a shape standing in for one. */
  const episodes: RegimenEpisode[] = [
    {
      id: 'ep',
      drug: 'testosterone',
      ester: 'cypionate',
      dose: 100,
      doseUnit: 'mg',
      route: 'IM',
      interval: 'every 7 days',
      startEpochDay: -100,
      hidden: false
    }
  ];
  const doses: DoseEvent[] = [0, 7, 14].map((day) => ({
    id: `d${day}`,
    timestamp: startOfDayTimestamp(day) + 8 * 3600000,
    dose: 100,
    doseUnit: 'mg',
    status: 'taken',
    scheduled: null,
    route: 'im',
    injectionSite: null,
    vehicle: 'oil'
  }));
  const window = { doses, episodes, fromEpochDay: 0, toEpochDay: 20 };

  // The estradiol band: the drug gate refuses it, ester word notwithstanding.
  assert.deepEqual(esterCurves(window).curves, []);
  // The qualitative shape: injectable routes are not in either drug's list.
  assert.deepEqual(qualitativeCurves({ ...window, drug: 'testosterone' }).curves, []);
  assert.deepEqual(qualitativeCurves({ ...window, drug: 'estradiol' }).curves, []);
});
