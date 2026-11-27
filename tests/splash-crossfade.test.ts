/* The app root's half of the splash crossfade.

   src/app.html fades the root from its nil opacity to 1 when the splash
   leaves, with a transition on the root. The layout writes
   `transition-property: none` inline on the same element, so a recovery
   can conceal it in one frame, and an inline declaration outranks any
   stylesheet one that is not `!important`. From 2026-10-12 to the fix
   the root jumped 0.004 to 1 in one frame under a mark still at 0.94,
   and only the mark faded. */

import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const document = readFileSync(new URL('../src/app.html', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/routes/+layout.svelte', import.meta.url), 'utf8');

it('lets the root fade with the splash over the layout\'s inline transition-property', () => {
  const leaving = document.match(/html\[data-splash='leaving'\] \[data-app-root\] \{([^}]*)\}/);
  expect(leaving).not.toBeNull();
  const inlineNone = /style:transition-property="none"/.test(layout);
  const important = /transition-property:\s*opacity\s*!important/.test(leaving![1]);
  expect(!inlineNone || important).toBe(true);
});
