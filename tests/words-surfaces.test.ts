/* The one rule the word list keeps that only its source can be held to
   (phase 8 audit ticket 17), in the shape more-surfaces.test.ts and
   home-surfaces.test.ts already use for a screen.

   The ticket's acceptance is that changing the presentation or era filter
   does not re-tokenise the notes, and where that is decided is which
   `$derived` the analysis hangs off. `wordFrequency.test.ts` proves the fold
   supports it - counting a group touches no note text - but nothing there
   can see the screen wire the two together, and
   `countWords(analyseNotes(filteredEntries))` would leave every one of those
   tests green while putting all three passes back on every tap.

   A grep because a `.svelte` file's `$derived` graph has no other seam a
   node test can reach: liveQuery is an effect, and an effect needs a
   component initialising around it. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const words = readFileSync(root + 'src/routes/transition/words/+page.svelte', 'utf8');

describe('what a filter tap on the word list re-runs', () => {
  it('analyses the query rows, so a tap never reaches the note text', () => {
    expect(words).toMatch(/\$derived\(analyseNotes\(entriesQuery\.rows\)\)/);
    // Not the filtered list, and not inside the counting: either would put
    // the tokenising back on the tap.
    expect(words).not.toMatch(/analyseNotes\(filteredEntries\)/);
    expect(words).not.toMatch(/countWords\(analyseNotes\(/);
  });

  it('counts and reads the Polish caveat off the analysis rather than the notes', () => {
    expect(words).toMatch(/\$derived\(countWords\(filteredEntries, ignoredWords\)/);
    expect(words).toMatch(/filteredEntries\.some\(\(e\) => e\.language === 'pl'\)/);
    expect(words).not.toContain('noteLanguage');
  });
});
