/* Cross-block spacing, opted into by attribute rather than by a list of
   surface class names (phase 5 ticket 41, ADR-0038).

   The same bug role-attrs.test.ts guards for colour, one axis over: a
   surface that exists but never gets added to a hand-maintained selector
   somewhere else. For colour the symptom was that nothing drew; here it is
   that the gap above a block silently reverts to the browser's default
   collapse. `.kit-strip` was already living that bug when this ticket
   started - it sat in the two-surface list but not the one below a control,
   so a week strip under a segmented control had no gap at all.

   The lead side of the rule stays a class list on purpose. Those are
   screen-level presentational names with no owning component root
   (`.tag-row` alone is 14 ad-hoc call sites across 7 files), and a class
   opts every instance in for free - an attribute there would be one more
   thing to remember per call site, not one less. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/* Each kit surface and the component that owns its root markup. Every one of
   these appeared by class name in at least one of the spacing selectors this
   ticket replaced. */
const SURFACES: Array<[string, string]> = [
  ['kit-chart', 'src/lib/components/kit/ChartCard.svelte'],
  ['kit-list', 'src/lib/components/kit/ListCard.svelte'],
  ['kit-tiles', 'src/lib/components/kit/TileGrid.svelte'],
  ['kit-notice', 'src/lib/components/kit/Notice.svelte'],
  ['kit-strip', 'src/lib/components/kit/BareStrip.svelte'],
  ['kit-day', 'src/lib/components/kit/DayCard.svelte'],
  ['kit-moods', 'src/lib/components/kit/MoodChips.svelte'],
  ['wrapped-figure-list', 'src/lib/components/WrappedCompact.svelte'],
];

describe('every kit surface stamps data-kit-surface on its own root', () => {
  for (const [cls, file] of SURFACES) {
    it(`${cls} (${file.split('/').pop()})`, () => {
      const src = readFileSync(file, 'utf8');
      const root = new RegExp(`<[a-z]+[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`).exec(src);
      expect(root, `${file} should render an element with class ${cls}`).not.toBeNull();
      expect(root![0], `${cls}'s root should carry data-kit-surface`).toContain('data-kit-surface');
    });
  }
});

describe("kit.css's cross-block spacing", () => {
  const kit = readFileSync('src/lib/styles/kit.css', 'utf8');

  it('gives two adjacent surfaces their gap by attribute, naming no surface class', () => {
    // The regression: a ninth surface added to one list and forgotten in the
    // other, which is exactly how .kit-strip ended up with no gap under a
    // control while having one under another card.
    expect(kit).toMatch(/\[data-kit-surface\]\s*\+\s*\[data-kit-surface\]\s*\{[^}]*margin-top/);
  });

  it('gives a surface under a control its gap by attribute too', () => {
    expect(kit).toMatch(/\+\s*:is\(\[data-kit-surface\], \.skeleton-stack\)\s*\{[^}]*margin-top/);
  });

  it('no longer enumerates the full surface set anywhere', () => {
    // The two rules this ticket replaced each carried the whole set by name,
    // in three places between them. What's left in kit.css is one rule going
    // the other way (a chip row or photo strip *under* a surface), and its
    // list is a deliberate subset - kit-tiles, kit-notice, kit-strip and
    // kit-moods are absent because nothing puts a tag row under them.
    // Swapping that one to [data-kit-surface] would hand those four a gap
    // they don't have today, so it stays a list and stays out of scope.
    const fullSet = /\.kit-chart,\s*\.kit-list,\s*\.kit-tiles,\s*\.kit-notice/;
    expect(kit).not.toMatch(fullSet);
  });
});

describe('.skeleton-stack is a lead but deliberately not a surface', () => {
  const skeleton = readFileSync('src/lib/components/Skeleton.svelte', 'utf8');

  it('does not carry data-kit-surface', () => {
    // It stands where a surface will be, so it takes a surface's gap *below*
    // a control - but a surface followed by a skeleton keeps skeleton's own
    // --space-5 rule. Stamping it as a surface would hand that pair to the
    // two-surface rule instead (--space-6), which is a different number.
    expect(skeleton).not.toContain('data-kit-surface');
  });
});
