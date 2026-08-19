import assert from 'node:assert/strict';
import { test } from 'vitest';
import { startOfDayTimestamp } from './epochDay.ts';
import { esterCurves } from './hormoneCurve.ts';
import { qualitativeCurves } from './hormoneCurveQualitative.ts';
import type { DoseEvent, RegimenEpisode } from './types.ts';
import {
  INJECTABLE_TESTOSTERONE_ESTERS,
  isTestosteroneDrug,
  resolveTestosteroneEster
} from './hormoneTestosteroneEster.ts';

/** A weekly testosterone injection log on `ester`, over a three-week window. */
function injectionWindow(ester: string) {
  const episodes: RegimenEpisode[] = [tEpisode('testosterone', ester)];
  const doses: DoseEvent[] = [0, 7, 14].map((day) => ({
    id: `d${day}`,
    timestamp: startOfDayTimestamp(day) + 8 * 3600000,
    dose: 100,
    doseUnit: 'mg',
    status: 'taken',
    scheduled: null,
    drug: null,
    route: 'im',
    injectionSite: null,
    vehicle: 'oil'
  }));
  return { doses, episodes, fromEpochDay: 0, toEpochDay: 20 };
}

function tEpisode(drug: string, ester: string | null): RegimenEpisode {
  return {
    id: 'e',
    drug,
    ester,
    dose: 100,
    doseUnit: 'mg',
    route: 'IM',
    interval: 'every 7 days',
    startEpochDay: 0,
    endEpochDay: null,
    hidden: false
  };
}

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

test('an injectable testosterone dose gets a shape, never the estradiol band', () => {
  /* The two halves of ticket 01's answer for injections. No published
     testosterone fit clears the band bar (this module's header argues each
     ester), so an injection never reaches hormoneCurve.ts's fitted band, ester
     word notwithstanding - but it does get the qualitative shape, which claims
     no width and no unit. */
  const window = injectionWindow('cypionate');

  assert.deepEqual(esterCurves(window).curves, []);

  const shape = qualitativeCurves({ ...window, drug: 'testosterone' });
  assert.equal(shape.curves.length, 1);
  assert.equal(shape.curves[0].key, 'testosterone:injected');
  assert.equal(shape.curves[0].doseCount, 3);

  // And it is testosterone's alone: the estradiol call sees none of it.
  assert.deepEqual(qualitativeCurves({ ...window, drug: 'estradiol' }).curves, []);
});

test('an injectable testosterone ester with no shape of its own draws nothing at all', () => {
  /* Undecanoate is a months-long depot and a blend is four esters at once whose
     published curves are composite only. Drawing either on the weekly shape
     would be wrong rather than rough, so neither is drawn. */
  for (const ester of ['undecanoate', 'propionate']) {
    const window = injectionWindow(ester);
    assert.deepEqual(esterCurves(window).curves, [], ester);
    assert.deepEqual(qualitativeCurves({ ...window, drug: 'testosterone' }).curves, [], ester);
  }
});

test('the testosterone esters this app draws a shape for, and only those', () => {
  assert.deepEqual(INJECTABLE_TESTOSTERONE_ESTERS, ['cypionate', 'enanthate']);
});

test('a testosterone ester resolves from either field, in both catalogue languages', () => {
  assert.equal(resolveTestosteroneEster(tEpisode('testosterone', 'cypionate')), 'cypionate');
  assert.equal(resolveTestosteroneEster(tEpisode('testosterone', 'enanthate')), 'enanthate');
  assert.equal(resolveTestosteroneEster(tEpisode('testosterone', 'cypionian')), 'cypionate');
  assert.equal(resolveTestosteroneEster(tEpisode('testosterone', 'enantan')), 'enanthate');
  assert.equal(resolveTestosteroneEster(tEpisode('cypionian testosteronu', null)), 'cypionate');
  assert.equal(resolveTestosteroneEster(tEpisode('Testosterone enanthate', null)), 'enanthate');
  assert.equal(resolveTestosteroneEster(tEpisode('T', 'TC')), 'cypionate');
  assert.equal(resolveTestosteroneEster(tEpisode('T', 'TE')), 'enanthate');
});

test('the long depot and the blends resolve to nothing, so neither is drawn on a weekly shape', () => {
  /* Undecanoate acts over months and a Sustanon-type blend is four esters at
     once whose published curves are composite only. Both need a shape of their
     own that nothing here argues, so both get none rather than the
     cypionate/enanthate one. */
  assert.equal(resolveTestosteroneEster(tEpisode('testosterone undecanoate', 'undecanoate')), null);
  assert.equal(resolveTestosteroneEster(tEpisode('testosterone', 'undekanian')), null);
  assert.equal(resolveTestosteroneEster(tEpisode('Nebido', null)), null);
  assert.equal(resolveTestosteroneEster(tEpisode('Sustanon 250', null)), null);
  assert.equal(resolveTestosteroneEster(tEpisode('Omnadren 250', null)), null);
  assert.equal(resolveTestosteroneEster(tEpisode('testosterone', 'propionate')), null);
});

test('estradiol never resolves a testosterone ester, however familiar the ester word', () => {
  // The mirror of hormoneEster.ts's own guard: cypionate and enanthate name an
  // ester of either drug, and the two rest on separate evidence.
  assert.equal(resolveTestosteroneEster(tEpisode('estradiol cypionate', 'cypionate')), null);
  assert.equal(resolveTestosteroneEster(tEpisode('estradiol', 'enanthate')), null);
  assert.equal(resolveTestosteroneEster(tEpisode('nandrolone decanoate', 'decanoate')), null);
});

test('testosterone with no recognizable ester resolves to nothing rather than a guess', () => {
  assert.equal(resolveTestosteroneEster(tEpisode('testosterone', null)), null);
  assert.equal(resolveTestosteroneEster(tEpisode('testosterone', 'oil')), null);
  assert.equal(resolveTestosteroneEster(tEpisode('', null)), null);
});
