/* Keep chart libraries on chart-only import paths. A kit helper such as
   barRow must be able to import share without reaching d3. charts/geometry.ts
   stays dependency-free and charts/areaPath.ts owns the library import.
   charts/share.ts stays separate so Rollup can group it with the kit helpers.

   This test walks static source imports. Dynamic import() defers a library
   until a page needs it, as with Tesseract. Rollup can still merge chunks
   based on which entries share a module. The first-load budget checks the
   emitted bundle for that case. */

import { expect, test } from 'vitest';
import { reach as reachModules, sources, specifiers, type Sources } from './source-graph';

/** Package names that draw. `d3-shape` and `d3-scale` today; the rule is
    about the shape of the dependency, not about which one it is. */
const CHART_LIBRARY = /^d3(-|$)/;

/** Everything allowed to import one, which is the charts and nothing else.
    Adding a line here is a decision, not a formality: a module on this list
    hands the library to everything that imports it. */
const LOADERS = [
  'src/lib/charts/areaPath.ts',
  'src/lib/components/CycleEventChart.svelte',
  'src/lib/components/EffectsTimeline.svelte'
];

/** Of those, the ones that are not components. A `.ts` module is the shape
    this rule exists for: a helper is imported for what it computes, by
    callers that have no idea a library came with it. */
const HELPERS_THAT_LOAD = ['src/lib/charts/areaPath.ts'];

/** What a first visit runs before anything is chosen: the shell, its data
    load, and the screen it opens on. */
const FIRST_SCREENS = ['src/routes/+layout.svelte', 'src/routes/+layout.ts', 'src/routes/+page.svelte'];

/** Every module whose static imports reach a charting library. */
function reach(files: Sources): Map<string, string[]> {
  return reachModules(files, (_, specs) => specs.some((spec) => CHART_LIBRARY.test(spec)));
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
