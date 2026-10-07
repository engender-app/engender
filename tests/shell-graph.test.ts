/* What the shell may carry (after-release ticket 40).

   The root layout is in every first load whatever the address, and in front
   of a locked journal it is the only thing on screen. The screens' wording
   layer, vocabulary/vocabulary.ts, is not something it needs: it joins the
   mirror's rows to catalogue wording for screens to draw. Until ticket 40
   +layout.svelte imported it for one Android callback that reads affirmation
   ids and the person's own lines, neither of which has any wording to look
   up, and that one import put vocabulary.ts, doseLabels.ts,
   entryTemplates.ts and lean.ts in the shell: 4 of 108 first-load files and
   4195B gzip of the Polish graph. The screens that draw wording import it
   themselves and still get it with their own route.

   Static imports only, like chart-library-graph.test.ts: a dynamic import()
   is already off the shell. The bundle side is
   scripts/check-first-load-budget.mjs. */

import { expect, test } from 'vitest';
import { reach, sources } from './source-graph';

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
