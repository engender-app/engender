import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/* The two halves of the shell's safe-area work that no browser test can
   reach (phase 5 ticket 18).

   The walkthrough covers the behaviour - where content starts, where the
   bar ends - by setting the --inset-* tokens itself and measuring what
   moved. That is the stronger check, and it is deliberately where the
   layout assertions live. But it is blind to exactly two things, and both
   of them are the difference between working on a desktop and working on a
   phone:

   `viewport-fit=cover` cannot be observed in a headless desktop Chromium
   at all. Every safe-area inset there is 0 whether or not it is declared,
   so a browser test passes identically with the declaration deleted, while
   on a device its absence puts every inset back to 0 and reinstates the
   whole defect.

   And because the walkthrough sets the tokens directly, it would pass just
   as happily if they were wired to nothing - a --inset-top defined as 0px
   with no env() behind it satisfies every geometric assertion in that
   suite and reports zero inset on the one device that has one.

   So this file asserts the two declarations, and only those. Everything
   about the resulting layout is checked by measuring it instead.

   So these two are greps because the browser they would run in cannot see
   the thing (ticket 08), not because a rule was left in markup. */

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

describe('the shell declares its window insets', () => {
  it('asks the platform for the insets at all, with viewport-fit=cover', () => {
    const html = read('../src/app.html');
    const viewport = html.match(/<meta name="viewport" content="([^"]+)"/)?.[1];
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
