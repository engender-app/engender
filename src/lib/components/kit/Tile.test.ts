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

  it('renders single press anchor when action is absent', () => {
    expect(tileFile).toContain('<a class="kit-tile press" data-tile={key} {href} {...rest}>');
  });
});
