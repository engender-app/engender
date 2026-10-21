/* Match a free-text hormone name with full names and whole-word abbreviations. */

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
