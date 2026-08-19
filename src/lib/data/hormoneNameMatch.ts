/* How a drug or ester name typed into a free-text field is matched against a
   built-in list of names (phase 5 ticket 01). Pure, above the journal seam
   and free of paraglide (ADR-0016), like the two vocabularies that read it.

   Here rather than inside either vocabulary because both need exactly this
   matcher and neither owns it: hormoneEster.ts resolves the four estradiol
   esters, hormoneTestosteroneEster.ts resolves testosterone's, and the two
   lists are deliberately never merged (CONTEXT: "Injectable testosterone
   ester"). Sharing the matcher is not sharing the vocabulary - it keeps the
   two lists reading the same typed text the same way, so a change to how
   "E2-valerate" is normalized cannot apply to one drug and not the other. */

/** Names matched anywhere in the text, and abbreviations matched only as a
    whole word. "EV" inside a longer word is a coincidence; "walerianian"
    inside "walerianian estradiolu" is not. */
export interface DrugNames {
  names: readonly string[];
  abbreviations: readonly string[];
}

/** Lowercased, with everything that is not a letter or digit turned into a
    space, so "E2-valerate" and "estradiol (valerate)" read the same. */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function mentions(text: string, { names, abbreviations }: DrugNames): boolean {
  if (names.some((name) => text.includes(name))) return true;
  const words = text.split(' ');
  return abbreviations.some((abbreviation) => words.includes(abbreviation));
}
