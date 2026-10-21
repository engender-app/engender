import assert from 'node:assert/strict';
import { test } from 'vitest';
import { resolveHormoneDrug } from './hormoneDrug.ts';

test('a drug field resolves to whichever hormone it names', () => {
  assert.equal(resolveHormoneDrug('estradiol valerate'), 'estradiol');
  assert.equal(resolveHormoneDrug('walerianian estradiolu'), 'estradiol');
  assert.equal(resolveHormoneDrug('E2 patch'), 'estradiol');
  assert.equal(resolveHormoneDrug('testosterone cypionate'), 'testosterone');
  assert.equal(resolveHormoneDrug('cypionian testosteronu'), 'testosterone');
  assert.equal(resolveHormoneDrug('T gel'), 'testosterone');
});

test('an unrecognized drug resolves to nothing rather than to a guess', () => {
  assert.equal(resolveHormoneDrug('spironolactone'), null);
  assert.equal(resolveHormoneDrug('cyproterone acetate'), null);
  assert.equal(resolveHormoneDrug('progesterone'), null);
  assert.equal(resolveHormoneDrug('nandrolone decanoate'), null);
  assert.equal(resolveHormoneDrug(''), null);
});

test('a field naming both hormones resolves to estradiol, and the order is the reason', () => {
  /* Not a real regimen so much as a field someone typed loosely - one
     episode is one drug. Estradiol is checked first, so the answer is
     defined rather than dependent on which name happens to appear earlier in
     the text. The choice stays stable regardless of word order. */
  assert.equal(resolveHormoneDrug('estradiol and T'), 'estradiol');
});
