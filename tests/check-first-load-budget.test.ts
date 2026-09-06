/* The first-load ratchet (phase 9 audit ticket 01): a first visit's shipped
   bytes and file count, watched the same way every other cost in the repo
   is - measured, budgeted, and failing loud rather than waiting for an
   audit to notice they grew. */
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { budgetFailures, firstLoadBudgetFor, firstLoadUrls, gzipTotal } from '../scripts/check-first-load-budget.mjs';

describe('firstLoadUrls', () => {
  it('reads a modulepreload href and a bootstrap script\'s import(...) call', () => {
    // The two entry chunks (SvelteKit's kit and app modules) never get a
    // modulepreload link of their own - only the inline bootstrap script's
    // own import("...") names them.
    const html = `
      <link href="/_app/immutable/chunks/DPZW1atx.js" rel="modulepreload">
      <script>Promise.all([import("/_app/immutable/entry/start.CMqcOQj5.js"), import("/_app/immutable/entry/app.abc123.js")])</script>
    `;
    expect(firstLoadUrls(html)).toEqual(
      [
        '/_app/immutable/chunks/DPZW1atx.js',
        '/_app/immutable/entry/app.abc123.js',
        '/_app/immutable/entry/start.CMqcOQj5.js'
      ].sort()
    );
  });

  it('de-duplicates a URL named twice', () => {
    const html = `
      <link href="/_app/immutable/chunks/DPZW1atx.js" rel="modulepreload">
      <link href="/_app/immutable/chunks/DPZW1atx.js" rel="modulepreload">
    `;
    expect(firstLoadUrls(html)).toEqual(['/_app/immutable/chunks/DPZW1atx.js']);
  });

  it('ignores a URL outside /_app/immutable/', () => {
    const html = `<link href="/manifest.webmanifest" rel="manifest">`;
    expect(firstLoadUrls(html)).toEqual([]);
  });
});

describe('gzipTotal', () => {
  it('sums the gzipped size of every buffer', () => {
    const a = Buffer.from('a'.repeat(1000));
    const b = Buffer.from('b'.repeat(1000));
    expect(gzipTotal([a, b])).toBe(gzipSync(a).length + gzipSync(b).length);
  });

  it('is zero for no buffers', () => {
    expect(gzipTotal([])).toBe(0);
  });
});

describe('firstLoadBudgetFor', () => {
  it('carries the file count through with no headroom', () => {
    expect(firstLoadBudgetFor({ files: 111, gzipBytes: 295873 }).filesBudget).toBe(111);
  });

  it('adds a fixed byte floor over the baseline, to absorb build-to-build hash wobble', () => {
    expect(firstLoadBudgetFor({ files: 111, gzipBytes: 295873 }).gzipBytesBudget).toBe(295873 + 1024);
  });
});

describe('budgetFailures', () => {
  const budget = { filesBudget: 111, gzipBytesBudget: 295873 };

  it('passes at exactly the budget', () => {
    expect(budgetFailures({ files: 111, gzipBytes: 295873 }, budget)).toEqual([]);
  });

  it('passes under the budget', () => {
    expect(budgetFailures({ files: 100, gzipBytes: 200000 }, budget)).toEqual([]);
  });

  it('fails over the byte budget', () => {
    const failures = budgetFailures({ files: 111, gzipBytes: 400000 }, budget);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/gzip total is 400000B/);
  });

  it('fails over the file budget', () => {
    const failures = budgetFailures({ files: 130, gzipBytes: 295873 }, budget);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/file count is 130/);
  });

  it('reports both a byte and a file breach at once', () => {
    expect(budgetFailures({ files: 130, gzipBytes: 400000 }, budget)).toHaveLength(2);
  });
});
