/* Whether a regimen episode is HRT or some other drug (functional audit
   ticket 18, CONTEXT: "Drug class"). Pure and free of paraglide (ADR-0016):
   the migration, archive restore and the regimen screen all ask it, and the
   first two run where no catalogue is loaded.

   The class is stored on the episode and the person can change it. This
   file only answers the first guess: what a new episode starts as, what an
   episode written before the column existed is given by the migration, and
   what an archive row from an older build is read as. All three use this
   one rule so a journal and its own backup always agree.

   The rule: an episode is HRT when its drug names a hormone or a blocker
   used in gender-affirming hormone therapy, matched as a substring of the
   lowercased name with diacritics removed. Everything else is "other".

   - Hormones: estradiol (and oestradiol, estrogen, oestrogen),
     testosterone, progesterone.
   - Antiandrogens: spironolactone, cyproterone, bicalutamide.
   - GnRH agonists and antagonists: the "-relin" generics (leuprorelin,
     triptorelin, goserelin, histrelin, buserelin, nafarelin), leuprolide,
     degarelix, and "gnrh" itself.
   - A short list of brand names common in Poland and the UK, so an episode
     typed as "Androcur" or "Utrogestan" is not filed as other.

   Finasteride and dutasteride stay "other" on purpose. Both are as often
   taken for scalp hair as for HRT, and a guess of HRT would move the
   effects timeline for someone treating hair loss. A person who takes one
   as part of HRT changes the class on the episode. */

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
