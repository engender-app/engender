/* Which passage a benchmark was read from (phase 5 deepening ticket 15,
   CONTEXT: "Benchmark passage").

   A benchmark's speaking rate and pitch span only compare across months
   because the same words were read each time, so the row records which text
   that was and ticket 16's compare surface keys on it rather than assuming.

   **Why the app ships its own passage.** The obvious choices were the
   Rainbow Passage and the IPA's "North Wind and the Sun", which is what the
   ticket suggested. Both carry a licence question this project cannot answer
   cheaply: the Rainbow Passage is a 1940 publication whose status is
   unsettled, and the Polish "Północny wiatr i słońce" that phoneticians
   actually use is a translation published in the Journal of the IPA, which
   is Cambridge's. Nothing about a benchmark needs a famous passage - it needs
   the *same* passage, because the comparison is a person against their own
   earlier takes and never against a published norm. So the app ships a
   phonetically broad passage of its own per language, under the same GPL-3.0
   as the rest of the tree, and the question does not arise.

   Pure: the texts live in messages/, and what is here is how a text becomes
   a series key. */

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
