import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const tileFile = readFileSync(root + '/src/lib/components/kit/Tile.svelte', 'utf8');

describe('Tile component contract', () => {
  it('exports TileAction type and supports action prop', () => {
    expect(tileFile).toContain('export type TileAction =');
    expect(tileFile).toContain('action?: TileAction');
  });

  it('renders split container with nested controls when action is present', () => {
    expect(tileFile).toContain('{#if action}');
    expect(tileFile).toContain('<div class="kit-tile is-split" data-tile={key}');
    expect(tileFile).toContain('<a class="kit-tile-main press" {href}>');
    expect(tileFile).toContain('kit-tile-act press');
    expect(tileFile).toContain('<button');
  });

  it('stamps its weight on every branch, which is what the row rules select on', () => {
    // Phase 8 UX ticket 01: a card or a row, decided by the caller and drawn
    // by kit.css. Three branches, so three places it could be forgotten.
    expect((tileFile.match(/data-weight=\{weight\}/g) ?? []).length).toBe(3);
    expect(tileFile).toContain("weight = 'card'");
  });

  it('renders single press anchor when action is absent', () => {
    expect(tileFile).toContain('<a class="kit-tile press" data-tile={key} data-weight={weight} {href}');
  });

  /* Phase 9 carpet ticket 04: a tile joins and leaves its grid through the
     one panel primitive, on every branch - a tile that forgot it would be
     the one that snapped, and the branch a tile takes is decided by which
     controls its caller passed rather than by anything about the motion. */
  it('collapses through the panel primitive on all three branches', () => {
    expect((tileFile.match(/transition:collapse\|global=\{panel\}/g) ?? []).length).toBe(3);
    expect(tileFile).toContain("from '$lib/motion/reveal'");
    // The `skip` that stops a screen folding its own tiles up as it leaves.
    expect(tileFile).toContain('navigating.to !== null');
  });

  /* `|global` is not decoration. A transition is local by default and plays
     only when its own block is created or destroyed; a tile is created and
     destroyed by the caller's `{#each}`, which is a parent block, so the
     local rule skipped it in silence - no inline style, no frames, a tile
     that vanished. Held here because the mark is one character and its
     absence fails nothing else. */
  it('tells the transition globally, since what removes a tile is its caller', () => {
    expect(tileFile).not.toMatch(/transition:collapse=\{/);
  });
});
