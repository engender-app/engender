/* Which modules are allowed to load a charting library, and which of them a
   first visit is allowed to reach.

   Phase 9 audit ticket 02 raised this against a reading of the source graph:
   `components/kit/barRow.ts` imports one three-line function, `share`, out of
   `charts/geometry.ts`, whose first act is to import d3-shape. A kit helper
   that draws no chart therefore carried a charting library in its own import
   graph, and the audit expected Rollup's small-chunk folding to have put that
   library in the chunk the first screens download.

   Measured against the build, it had not. On 4c38403a, a production build's
   `build/index.html` named 107 `_app/immutable` scripts, 810 KB raw and 273 KB
   gzipped, and no d3 chunk was among them - checked by mapping every emitted
   chunk back to its module ids rather than by reading the file names, and
   checked again over the static import closure that adds the home route's own
   node (145 scripts, 310 KB gzipped) and again over a `VITE_DEMO=1` build.
   d3-shape and d3-scale sit in four chunks that only chart routes import,
   17 KB gzipped between them. So there was no 22 KB to save and nothing in
   the shipped payload to fix.

   The coupling the audit read off the source is real even though the symptom
   was not, and what made it harmless was a bundler decision nothing states or
   holds: Rollup groups modules by which entries import them and folds the
   small leftovers into larger chunks, and next month's grouping is not this
   month's promise. Two things came out of that, and only together:

   `areaPath` moved to charts/areaPath.ts, leaving charts/geometry.ts
   importing nothing, so that arithmetic cannot carry a library. And `share`
   moved to charts/share.ts, because moving the library user out was not on
   its own enough - with `share` still in geometry.ts, Rollup folded that
   module into the chunk AreaChart.svelte and d3-shape's monotone curve were
   already in, and the bar row's chunk went on importing it. Once `share` is
   a module no chart imports, the chunk holding barRow.ts and BarRows.svelte
   reaches no chunk carrying d3 at all, which the build says and the source
   alone could not.

   A `manualChunks` entry pinning d3 was the other fix on offer and is not
   here. It puts the library in a chunk of its own, which is not what was
   wrong: a chunk holding a non-chart helper would still import the chart
   chunk that imports it. What decides this is which modules share an owner,
   and that is what the rule below is about - including for the next library
   somebody imports three lines of arithmetic out of.

   First-load figures either side of the change, same production build:
   107 scripts, 810,248 raw and 273,064 gzipped before, 810,244 and 273,065
   after. No saving, because there was nothing there to save.

   Static imports only. A dynamic `import()` is the escape hatch by design -
   it is its own chunk, fetched when a page asks for it - and counting one
   here would fail the tesseract split that phase 5 deliberately made. */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const rootPath = fileURLToPath(new URL('../', import.meta.url));

/** Package names that draw. `d3-shape` and `d3-scale` today; the rule is
    about the shape of the dependency, not about which one it is. */
const CHART_LIBRARY = /^d3(-|$)/;

/** Everything allowed to import one, which is the charts and nothing else.
    Adding a line here is a decision, not a formality: a module on this list
    hands the library to everything that imports it. */
const LOADERS = [
  'src/lib/charts/areaPath.ts',
  'src/lib/components/CycleEventChart.svelte',
  'src/lib/components/EffectsTimeline.svelte',
  'src/lib/components/HormoneBandChart.svelte',
  'src/lib/components/LineChart.svelte',
  'src/lib/components/QualitativeCurveChart.svelte',
  'src/lib/components/WearTrendChart.svelte'
];

/** Of those, the ones that are not components. A `.ts` module is the shape
    this rule exists for: a helper is imported for what it computes, by
    callers that have no idea a library came with it. */
const HELPERS_THAT_LOAD = ['src/lib/charts/areaPath.ts'];

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
    something generated (the paraglide catalogue) that no chart reaches. */
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

/** Every module whose static imports reach a charting library, mapped to the
    chain that gets there - so a failure names the module that loads it and
    the hop that picked it up, not only the module answering for it. */
function reach(files: Sources): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const chains = new Map<string, string[]>();
  for (const [path, text] of files) {
    const specs = specifiers(text);
    if (specs.some((spec) => CHART_LIBRARY.test(spec))) chains.set(path, [path]);
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

test('no module a first visit runs reaches a charting library', () => {
  const files = sources();
  // A renamed route would otherwise leave this asserting over nothing.
  expect(FIRST_SCREENS.filter((path) => !files.has(path))).toEqual([]);

  const chains = reach(files);
  const reached = FIRST_SCREENS.map((path) => chains.get(path))
    .filter((chain): chain is string[] => chain !== undefined)
    .map((chain) => chain.join(' -> '));

  expect(reached).toEqual([]);
});

test('a charting library is imported by the charts and by nothing else', () => {
  const files = sources();
  const direct = [...files]
    .filter(([, text]) => specifiers(text).some((spec) => CHART_LIBRARY.test(spec)))
    .map(([path]) => path)
    .sort();

  expect(direct).toEqual(LOADERS);
});

test('no helper module reaches a charting library', () => {
  const helpers = [...reach(sources()).keys()].filter((path) => path.endsWith('.ts')).sort();

  expect(helpers).toEqual(HELPERS_THAT_LOAD);
});

/* The three above pass on a tree that has nothing wrong with it, which is
   also what they would do if `reach` never found anything. This runs the same
   rule over the shape ticket 02 described - a kit helper importing three lines
   of arithmetic out of the module that loads the library, and a shell that
   reaches the helper - and both have to fail. */
test('the rule catches a helper that imports out of a module holding a library', () => {
  const chains = reach(
    new Map([
      ['src/routes/+layout.svelte', `<script>import { rows } from '$lib/components/kit/barRow';</script>`],
      ['src/lib/components/kit/barRow.ts', `import { share } from '../../charts/geometry';\nexport const rows = share;`],
      ['src/lib/charts/geometry.ts', `import { area } from 'd3-shape';\nexport const share = area;`]
    ])
  );

  expect([...chains.keys()].filter((path) => path.endsWith('.ts')).sort()).toEqual([
    'src/lib/charts/geometry.ts',
    'src/lib/components/kit/barRow.ts'
  ]);
  expect(chains.get('src/routes/+layout.svelte')).toEqual([
    'src/routes/+layout.svelte',
    'src/lib/components/kit/barRow.ts',
    'src/lib/charts/geometry.ts'
  ]);
});
