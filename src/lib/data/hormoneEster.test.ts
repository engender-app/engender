import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { RegimenEpisode } from './types.ts';
import { INJECTABLE_ESTERS, isHypotheticalEster, resolveInjectableEster } from './hormoneEster.ts';

function episode(drug: string, ester: string | null): RegimenEpisode {
  return { id: 'e', drug, ester, dose: 5, doseUnit: 'mg', route: 'IM', interval: 'every 7 days', startEpochDay: 0, hidden: false };
}

test('the six esters this app has a name for, and only those', () => {
  assert.deepEqual(INJECTABLE_ESTERS, [
    'benzoate',
    'valerate',
    'cypionate',
    'enanthate',
    'polyestradiol-phosphate',
    'undecylate'
  ]);
});

test('an ester named in English resolves from the ester field', () => {
  assert.equal(resolveInjectableEster(episode('estradiol', 'benzoate')), 'benzoate');
  assert.equal(resolveInjectableEster(episode('estradiol', 'valerate')), 'valerate');
  assert.equal(resolveInjectableEster(episode('estradiol', 'cypionate')), 'cypionate');
  assert.equal(resolveInjectableEster(episode('estradiol', 'enanthate')), 'enanthate');
  assert.equal(resolveInjectableEster(episode('estradiol', 'undecylate')), 'undecylate');
});

test('an ester named in Polish resolves too, because both fields are free text a user types in their own language', () => {
  assert.equal(resolveInjectableEster(episode('estradiol', 'benzoesan')), 'benzoate');
  assert.equal(resolveInjectableEster(episode('estradiol', 'walerianian')), 'valerate');
  assert.equal(resolveInjectableEster(episode('estradiol', 'cypionian')), 'cypionate');
  assert.equal(resolveInjectableEster(episode('estradiol', 'enantan')), 'enanthate');
  assert.equal(resolveInjectableEster(episode('estradiol', 'undecylan')), 'undecylate');
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

test('polyestradiol phosphate is one name, not an ester word beside a drug word', () => {
  assert.equal(resolveInjectableEster(episode('polyestradiol phosphate', null)), 'polyestradiol-phosphate');
  assert.equal(resolveInjectableEster(episode('Polyestradiol Phosphate', null)), 'polyestradiol-phosphate');
  assert.equal(resolveInjectableEster(episode('estradiol', 'PEP')), 'polyestradiol-phosphate');
  assert.equal(resolveInjectableEster(episode('fosforan poliestradiolu', null)), 'polyestradiol-phosphate');
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

test('only undecylate is hypothetical; no other ester in the vocabulary is', () => {
  assert.equal(isHypotheticalEster('undecylate'), true);
  for (const ester of INJECTABLE_ESTERS.filter((e) => e !== 'undecylate')) {
    assert.equal(isHypotheticalEster(ester), false);
  }
});
