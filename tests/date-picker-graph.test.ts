/* Which modules are allowed to load flatpickr, and which of them a first
   visit is allowed to reach.

   Phase 11 final audit finding P1 read the source graph as: DatePicker.svelte
   imports registerOverlayRegion from overlayLock.ts, which Sheet.svelte,
   LetterArrival.svelte and android/platform-sync.ts also import, so the
   bundler was expected to fuse flatpickr into whichever chunk the shell needs
   for those. It grepped that chunk's own dependency list
   (`nodes/0.*.js` -> its imported chunk's `__vite__mapDeps` table) and found
   flatpickr's chunk and CSS named there, and read that as flatpickr shipping
   in the first-load payload.

   Measured against the build, it does not. On 4d4cddb3 with this ticket's
   branch point, `build/index.html`'s modulepreload set is 102 scripts; none
   of them - checked by grepping every one for `flatpickr-calendar`, a class
   name flatpickr's own JS must contain verbatim to match its CSS - carries
   flatpickr's code. `node scripts/check-first-load-budget.mjs` reads
   261,065B/107 files against a 262,583B/113 files budget: already passing,
   with headroom, no change needed.

   The chunk the audit named (~29.6KB gzip, matching its 30,142B) is real and
   is modulepreloaded by the layout, but what's inside it is overlayLock.ts
   plus SvelteKit's own routing glue - not flatpickr. The `__vite__mapDeps`
   entry the audit's grep hit is inert: it is the dependency list Vite embeds
   next to QuickAdd.svelte's own `import('./QuickAddBackdateSheet.svelte')`
   call, so the browser knows what to preload *if that lazy import ever
   fires*. It is a filename in an array, not bytes on the wire.

   The reason there was nothing to fix by the time the audit ran: commit
   0cdd1066 (2026-09-18, three days before the audit) already split
   QuickAddBackdateSheet.svelte out from QuickAdd.svelte behind that dynamic
   import specifically to keep flatpickr out of the entry bundle - its own
   message says so. Unlike phase 9 audit ticket 02's d3 finding, where the
   eager module (kit/barRow.ts) statically imported an arithmetic helper out
   of the same file that imported d3 at its top, there is no analogous static
   coupling here: overlayLock.ts imports nothing of DatePicker's or
   flatpickr's. The dependency only runs the other way, DatePicker importing
   overlayLock's registerOverlayRegion, which cannot pull flatpickr backward
   into overlayLock.ts's own reachable graph. So there was no helper to split
   and no budget to re-record.

   What is still worth having: nothing today stops someone turning
   QuickAddBackdateSheet's dynamic import back into a static one by accident
   and quietly regressing this. This file is that guard, in the shape of
   tests/chart-library-graph.test.ts. */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const rootPath = fileURLToPath(new URL('../', import.meta.url));

/** flatpickr itself and its subpath imports (locales, types, CSS). */
const FLATPICKR_LIBRARY = /^flatpickr(\/|$)/;

/** Everything allowed to import it. Adding a line here is a decision, not a
    formality: a module on this list hands the library to everything that
    imports it. */
const LOADERS = [
  'src/lib/components/DatePicker.svelte',
  'src/lib/components/flatpickrLocale.ts',
  'src/routes/calendar/+page.svelte'
];

/** Of those, the ones that are not components. A `.ts` module is the shape
    this rule exists for: a helper is imported for what it computes, by
    callers that have no idea a library came with it. */
const HELPERS_THAT_LOAD = ['src/lib/components/flatpickrLocale.ts'];

/** What a first visit runs before anything is chosen: the shell, its data
    load, and the screen it opens on. */
const FIRST_SCREENS = ['src/routes/+layout.svelte', 'src/routes/+layout.ts', 'src/routes/+page.svelte'];

/** Repo-relative path to source text, for every module under `src/`. */
type Sources = Map<string, string>;

