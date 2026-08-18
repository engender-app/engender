/* Which injectable estradiol ester a regimen episode is, for the hormone
   curve (phase 4 ticket 10). Pure, above the journal seam and free of
   paraglide (ADR-0016), like regimenEpisode.ts next to it; the wording for
   these keys lives in vocabulary/hormoneCurveLabels.ts.

   A closed vocabulary read out of two free-text fields, which is the awkward
   part. `RegimenEpisode.drug` and `.ester` are as free as an analyte's unit
   or a lab provider (CONTEXT: "Regimen episode") - there is no ester enum in
   the schema and this ticket does not add one, because a curve is a reading
   of the regimen rather than a new thing to record. So the resolution here
   is the same shape as ADR-0026's analyte allowlist: match the typed text
   against a built-in list of names, and answer null for anything the list
   does not know rather than guessing. An unrecognized ester gets no curve.

   Both catalogues' languages are matched, because these two fields hold
   whatever the user typed and the Polish names are not the English ones with
   an accent on them - "walerianian estradiolu" shares no ester word with
   "estradiol valerate". */

import type { RegimenEpisode } from './types';

/** The esters this app draws. Four, and every one of them has a published
    fit tight enough to be worth drawing (hormoneCurveModels.ts).

    Polyestradiol phosphate and estradiol undecylate are deliberately not
    here. PEP has no parameters this repository can use at all. Undecylate has
    some, but they rest on a handful of injections followed for about a
    fortnight against an ester that acts for months, so the fit constrained
    almost nothing - its plausible average level spanned more than tenfold
    where these four span about a third. A curve that loose is not worth
    drawing even with a label on it, so neither ester resolves and neither
    gets a curve. Order is the order screens list them in. */
export const INJECTABLE_ESTERS = ['benzoate', 'valerate', 'cypionate', 'enanthate'] as const;

export type InjectableEster = (typeof INJECTABLE_ESTERS)[number];

/** Names matched anywhere in the text, and abbreviations matched only as a
    whole word. "EV" inside a longer word is a coincidence; "walerianian"
    inside "walerianian estradiolu" is not. */
interface EsterNames {
  names: readonly string[];
  abbreviations: readonly string[];
}

const ESTER_NAMES: Record<InjectableEster, EsterNames> = {
  benzoate: { names: ['benzoate', 'benzoesan'], abbreviations: ['eb', 'e2b'] },
  valerate: { names: ['valerate', 'valerianate', 'walerianian'], abbreviations: ['ev', 'e2v'] },
  cypionate: { names: ['cypionate', 'cipionate', 'cypionian'], abbreviations: ['ec', 'e2c'] },
  enanthate: { names: ['enanthate', 'oenanthate', 'heptanoate', 'enantan'], abbreviations: ['een', 'e2en'] }
};

/* The drug has to be estradiol before any ester word is worth reading.
   Testosterone enanthate and estradiol enanthate share an ester word and
   share the IM route, so without this the app would draw one drug's curve
   from the other drug's parameters and nothing on screen would say so.
   "polyestradiol" and the Polish "estradiolu" both contain "estradiol", so
   the substring test covers them without a list of endings. */
const ESTRADIOL_NAMES = ['estradiol'] as const;
const ESTRADIOL_ABBREVIATIONS = ['e2'] as const;

/** Lowercased, with everything that is not a letter or digit turned into a
    space, so "E2-valerate" and "estradiol (valerate)" read the same. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function mentions(text: string, { names, abbreviations }: EsterNames): boolean {
  if (names.some((name) => text.includes(name))) return true;
  const words = text.split(' ');
  return abbreviations.some((abbreviation) => words.includes(abbreviation));
}

function esterIn(text: string): InjectableEster | null {
  return INJECTABLE_ESTERS.find((ester) => mentions(text, ESTER_NAMES[ester])) ?? null;
}

/** Whether `drug` is estradiol at all, regardless of ester - the half of
    resolveInjectableEster's check that has nothing to do with which ester or
    which route. Exported for ticket 11's qualitative routes, which have no
    ester field to read but still need to rule out a non-estradiol drug
    before drawing anything against its dose log. */
export function isEstradiolDrug(drug: string): boolean {
  return mentions(normalize(drug), { names: ESTRADIOL_NAMES, abbreviations: ESTRADIOL_ABBREVIATIONS });
}

/** Which ester `episode` is on, or null when this app draws no curve for it:
    the drug is not estradiol, or the ester is not one of the four. The ester
    field is read first and the drug field second - someone who corrects the
    ester without retyping the drug means the narrower field. */
export function resolveInjectableEster(episode: Pick<RegimenEpisode, 'drug' | 'ester'>): InjectableEster | null {
  if (!isEstradiolDrug(episode.drug)) return null;

  return esterIn(normalize(episode.ester ?? '')) ?? esterIn(normalize(episode.drug));
}
