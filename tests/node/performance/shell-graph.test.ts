/* Keep vocabulary/vocabulary.ts out of the shell's static import graph.
   Routes can load localized vocabulary with their own screens. This check
   covers static imports. check-first-load-budget.mjs checks emitted bundles. */

import { expect, test } from 'vitest';
import { reach, sources } from '../../source-graph';

const SHELL = ['src/routes/+layout.svelte', 'src/routes/+layout.ts'];
const WORDING = 'src/lib/data/vocabulary/vocabulary.ts';

const reachesWording = (files: ReturnType<typeof sources>) => reach(files, (path) => path === WORDING);

test('the shell does not reach the wording layer screens draw with', () => {
  const files = sources();
  expect(SHELL.filter((path) => !files.has(path))).toEqual([]);
  expect(files.has(WORDING)).toBe(true);

  const chains = reachesWording(files);
  const reached = SHELL.map((path) => chains.get(path))
    .filter((chain): chain is string[] => chain !== undefined)
    .map((chain) => chain.join(' -> '));

  expect(reached).toEqual([]);
});

/* The rule above also passes if `reach` finds nothing at all, so the shape it
   exists for has to fail: a shell importing the layer through a helper. */
test('the rule catches a shell that reaches the wording layer through a helper', () => {
  const chains = reachesWording(
    new Map([
      ['src/routes/+layout.svelte', `<script>import { lines } from '$lib/reminders/lines';</script>`],
      ['src/lib/reminders/lines.ts', `import { vocabulary } from '../data/vocabulary/vocabulary';\nexport const lines = vocabulary;`],
      [WORDING, `export const vocabulary = {};`]
    ])
  );

  expect(chains.get('src/routes/+layout.svelte')).toEqual([
    'src/routes/+layout.svelte',
    'src/lib/reminders/lines.ts',
    WORDING
  ]);
});
