import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const noticeFile = readFileSync(root + '/src/lib/components/kit/Notice.svelte', 'utf8');

describe('Notice component contract', () => {
  it('collapses through the panel primitive', () => {
    expect(noticeFile).toContain("from '$lib/motion/reveal'");
    expect(noticeFile).toContain('transition:collapse|global=');
    expect(noticeFile).toContain('navigating.to !== null');
  });

  /* Ticket 104: A Svelte transition is local by default and plays only when
     the block it is written in is created or destroyed. A notice is wrapped in
     its caller's `{#if}`, which is a parent block, so a local transition was
     skipped when unmounted by its caller, teleporting following rows in a
     single frame. `|global` ensures the collapse plays when its parent block
     unmounts. */
  it('tells the transition globally, since what removes a notice is its caller', () => {
    expect(noticeFile).not.toMatch(/transition:collapse=\{/);
  });
});
