/* Which injectable testosterone ester a regimen episode is, for the hormone
   curve (phase 5 ticket 01, CONTEXT: "Injectable testosterone ester"). Pure,
   above the journal seam and free of paraglide (ADR-0016), the same shape as
   hormoneEster.ts beside it.

   Parallel to hormoneEster.ts and deliberately never merged with it. The two
   drugs share the ester words - "enanthate" and "cypionate" name a
   testosterone ester and an estradiol ester both - and they share the IM and
   SC routes, but they rest on separate compartment fits and separate
   evidence. hormoneEster.ts's own drug gate exists for exactly this reason
   and says so in a comment; this file is the other half of that guard rather
   than a relaxation of it. A widened `Injectable ester` covering both would
   let one drug's dose reach the other drug's parameters, which is the one
   failure the estradiol side was built to prevent.

   Both catalogues' languages are matched, for the reason hormoneEster.ts
   gives: these fields hold whatever the user typed. Testosterone is the
   easier of the two - the Polish "testosteron" is a prefix of the English
   "testosterone", so one substring covers both, where estradiol's esters
   needed a list per language. */

import { mentions, normalize, type DrugNames } from './hormoneNameMatch';

/** The drug has to be testosterone before any ester word is worth reading,
    the mirror of hormoneEster.ts's ESTRADIOL_NAMES gate.

    "testosteron" rather than "testosterone" so the Polish forms
    ("testosteron", "testosteronu", "cypionian testosteronu") match on the
    same substring. A bare "T" counts as a whole word: it is what a trans
    masc user types far more often than the full name, and in a field that
    holds a drug name a single letter T means nothing else. It cannot reach
    the estradiol parameters either way, because that side demands the word
    "estradiol" or "e2" of its own. */
const TESTOSTERONE_NAMES: DrugNames = { names: ['testosteron'], abbreviations: ['t'] };

/** Drugs whose name contains testosterone's and which are not testosterone.
    Checked before TESTOSTERONE_NAMES, so the substring that makes them match
    does not decide the answer.

    Methyltestosterone is 17-alpha-alkylated and taken orally, with
    pharmacokinetics nothing in this app describes. Same fail-closed rule as
    everywhere else here: a drug with no parameters gets no curve rather than
    a near neighbour's. */
const NOT_TESTOSTERONE: DrugNames = {
  names: ['methyltestosteron', 'metylotestosteron'],
  abbreviations: []
};

/** Whether `drug` is testosterone at all, regardless of ester or route - the
    counterpart of isEstradiolDrug, and what the qualitative routes read when
    they have no ester field to consult. */
export function isTestosteroneDrug(drug: string): boolean {
  const text = normalize(drug);
  if (mentions(text, NOT_TESTOSTERONE)) return false;
  return mentions(text, TESTOSTERONE_NAMES);
}
