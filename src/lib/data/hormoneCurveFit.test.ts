import assert from 'node:assert/strict';
import { test } from 'vitest';
import { doseMilligrams, fitScaleFactor } from './hormoneCurveFit.ts';

test('a dose logged in milligrams is read as milligrams', () => {
  assert.equal(doseMilligrams(5, 'mg'), 5);
  assert.equal(doseMilligrams(2.5, ' MG '), 2.5);
  assert.equal(doseMilligrams(4, 'milligrams'), 4);
});

test('a dose logged by volume has no milligram figure, because the concentration is not recorded', () => {
  // The common way to write an injection down. Nothing in the schema says
  // whether that 0.5 mL was 10 mg/mL or 40 mg/mL, so there is no dose to
  // scale the curve by and the honest answer is none.
  assert.equal(doseMilligrams(0.5, 'mL'), null);
  assert.equal(doseMilligrams(0.5, 'ml'), null);
  assert.equal(doseMilligrams(1, ''), null);
  assert.equal(doseMilligrams(1, 'units'), null);
});

test('a dose that is not a positive number has no milligram figure either', () => {
  assert.equal(doseMilligrams(0, 'mg'), null);
  assert.equal(doseMilligrams(-5, 'mg'), null);
  assert.equal(doseMilligrams(Number.NaN, 'mg'), null);
});

test('one lab point above the model scales the curve up by exactly its ratio', () => {
  assert.equal(fitScaleFactor([{ modelled: 100, observed: 150 }]), 1.5);
});

test('several points are fitted by least squares through the origin, not averaged pairwise', () => {
  // Least squares through the origin is sum(o*m)/sum(m*m): the bigger
  // modelled values carry more of the answer, which is what keeps one
  // near-zero trough point from dominating the whole fit.
  const factor = fitScaleFactor([
    { modelled: 100, observed: 200 },
    { modelled: 200, observed: 300 }
  ]);
  assert.ok(factor !== null);
  assert.ok(Math.abs(factor - (100 * 200 + 200 * 300) / (100 * 100 + 200 * 200)) < 1e-12);
});

test('a factor of one comes back when the user sits exactly on the model', () => {
  assert.equal(fitScaleFactor([{ modelled: 80, observed: 80 }, { modelled: 40, observed: 40 }]), 1);
});

test('nothing to fit against gives no factor rather than a factor of one', () => {
  // Null and 1 are different answers: 1 says "fitted, and you match the
  // population"; null says "not fitted". The screen says different things.
  assert.equal(fitScaleFactor([]), null);
  assert.equal(fitScaleFactor([{ modelled: 0, observed: 90 }]), null);
});

test('a point that reads zero cannot scale a curve and is left out of the fit', () => {
  assert.equal(fitScaleFactor([{ modelled: 100, observed: 0 }, { modelled: 100, observed: 150 }]), 1.5);
});
