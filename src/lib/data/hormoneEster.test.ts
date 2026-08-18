import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { RegimenEpisode } from './types.ts';
import { INJECTABLE_ESTERS, isEstradiolDrug, resolveInjectableEster } from './hormoneEster.ts';

function episode(drug: string, ester: string | null): RegimenEpisode {
  return { id: 'e', drug, ester, dose: 5, doseUnit: 'mg', route: 'IM', interval: 'every 7 days', startEpochDay: 0, hidden: false };
}

test('the four esters this app draws, and only those', () => {
  assert.deepEqual(INJECTABLE_ESTERS, ['benzoate', 'valerate', 'cypionate', 'enanthate']);
});

test('an ester named in English resolves from the ester field', () => {
  assert.equal(resolveInjectableEster(episode('estradiol', 'benzoate')), 'benzoate');
  assert.equal(resolveInjectableEster(episode('estradiol', 'valerate')), 'valerate');
  assert.equal(resolveInjectableEster(episode('estradiol', 'cypionate')), 'cypionate');
  assert.equal(resolveInjectableEster(episode('estradiol', 'enanthate')), 'enanthate');
});

test('an ester named in Polish resolves too, because both fields are free text a user types in their own language', () => {
  assert.equal(resolveInjectableEster(episode('estradiol', 'benzoesan')), 'benzoate');
  assert.equal(resolveInjectableEster(episode('estradiol', 'walerianian')), 'valerate');
  assert.equal(resolveInjectableEster(episode('estradiol', 'cypionian')), 'cypionate');
  assert.equal(resolveInjectableEster(episode('estradiol', 'enantan')), 'enanthate');
  assert.equal(resolveInjectableEster(episode('walerianian estradiolu', null)), 'valerate');
});

test('the abbreviations people actually write resolve', () => {
  assert.equal(resolveInjectableEster(episode('estradiol', 'EV')), 'valerate');
  assert.equal(resolveInjectableEster(episode('estradiol', 'E2V')), 'valerate');
  assert.equal(resolveInjectableEster(episode('estradiol', 'EC')), 'cypionate');
  assert.equal(resolveInjectableEster(episode('estradiol', 'EEn')), 'enanthate');
  assert.equal(resolveInjectableEster(episode('estradiol', 'EB')), 'benzoate');
});

test('the ester falls back to the drug field, which is where a full name usually gets typed', () => {
  assert.equal(resolveInjectableEster(episode('Estradiol valerate', null)), 'valerate');
  assert.equal(resolveInjectableEster(episode('estradiol cypionate', '')), 'cypionate');
});

test('the two esters with no curve worth drawing resolve to nothing at all', () => {
  /* Polyestradiol phosphate has no usable published parameters; undecylate
     has some, and they were too loose to draw. Neither is in the vocabulary,
     so both answer the way any unrecognized ester does and neither reaches
     the model. */
  assert.equal(resolveInjectableEster(episode('polyestradiol phosphate', null)), null);
  assert.equal(resolveInjectableEster(episode('estradiol', 'PEP')), null);
  assert.equal(resolveInjectableEster(episode('fosforan poliestradiolu', null)), null);
  assert.equal(resolveInjectableEster(episode('estradiol undecylate', 'undecylate')), null);
  assert.equal(resolveInjectableEster(episode('estradiol', 'undecylan')), null);
});

test('the ester field wins over the drug field when the two name different esters', () => {
  // Someone corrected the ester without retyping the drug. The narrower
  // field is the one they edited.
  assert.equal(resolveInjectableEster(episode('estradiol valerate', 'cypionate')), 'cypionate');
});

test('a drug that is not estradiol never resolves, however familiar its ester word is', () => {
  // The trap this guard exists for: testosterone enanthate and estradiol
  // enanthate share an ester word and share the IM route, and modelling one
  // with the other's parameters would be silently wrong.
  assert.equal(resolveInjectableEster(episode('testosterone enanthate', 'enanthate')), null);
  assert.equal(resolveInjectableEster(episode('testosteron', 'enantan')), null);
  assert.equal(resolveInjectableEster(episode('nandrolone decanoate', 'decanoate')), null);
});

test('estradiol with no recognizable ester resolves to nothing rather than to a guess', () => {
  assert.equal(resolveInjectableEster(episode('estradiol', null)), null);
  assert.equal(resolveInjectableEster(episode('estradiol', 'hemihydrate')), null);
  assert.equal(resolveInjectableEster(episode('estradiol gel', 'none')), null);
  assert.equal(resolveInjectableEster(episode('', null)), null);
});

test('spelling variants of estradiol itself still count as estradiol', () => {
  assert.equal(resolveInjectableEster(episode('oestradiol valerate', null)), 'valerate');
  assert.equal(resolveInjectableEster(episode('Estradiolu walerianian', null)), 'valerate');
});

test('isEstradiolDrug answers the same drug-identity question resolveInjectableEster asks first', () => {
  // Ticket 11 reuses this half on its own, for routes with no ester to read.
  assert.equal(isEstradiolDrug('estradiol'), true);
  assert.equal(isEstradiolDrug('Estradiol valerate'), true);
  assert.equal(isEstradiolDrug('oestradiol gel'), true);
  assert.equal(isEstradiolDrug('E2 patch'), true);
  assert.equal(isEstradiolDrug('walerianian estradiolu'), true);
  assert.equal(isEstradiolDrug('testosterone'), false);
  assert.equal(isEstradiolDrug(''), false);
});
