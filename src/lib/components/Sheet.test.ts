import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const sheetFile = readFileSync(root + '/src/lib/components/Sheet.svelte', 'utf8');

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
    expect(sheetFile).toContain('target.focus({ preventScroll: true })');
  });

  it('intercepts tab navigation before introend settles', () => {
    expect(sheetFile).toContain('!sheetEl.contains(document.activeElement)');
  });
});