function sources(): Sources {
  const found: Sources = new Map();
  const visit = (dir: string) => {
    for (const entry of readdirSync(join(rootPath, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) visit(path);
      else if (/\.(ts|svelte)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
        found.set(path, readFileSync(join(rootPath, path), 'utf8'));
      }
    }
  };
  visit('src');
  return found;
}

/** Comments name libraries and modules on purpose; imports are code. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Everything a module pulls in before it runs, re-exports included.

    `import type` is not one of them: the compiler erases it, so it puts
    nothing in a chunk and a rule that counted it would demand a move the
    build has no use for. An inline `{ type Point }` inside a value import
    is left alone - the statement it rides in is a real edge anyway. */
function specifiers(text: string): string[] {
  const statement = /(?<![\w$.])(?:import|export)\s+(?!type\s)(?:[^'"()]*?\bfrom\s*)?['"]([^'"]+)['"]/g;
  return [...code(text).matchAll(statement)].map((match) => match[1]);
}

/** A specifier as a path in `sources`, or null where it names a package or
    something generated that no first screen reaches. */
function resolve(from: string, specifier: string, files: Sources): string | null {
  let base: string;
  if (specifier.startsWith('$lib/')) base = `src/lib/${specifier.slice(5)}`;
  else if (specifier.startsWith('.')) base = relative(rootPath, join(rootPath, dirname(from), specifier));
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.svelte`, `${base}/index.ts`]) {
    if (files.has(candidate)) return candidate;
  }
  return null;
}

/** Every module whose static imports reach flatpickr, mapped to the chain
    that gets there - so a failure names the module that loads it and the
    hop that picked it up, not only the module answering for it. */
function reach(files: Sources): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const chains = new Map<string, string[]>();
  for (const [path, text] of files) {
    const specs = specifiers(text);
    if (specs.some((spec) => FLATPICKR_LIBRARY.test(spec))) chains.set(path, [path]);
    graph.set(
      path,
      specs.map((spec) => resolve(path, spec, files)).filter((dep): dep is string => dep !== null)
    );
  }
  let spreading = true;
  while (spreading) {
    spreading = false;
    for (const [path, deps] of graph) {
      if (chains.has(path)) continue;
      const through = deps.map((dep) => chains.get(dep)).find((chain) => chain !== undefined);
      if (through === undefined) continue;
      chains.set(path, [path, ...through]);
      spreading = true;
    }
  }
  return chains;
}

test('no module a first visit runs reaches flatpickr', () => {
  const files = sources();
  // A renamed route would otherwise leave this asserting over nothing.
  expect(FIRST_SCREENS.filter((path) => !files.has(path))).toEqual([]);

  const chains = reach(files);
  const reached = FIRST_SCREENS.map((path) => chains.get(path))
    .filter((chain): chain is string[] => chain !== undefined)
    .map((chain) => chain.join(' -> '));

  expect(reached).toEqual([]);
});

test('flatpickr is imported by the date picker and by nothing else', () => {
  const files = sources();
  const direct = [...files]
    .filter(([, text]) => specifiers(text).some((spec) => FLATPICKR_LIBRARY.test(spec)))
    .map(([path]) => path)
    .sort();

  expect(direct).toEqual(LOADERS);
});

test('no helper module reaches flatpickr', () => {
  const helpers = [...reach(sources()).keys()].filter((path) => path.endsWith('.ts')).sort();

  expect(helpers).toEqual(HELPERS_THAT_LOAD);
});

/* The three above pass on a tree that has nothing wrong with it, which is
   also what they would do if `reach` never found anything. This runs the same
   rule over the shape this ticket's audit finding described - a layout that
   statically imports the date picker directly instead of through the
   backdate sheet's dynamic import - and it has to fail. */
test('the rule catches the date picker imported straight from the layout', () => {
  const chains = reach(
    new Map([
      ['src/routes/+layout.svelte', `<script>import DatePicker from '$lib/components/DatePicker.svelte';</script>`],
      ['src/lib/components/DatePicker.svelte', `import flatpickr from 'flatpickr';\nexport default flatpickr;`]
    ])
  );

  expect(chains.get('src/routes/+layout.svelte')).toEqual([
    'src/routes/+layout.svelte',
    'src/lib/components/DatePicker.svelte'
  ]);
});
