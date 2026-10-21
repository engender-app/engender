import assert from 'node:assert/strict';
import { test } from 'vitest';
import { inferDrugClass, toDrugClass } from './drugClass.ts';

test('hormones, antiandrogens and GnRH drugs infer as HRT, in English and Polish', () => {
  for (const drug of [
    'Estradiol valerate',
    'oestradiol gel',
    'Walerianian estradiolu',
    'Testosterone cypionate',
    'Cypionian testosteronu',
    'Progesterone',
    'Spironolactone',
    'Spironolakton',
    'Cyproterone acetate',
    'Octan cyproteronu',
    'Bicalutamide',
    'Bikalutamid',
    'Triptorelin',
    'Leuprorelin',
    'leuprolide',
    'Goserelin',
    'GnRH agonist',
    'Androcur',
    'Utrogestan',
    'Oestrogel'
  ]) {
    assert.equal(inferDrugClass(drug), 'hrt', drug);
  }
});

test('everything else infers as other, finasteride and dutasteride included', () => {
  for (const drug of ['Sertraline', 'Finasteride', 'Dutasteride', 'Minoxidil', 'Ibuprofen', '']) {
    assert.equal(inferDrugClass(drug), 'other', drug);
  }
});

test('a stored value reads back as hrt only when it says hrt', () => {
  assert.equal(toDrugClass('hrt'), 'hrt');
  assert.equal(toDrugClass('other'), 'other');
  assert.equal(toDrugClass('something-later'), 'other');
  assert.equal(toDrugClass(null), 'other');
});
