/* Guess a new or legacy episode's drug class using the same pure rule
   in setup, migrations and Archive restore (ADR-0016). Store the class
   on the episode so the person can change it.

   Case-fold the name, remove diacritics and look for a substring from the
   hormone, antiandrogen, GnRH and common Polish/UK brand lists. Leave
   finasteride and dutasteride as other by default. Otherwise treatment
   for scalp hair could change the HRT timeline. */

import type { DrugClass } from './types';

const HRT_NAMES = [
  // Hormones. Polish inflections ("estradiolu", "testosteronu",
  // "progesteronu") contain these stems; "oestr" is folded to "estr" first.
  'estradiol',
  'estrogen',
  'testosteron',
  'progesteron',
  // Antiandrogens: English and Polish stems ("spironolakton", "cyproteronu",
  // "bikalutamid").
  'spironolact',
  'spironolakt',
  'cyproteron',
  'bicalutamid',
  'bikalutamid',
  // GnRH agonists and antagonists.
  'relin',
  'leuprolide',
  'degarelix',
  'gnrh',
  // Brand names.
  'progynova',
  'estrofem',
  'estradot',
  'estrogel', // Oestrogel, after the fold
  'divigel',
  'sandrena',
  'evorel',
  'androcur',
  'aldactone',
  'verospiron',
  'utrogestan',
  'luteina',
  'nebido',
  'sustanon',
  'testogel',
  'androgel',
  'tostran',
  'decapeptyl',
  'diphereline',
  'zoladex',
  'prostap',
  'lupron'
] as const;

/** Lowercase with combining marks removed, so a name typed with or without
    its diacritics reads the same. */
const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The class an episode for `drug` starts as. */
export function inferDrugClass(drug: string): DrugClass {
  const name = fold(drug).replace('oestr', 'estr');
  return HRT_NAMES.some((stem) => name.includes(stem)) ? 'hrt' : 'other';
}

/** A stored value read back as a class. Anything but 'hrt' is 'other': the
    column has no CHECK (vocabularies live in code), so an unknown value from
    a later build reads as the class that anchors nothing. */
export const toDrugClass = (stored: unknown): DrugClass => (stored === 'hrt' ? 'hrt' : 'other');
