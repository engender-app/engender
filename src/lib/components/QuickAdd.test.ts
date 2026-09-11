import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const componentsCss = readFileSync(root + '/src/lib/styles/components.css', 'utf8');
const sweepCore = readFileSync(root + '/tests/yank-sweep-core.mjs', 'utf8');

describe('Quick add fan transitions and compositing contracts (ticket 105)', () => {
  it('disables CSS transition on .fan-scrim to prevent WAAPI interference', () => {
    // .scrim-withdraw declares CSS transition: opacity; override to none so Svelte WAAPI controls opacity
    expect(componentsCss).toMatch(/\.fan-scrim\s*\{[^}]*transition:\s*none;/);
  });

  it('promotes .fan-card to dedicated compositor layers with will-change', () => {
    // Prevents subpixel rasterization jitter on Chromium Android WebView during fan entrance/exit
    expect(componentsCss).toMatch(/\.fan-card\s*\{[^}]*will-change:\s*transform,\s*opacity;/);
  });

  it('targets the mobile nav fab handle data-nav-fab in yank-sweep scenes', () => {
    expect(sweepCore).toMatch(/name:\s*'sheet-quick-add'[^}]*act:\s*'\[data-rail-add\],\s*\[data-nav-fab\]'/);
    expect(sweepCore).toMatch(/name:\s*'quick-add-fan'[^}]*act:\s*'\[data-rail-add\],\s*\[data-nav-fab\]'/);
    expect(sweepCore).not.toContain('[data-nav-add]');
  });
});
