/* The two rules the words reading keeps that only its source can be held to
   (phase 8 audit ticket 17, phase 10 redesign ticket 62), in the shape
   more-surfaces.test.ts and home-surfaces.test.ts already use for a screen.

   The first is the older one. Changing the era or the mode must not
   re-tokenise the notes, and where that is decided is which `$derived` the
   analysis hangs off. `wordFrequency.test.ts` proves the fold supports it -
   counting a group touches no note text - but nothing there can see the
   component wire the two together, and `analyseNotes(selectedEntries)`
   would leave every one of those tests green while putting all three passes
   back on every tap.

   The second is ticket 62's own, and it is the line between this reading
   and /compare. The baseline the weighting reads against is the whole
   journal's analysed notes; passing anything narrower - the other era's
   rows, say - would be the app placing two periods side by side and scoring
   one against the other, which ADR-0012 and /compare's own rule refuse.

   Greps because a `.svelte` file's `$derived` graph has no other seam a node
   test can reach: liveQuery is an effect, and an effect needs a component
   initialising around it. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const words = readFileSync(root + 'src/lib/components/WordsReading.svelte', 'utf8');

describe('what a selection tap on the words reading re-runs', () => {
  it('analyses the query rows, so a tap never reaches the note text', () => {
    expect(words).toMatch(/\$derived\(analyseNotes\(entriesQuery\.rows\)\)/);
    // Not the selected list, and not inside the weighting: either would put
    // the tokenising back on the tap.
    expect(words).not.toMatch(/analyseNotes\(selectedEntries\)/);
    expect(words).not.toMatch(/distinctiveWords\(analyseNotes\(/);
  });

  it('weighs and reads the Polish caveat off the analysis rather than the notes', () => {
    expect(words).toMatch(/\$derived\(distinctiveWords\(selectedEntries, analysed, ignoredWords\)/);
    expect(words).toMatch(/selectedEntries\.some\(\(e\) => e\.language === 'pl'\)/);
    expect(words).not.toContain('noteLanguage');
  });
});

describe('what the reading weighs a stretch against', () => {
  it('is the whole journal and never another stretch', () => {
    // `analysed` is every note the journal holds; `grouped` is the partition
    // the selection reads one bucket out of. The second argument being the
    // first of those is the whole of the rule.
    expect(words).toMatch(/distinctiveWords\(selectedEntries, analysed,/);
    expect(words).not.toMatch(/distinctiveWords\([^)]*grouped\./);
  });

  it('draws one selection at a time, with no unfiltered option to draw none', () => {
    // "All" would weigh the journal against itself, which has no distinctive
    // word in it by construction.
    expect(words).not.toContain('body_map_mode_filter_all');
  });
});
