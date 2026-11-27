import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/* Check viewport-fit=cover and env()-backed inset tokens in source.
   Headless Chromium always reports zero safe area, and the walkthrough
   overrides the tokens to measure geometry. That test covers layout,
   while these declarations ensure phone insets reach it. */

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

describe('the shell declares its window insets', () => {
  it('asks the platform for the insets at all, with viewport-fit=cover', () => {
    const html = read('../src/app.html');
    /* Matched via the name attribute, not the whole tag: the meta is
       written across several lines, which this test missed when it
       assumed a single line - and a match that returns undefined makes
       the very next line throw, so the failure was loud, not silent. */
    const viewport = html.match(/name="viewport"\s+content="([^"]+)"/)?.[1];
    expect(viewport).toBeDefined();
    expect(viewport!.split(',').map((part) => part.trim())).toContain('viewport-fit=cover');
  });

  it('defines every one of the four inset tokens from env(), not from a constant', () => {
    const base = read('../src/lib/theme/base.css');
    for (const side of SIDES) {
      expect(base).toMatch(
        new RegExp(`--inset-${side}:\\s*env\\(safe-area-inset-${side}[^)]*\\)`)
      );
    }
  });

  it('leaves no rule reading env(safe-area-inset-*) outside that one definition', () => {
    /* A second reader is how the defect grows back: an element that reads
       env() directly cannot be told about a simulated cutout, so it drops
       out of the walkthrough's coverage silently and is only wrong on a
       phone. base.css is the one file allowed to name env(). */
    const offenders: string[] = [];
    for (const path of [
      '../src/lib/styles/app.css',
      '../src/lib/styles/components.css',
      '../src/lib/styles/screens.css'
    ]) {
      if (read(path).includes('safe-area-inset')) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });
});
