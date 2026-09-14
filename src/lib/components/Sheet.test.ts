import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const sheetFile = readFileSync(root + '/src/lib/components/Sheet.svelte', 'utf8');
/* The background lock and the focus trap moved here on redesign ticket 45,
   when the letter arrival became the second surface that covers the whole
   shell. The guarantees below are unchanged and still Sheet's, so they are
   asserted against whichever file now carries each line rather than
   loosened - a rule tested in one file holds nowhere else. */
const overlayLockFile = readFileSync(root + '/src/lib/components/overlayLock.ts', 'utf8');

describe('Sheet initial focus contract', () => {
  it('does not invoke focus synchronously upon attachment', () => {
    // Synchronous focus upon attachment flushes layout before CSS transition keyframes attach on Android WebView,
    // causing a 434-607px entrance teleport (ticket 115).
    expect(sheetFile).not.toMatch(/function focusInitial\(node[^{]*\{\s*sheetEl = node;\s*const field[^;]*;\s*\(field \?\? node\)\.focus\(\);/);
  });

  it('defers focus to introend', () => {
    expect(sheetFile).toContain("node.addEventListener('introend'");
  });

  it('passes preventScroll: true on initial focus and tab trap invocations', () => {
    expect(sheetFile).toContain('(field ?? node).focus({ preventScroll: true })');
    expect(overlayLockFile).toContain('target.focus({ preventScroll: true })');
  });

  it('intercepts tab navigation before introend settles', () => {
    expect(overlayLockFile).toContain('!container.contains(document.activeElement)');
  });

  it('still reaches the lock and the trap from the sheet itself', () => {
    // The two above are only Sheet's guarantees while Sheet is still wired
    // to the module that carries them.
    expect(sheetFile).toContain("from './overlayLock'");
    expect(sheetFile).toContain('lockBackground');
    expect(sheetFile).toContain('trapFocus(sheetEl, e)');
  });
});

describe('Sheet backdrop scrim contract', () => {
  it('uses dedicated scrimFade transition without unconstrained dynamic fade', () => {
    expect(sheetFile).toContain('transition:scrimFade');
    expect(sheetFile).not.toMatch(/transition:fade/);
  });

  it('disables CSS transitions on sheet-scrim-tint to prevent WAAPI conflict', () => {
    expect(sheetFile).toMatch(/\.sheet-scrim-tint\s*\{[^}]*transition:\s*none;/);
  });
});
