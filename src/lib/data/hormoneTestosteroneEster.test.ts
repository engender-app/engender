import assert from 'node:assert/strict';
import { test } from 'vitest';
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
