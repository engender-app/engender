import assert from 'node:assert/strict';
import { test } from 'vitest';
import { PREFERRED_UNIT_ANALYTES, convertLabValue } from './labs/units.ts';
import { CURVE_DRUGS, CURVE_UNITS, resolveCurveDrug } from './hormoneDrug.ts';

test('the two drugs this app curves, and only those', () => {
  assert.deepEqual(CURVE_DRUGS, ['estradiol', 'testosterone']);
});

test('each drug names the unit its own curve is drawn in', () => {
  // Both are ADR-0026 allowlist units, so a curve value can be converted for
  // display the same way a lab result is.
  assert.equal(CURVE_UNITS.estradiol, 'pg/mL');
  assert.equal(CURVE_UNITS.testosterone, 'ng/dL');
});

test('a drug field resolves to whichever hormone it names', () => {
  assert.equal(resolveCurveDrug('estradiol valerate'), 'estradiol');
  assert.equal(resolveCurveDrug('walerianian estradiolu'), 'estradiol');
  assert.equal(resolveCurveDrug('E2 patch'), 'estradiol');
  assert.equal(resolveCurveDrug('testosterone cypionate'), 'testosterone');
  assert.equal(resolveCurveDrug('cypionian testosteronu'), 'testosterone');
  assert.equal(resolveCurveDrug('T gel'), 'testosterone');
});

test('a drug this app has no curve for resolves to nothing rather than to a guess', () => {
  assert.equal(resolveCurveDrug('spironolactone'), null);
  assert.equal(resolveCurveDrug('cyproterone acetate'), null);
  assert.equal(resolveCurveDrug('progesterone'), null);
  assert.equal(resolveCurveDrug('nandrolone decanoate'), null);
  assert.equal(resolveCurveDrug(''), null);
});

test('a field naming both hormones resolves to estradiol, and the order is the reason', () => {
  /* Not a real regimen so much as a field someone typed loosely - one
     episode is one drug. Estradiol is checked first, so the answer is
     defined rather than dependent on which name happens to appear earlier in
     the text. Either way it stays inside a drug this app has parameters for,
     which is what the fail-closed rule is protecting. */
  assert.equal(resolveCurveDrug('estradiol and T'), 'estradiol');
});

test('each hormone owns its curve unit outright, which is what keeps two curves from crossing', () => {
  /* The journal seam decides which of the user's results belong on which
     hormone's curve by asking ADR-0026's allowlist for a conversion into that
     hormone's own unit. That works as a filter only while no two analytes
     share a unit. If the allowlist ever gives one away, this fails here
     rather than silently drawing estradiol results on a testosterone curve. */
  for (const drug of CURVE_DRUGS) {
    const unit = CURVE_UNITS[drug];
    for (const analyte of PREFERRED_UNIT_ANALYTES) {
      const converts = convertLabValue(analyte, 1, unit, unit) !== null;
      assert.equal(converts, analyte === drug, `${analyte} in ${unit}`);
    }
  }
});
