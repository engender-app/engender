/* Benchmark records carry a passage key so speaking rate and pitch span
   compare across takes of the same text. The texts live in messages/.

   English uses Fairbanks's 1940 Rainbow Passage verbatim, including American
   spelling and its gendered final sentence. It was chosen on 2026-08-31 over
   an app-written passage, with its copyright status unsettled. Comparison is
   against one's own takes, independent of published norms. The Polish
   “Północny wiatr i słońce” uses app-written wording for the Aesop fable,
   separate from the Journal of the IPA wording. */

/** The word count a speaking rate is measured over, taken from the text
    rather than written down beside it: a passage and a hand-maintained
    number for it would drift the first time a word changed, and the rate
    would drift silently with it. */
export function wordCountOf(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/** FNV-1a over the passage's words. Not a checksum for anything to trust -
    it is a short stable name for "this exact text", so two takes of the same
    custom passage land in one series and an edited one starts a new series
    instead of quietly continuing the old. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  // Over the text with its whitespace normalized, so a reflowed line or a
  // trailing newline is the same passage.
  for (const character of text.trim().toLowerCase().split(/\s+/).join(' ')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** The built-in passage's key for a language. Language-qualified because the
    English and Polish passages are different texts: somebody who switches
    the app's language starts a new series, which is the truth, rather than
    continuing one whose numbers no longer mean the same thing. */
export const builtInPassageKey = (locale: string): string => `builtin-${locale}`;

/** A custom passage's key: its own fingerprint, so the series follows the
    text and not the fact that it was custom. */
export const customPassageKey = (text: string): string => `custom-${fingerprint(text)}`;
