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
   needed a list per language.

   There is no list of testosterone esters here, and that is the finding of
   ticket 01 rather than work left undone. No published testosterone fit
   clears the bar the four estradiol esters clear, so no testosterone ester
   gets a band and this vocabulary is empty. The bar, measured rather than
   taken on trust: recomputing the 5th-to-95th percentile ratio of the average
   level across estrannaise's own posterior samples gives 1.19 (enanthate),
   1.24 (valerate), 1.28 (benzoate) and 1.29 (cypionate), against 7.64 for the
   estradiol undecylate that was rejected for being too loose to draw. That is
   what CONTEXT.md's "about a third" and "more than tenfold" describe.

   Two testosterone esters are tighter than any of those four and still fail,
   both on the second condition rather than on width:

   Testosterone cypionate, IM - Bi Y, Perry PJ, Ellerby M, Murry DJ,
   "Population Pharmacokinetic/Pharmacodynamic Modeling of Depot Testosterone
   Cypionate in Healthy Male Subjects," CPT Pharmacometrics Syst Pharmacol.
   2018;7(4):259-268, doi:10.1002/psp4.12287. A complete one-compartment model
   from 31 subjects, 1.16-fold on the average level - tighter than every ester
   this app draws. What it publishes is marginal bootstrap confidence
   intervals, not joint posterior samples and not a parameter covariance
   matrix. Drawing a band from marginals means sampling the parameters
   independently, which asserts an independence the source does not support and
   which clearance and volume in a model like this do not have. The width would
   then be partly ours, and hormoneCurveModels.ts rejected exactly that when it
   turned down a meta-analysis publishing no variability measure. The raw data
   is not published either, so the posterior cannot be re-derived here: the
   supplementary datasets are two-subject format templates, not the 31-subject
   analysis set. Separately, two of its terms are cis testicular physiology
   that does not transfer - a 6.24 ng/mL starting baseline, against roughly
   0.3-0.7 for a transmasculine person before T, and an LH-driven secretion
   term contributing about 240 ng/dL at full suppression.

   Testosterone undecanoate, IM - Pastuszak AW et al., "Population
   Pharmacokinetic Modeling and Simulations to Evaluate a Potential Dose
   Regimen of Testosterone Undecanoate in Hypogonadal Males," J Clin Pharmacol.
   2021;61(12):1618-1625, doi:10.1002/jcph.1939. The best-documented of the
   three: every relative standard error under 18%, bootstrap intervals, a
   visual predictive check, and it reproduces the Aveed label's observed
   exposures. 1.25-1.30-fold on the average level, just inside the accepted
   range. It fails because about 59% of the level it predicts comes from the
   cis endogenous production term - 290 ng/dL of roughly 495 at steady state -
   against a transmasculine person's 30-70, and the paper gives no basis for
   rescaling it. Its weight-on-absorption exponent of -1.83 also makes
   extrapolation below the study's 65 kg floor violent.

   The rest fail harder. Enanthate IM has a non-identifiable absorption rate:
   unestimable in 6 of 10 transmasculine subjects (Ichihara K, Masumori N,
   Fujii S, Toda T, Androgens: Clin Res Ther. 2020;1(1):15-21,
   doi:10.1089/andro.2020.0002), and a 97.5% interval crossing zero in the
   only population model of it. Enanthate SC has the second-best precision of
   any testosterone model but a table whose population the paper describes as
   adult in its caption and adolescent-scaled in its body, and the literal
   reading overpredicts the manufacturer's own phase 3 result by 1.7-fold.
   Cypionate and undecanoate SC have no model in any population. Propionate has
   no usable parameters at all - the only human PK is two 1980s studies at a
   sub-therapeutic 25 mg. Sustanon-type blends are impossible in principle
   rather than merely unpublished: every published curve from them is composite
   total testosterone, and no paper resolves the four esters into separate
   release curves.

   Licensing is not the blocker here, unlike the estrannaise case. That one was
   about copying a code file whose author asked people not to reproduce it;
   these are numeric parameter estimates, which are facts. The blockers are
   scientific, which is why they are argued above rather than waved at.

   Two intramuscular routes therefore have a documented path to a band and are
   worth revisiting rather than re-deriving: cypionate needs Bi 2018's
   covariance matrix, which the paper's own run computed but did not print, or
   its 31-subject dataset. Both would still need the cis baseline substituted,
   which is a judgement that paper does not license. Until then, no band. */

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
