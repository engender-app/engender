/* What a hair staging recorded against a published scale says, as text
   (functional audit ticket 23).

   Staging used to be a grade on Norwood-Hamilton (twelve stages, read off
   the hairline and the crown) or Sinclair (five grades, read off the
   central parting; Sinclair R et al., J Am Acad Dermatol.
   2004;51(2):189-199, PMID 15280836), or "neither" with free text. Since
   ticket 23 a staging is only the person's own words. Migration 99 turned
   every stored grade into its text, and an archive written before that
   still carries `scale` and `stage`, so restore asks this file the same
   question and gets the same answer the migration's SQL gives.

   The text is the scale's proper name and the grade's code, "Norwood-Hamilton
   3V" or "Sinclair 2", the way clinics write them in either language. A
   migration has no language to write in, and a word like "stage" or
   "vertex" would be English in a Polish journal.

   Node-tier safe: no paraglide import (ADR-0016). */

const NORWOOD_HAMILTON_STAGES = ['1', '2', '2a', '3', '3v', '3a', '4', '4a', '5', '5a', '6', '7'] as const;
const SINCLAIR_GRADES = ['1', '2', '3', '4', '5'] as const;

const LEGACY_SCALES: Record<string, { name: string; grades: readonly string[] }> = {
  norwood_hamilton: { name: 'Norwood-Hamilton', grades: NORWOOD_HAMILTON_STAGES },
  sinclair: { name: 'Sinclair', grades: SINCLAIR_GRADES }
};

/** Whether an older archive's (scale, stage) pair is one a build before
    ticket 23 could have written: a published grade on its scale, or
    'other' with no grade. Anything else is a damaged row. */
export function isLegacyHairStaging(scale: string, stage: string): boolean {
  if (scale === 'other') return stage === '';
  return LEGACY_SCALES[scale]?.grades.includes(stage) ?? false;
}

/** The free text a staging from before ticket 23 reads as: its own words
    under 'other', else the scale's name and the grade's code. Must agree
    with migration 99's CASE (hair-stage-free-text-migration.test.ts). */
export function legacyHairStagingText(scale: string, stage: string, description: string): string {
  const published = LEGACY_SCALES[scale];
  return published ? `${published.name} ${stage.toUpperCase()}` : description;
}
