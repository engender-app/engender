import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const componentsCss = readFileSync(root + '/src/lib/styles/components.css', 'utf8');
const sweepCore = readFileSync(root + '/tests/yank-sweep-core.mjs', 'utf8');

describe('Quick add fan transitions and compositing contracts', () => {
  it('disables CSS transition on .fan-scrim to prevent WAAPI interference', () => {
    // Keep CSS transitions disabled so Svelte WAAPI controls opacity
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

describe('Quick add backdate sheet entrance', () => {
  const backdateSheet = readFileSync(root + '/src/lib/components/QuickAddBackdateSheet.svelte', 'utf8');

  it('mounts its Sheet closed and opens it in an effect, so the entrance plays', () => {
    // A Sheet created with open already true skips its local rise and scrim
    // fade: the tint arrived at opacity 0.999 in one frame over the bottom bar.
    expect(backdateSheet).toMatch(/let shown = \$state\(false\);/);
    expect(backdateSheet).toMatch(/\$effect\(\(\) => \{\s*shown = open;\s*\}\);/);
    expect(backdateSheet).toMatch(/<Sheet bind:open=\{shown\}/);
    expect(backdateSheet).not.toMatch(/<Sheet bind:open[ >]/);
  });

  it('tells the caller only after the exit has played', () => {
    // onClose fires as the exit starts; the caller unmounts on false, which
    // removed the sheet and its scrim in one frame.
    expect(backdateSheet).toContain('onClosed={() => (open = false)}');
    expect(backdateSheet).not.toContain('onClose={');
  });
});
