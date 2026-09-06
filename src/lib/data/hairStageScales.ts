/* The published scales a hair staging can be recorded against (phase 4
   ticket 09, second scale and escape hatch added by phase 5 ticket 33), and
   the grouping that keeps them apart.

   Node-tier safe: no paraglide import (ADR-0016), the same rule
   hairRemovalAreas.ts and garmentCategories.ts follow - journal's
   hairProgress.ts validates an incoming scale and grade against this file
   and runs under the Node tier's tests.

   NORWOOD-HAMILTON is the twelve published stage labels, including the
   "vertex" and "a" (anterior) variants at stage 3 and beyond. Closed:
   there is no sixth or in-between stage to add, the scale itself is the
   fixed vocabulary - unlike a measurement type, which opens to a custom one
   (ticket 29).

   SINCLAIR is the second scale ticket 33 asks for, and it is a separate
   published classification, never a conversion target for the first. Five
   grades, read off the central parting rather than the hairline. From
   Sinclair R, Jolley D, Mallari R, Magee J, "The reliability of
   horizontally sectioned scalp biopsies in the diagnosis of chronic diffuse
   telogen hair loss in women," J Am Acad Dermatol. 2004;51(2):189-199
   (PMID 15280836), which states outright that "a mid-scalp clinical grading
   scale was developed" and then grades patients as stage 1 or 2 and stage
   3, 4 or 5.

   Cross-checked, as ticket 07 and ticket 02's effect windows were, against
   reproductions that do not share an author with the original - the
   distinction matters here, because Sinclair has restated his own scale in
   several later papers and those corroborate nothing:

   - Vujovic A, Del Marmol V, Biomed Res Int. 2014;2014:767628 (PMID
     24812631) names "the 5-point Sinclair scale" against Ludwig's three and
     cites the 2004 paper as its origin, which is the grade count and the
     provenance confirmed by a group with no stake in either.
   - Abusailik MA, Muhanna AM, Almuhisen AA et al., Dermatol Reports.
     2021;13(2) (PMID 34659671) summarises all five grades, including grade
     4 as "the development of a bald spot anteriorly".

   Sinclair R, Torkamani N, Jones L, F1000Res. 2015;4:585 (PMID 26339482) is
   also cited below for its grade wording, but it is the scale's own first
   author and is not part of the cross-check.

   Two discrepancies it turned up, recorded rather than smoothed over:

   - Grade 4 has two circulating wordings, both Sinclair's own. The 2015
     review says "development of a bald spot anteriorly"; Dinh QQ, Sinclair
     R, Clin Interv Aging. 2007;2(2):189-199 says "diffuse hair loss over
     the top of the scalp". Those are different observations, not a
     paraphrase. Nothing in this file depends on which is right - only the
     grade codes are stored, and no wording of either is shown on screen -
     but the first is the one the independent reproduction above carries.
   - The scale's origin is commonly cited as Sinclair R, Wewerinke M, Jolley
     D, Br J Dermatol. 2005;152(3):466-473. That paper applies a mid-scalp
     grade but does not originate the five-point scale, so the 2004 paper is
     cited here instead.

   Ludwig (Br J Dermatol. 1977;97(3):247-254) was the other candidate and
   was not taken. Its three grades are defined against "a line situated 1-3
   cm behind the frontal hair line", which a person cannot find on
   themselves in a mirror, and its published title scopes it to "the female
   sex" with no other framing available. Sinclair's grade wording carries no
   gendered language at all, and Kerkemeyer KL et al., J Am Acad Dermatol.
   2022;86(6):1406-1408 (PMID 34111498) published a modified Sinclair scale
   validated on men, so the literature itself already applies these grades
   off a female body - a Sinclair paper again, which is fine for that point:
   it is evidence about what the literature does, not a second reading of
   the grade list. Not the Sinclair *shedding* scale, which is a
   different six-grade scale about how much hair comes out in a day.

   OTHER is the third option, and it is not a scale. Ticket 33 requires a
   way to record a pattern neither published scale describes - diffuse
   thinning, or simply neither of these - and it may not be absent. It
   carries free text and no grade, so nothing can read it as a point on
   either scale.

   The two scales share grade codes ('1' through '5' exist on both) and
   mean different things by them, which is the whole reason a staging is
   stored with its scale and why stagesByScale exists: no chart, list or
   comparison in this app may put two scales' stages in one series, the same
   discipline Lab series applies to two spellings of a unit. There is
   deliberately no conversion between them - a mapping would be invented
   clinical judgement. */

export const HAIR_SCALES = ['norwood_hamilton', 'sinclair', 'other'] as const;
export type HairScale = (typeof HAIR_SCALES)[number];

/* NORWOOD_HAMILTON_STAGES stays exported only for its own test (AU-09
   test-only review). */
export const NORWOOD_HAMILTON_STAGES = ['1', '2', '2a', '3', '3v', '3a', '4', '4a', '5', '5a', '6', '7'] as const;
export type NorwoodHamiltonStage = (typeof NORWOOD_HAMILTON_STAGES)[number];

/* SINCLAIR_GRADES stays exported only for its own test (AU-09 test-only
   review). */
export const SINCLAIR_GRADES = ['1', '2', '3', '4', '5'] as const;
export type SinclairGrade = (typeof SINCLAIR_GRADES)[number];

const GRADES: Record<HairScale, readonly string[]> = {
  norwood_hamilton: NORWOOD_HAMILTON_STAGES,
  sinclair: SINCLAIR_GRADES,
  other: []
};

/* isHairScale stays exported only for its own test (AU-09 test-only review). */
export const isHairScale = (value: string): value is HairScale =>
  (HAIR_SCALES as readonly string[]).includes(value);

/** The grades `scale` publishes, oldest-scale order. Empty for 'other',
    which publishes none, and for anything that is not a scale. */
export const gradesOfScale = (scale: string): readonly string[] => (isHairScale(scale) ? GRADES[scale] : []);

/** Whether `scale` publishes grades at all. False for 'other', whose
    records are free text rather than a point on anything, and false for
    anything that is not a scale. Screens branch on this rather than on
    `scale !== 'other'`, so a third published scale would not need every one
    of them found again. */
export const isGradedScale = (scale: string): boolean => gradesOfScale(scale).length > 0;

/** Whether `stage` is a grade `scale` actually publishes. A scale with no
    grades takes the empty one and only that. */
export function isHairStaging(scale: string, stage: string): boolean {
  if (!isHairScale(scale)) return false;
  if (!isGradedScale(scale)) return stage === '';
  return gradesOfScale(scale).includes(stage);
}

/** The stagings split by the scale each belongs to, in HAIR_SCALES order,
    with a scale nothing was recorded under left out entirely.

    The split is the point: two scales' stages never share a list, a chart
    or a subtitle, so nothing on screen can read as one series across a
    change of scale. Order within a scale is whatever order the caller
    handed over, so a caller's own sort survives.

    A row naming something that is not a scale cannot exist - the schema's
    CHECK refuses it on the way in, on a write and on a restore alike
    (schema.ts) - so there is no fallback group for one here. */
export function stagesByScale<T extends { scale: string }>(
  stages: readonly T[]
): { scale: HairScale; stages: T[] }[] {
  return HAIR_SCALES.map((scale) => ({ scale, stages: stages.filter((s) => s.scale === scale) })).filter(
    (group) => group.stages.length > 0
  );
}
