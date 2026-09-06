/* The WebView floor, as a rule about the app's own source rather than a
   number in two config files (phase 8 features ticket 55, ADR-0023).

   `minWebViewVersion` says what Android refuses to install on, and
   `build.target` in vite.config.ts now says what the bundle is compiled
   to - derived from the first, so the syntax half cannot drift. What
   neither can catch is a method: esbuild compiles `?.` down for Chrome 87
   and leaves `Array.prototype.at` exactly where it found it, so a call
   that arrived in Chrome 92 ships happily and throws on the phone the
   floor promised to run on.

   That is not hypothetical. Ticket 55 measured it: four `.at(-1)` calls
   and one `.toReversed()` were in shipped screens, putting the app's real
   floor at Chrome 110 while both config files said 87. All five were
   rewritten, and this is what keeps them rewritten.

   The list is deliberately short - the APIs a modern habit reaches for,
   not every method Chrome has added since 2020. Anything above the floor
   that this does not name is a gap in this list, and the answer is to add
   it here rather than to widen the rule. A dependency's own calls are not
   ours to rewrite: pdf.js needs `.at` and gets a polyfill instead
   (src/lib/data/documents/pdf-floor.ts), which is why that file is
   allowed to name it. */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { test } from 'vitest';
import capacitorConfig from '../capacitor.config.ts';

const src = fileURLToPath(new URL('../src/', import.meta.url));

/** The floor itself, read where Android reads it rather than written down
    a third time. */
const FLOOR = capacitorConfig.android?.minWebViewVersion ?? 0;

/** What each one costs, so a failure says which Chrome it would break. */
const ABOVE_THE_FLOOR: [pattern: RegExp, api: string, since: number][] = [
  [/\.at\(-?\d/g, 'Array.prototype.at', 92],
  [/\bObject\.hasOwn\(/g, 'Object.hasOwn', 93],
  [/\.toReversed\(/g, 'Array.prototype.toReversed', 110],
  [/\.toSorted\(/g, 'Array.prototype.toSorted', 110],
  [/\.findLast(Index)?\(/g, 'Array.prototype.findLast', 97],
  [/\bstructuredClone\(/g, 'structuredClone', 98],
  [/\bObject\.groupBy\(/g, 'Object.groupBy', 117],
  [/\bPromise\.withResolvers\(/g, 'Promise.withResolvers', 119]
];

/** The one file that patches an API rather than avoiding it, for a
    dependency that needs it (documents/pdf.ts's header says why). */
const POLYFILL = 'lib/data/documents/pdf-floor.ts';

/** The code with its comments taken out, because this repo's comments
    discuss these APIs by name - pdf-worker.ts's header is about the very
    `.at(-1)` it exists to survive, and a rule that read comments would
    have to be argued with rather than fixed. Crude on purpose: block
    comments, then line comments whose `//` is not part of a `https://`.
    A call hiding after a URL on one line would be missed, which is a
    trade worth making against a rule nobody can write a comment near. */
const withoutComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, found);
    else if (/\.(ts|svelte)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) found.push(path);
  }
  return found;
}

test('nothing the app ships calls an API newer than the WebView floor', () => {
  assert.ok(FLOOR > 0, 'capacitor.config.ts names no minWebViewVersion for this rule to be about');
  const offences: string[] = [];

  for (const file of sources(src)) {
    const relative = file.slice(src.length);
    if (relative === POLYFILL) continue;
    if (relative.startsWith('lib/paraglide/')) continue; // generated, not written here
    const code = withoutComments(readFileSync(file, 'utf8'));

    for (const [pattern, api, since] of ABOVE_THE_FLOOR) {
      if (since <= FLOOR) continue;
      const hits = code.match(pattern);
      if (hits) offences.push(`${relative}: ${hits.length}x ${api} (Chrome ${since})`);
    }
  }

  assert.deepEqual(
    offences,
    [],
    `these run above the WebView floor of ${FLOOR} that capacitor.config.ts promises:\n${offences.join('\n')}`
  );
});

/* The positive control. A rule written as a grep can pass because the
   grep is wrong, so this proves the pattern actually finds what it is
   looking for - in a string that never reaches a browser. */
test('the rule finds what it is looking for', () => {
  const sample = 'const last = rows.at(-1);';
  const [pattern] = ABOVE_THE_FLOOR[0];
  assert.equal(sample.match(pattern)?.length, 1);
});
