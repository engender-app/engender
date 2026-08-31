/* Surface tests for the breathing countdown ring (ticket 14, Alicja's
   review: "a nice stroke going around the circle filling up as the count
   goes down"). String-matching against the component source, the same
   shape safe-space-surfaces.test.ts uses for +page.svelte - the component
   itself has no test-tier a Svelte render can run under (no rune
   compilation under vitest.config.ts). */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = readFileSync(root + 'src/lib/components/BreathingExercise.svelte', 'utf8');
const markup = source.replace(/<script[\s\S]*?<\/script>/g, '');
// For the two "never regresses to the wrong token" checks below: strip
// comments first, since they are allowed to quote the wrong pattern while
// explaining why it was wrong.
const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '');

describe('role tokens (found while wiring the ring: --role-accent is not a token kit.css defines)', () => {
  it('never reads --role-accent - confirmed by computed style to always resolve empty, silently dropping every border/fill/stroke that read it', () => {
    expect(codeOnly).not.toMatch(/:\s*var\(--role-accent/);
  });

  it('never nests --role-hairline inside another border shorthand - it already is one ("1px solid <colour>")', () => {
    expect(codeOnly).not.toMatch(/border:\s*1px solid var\(--role-hairline\)/);
  });
});

describe('the countdown ring', () => {
  it('draws an SVG progress circle sized off phaseProgress, not the flat dot indicator alone', () => {
    expect(source).toContain("phaseProgress");
    expect(markup).toContain('<svg');
    expect(markup).toContain('class="breathing-ring-track"');
    expect(markup).toContain('class="breathing-ring-progress"');
    expect(markup).toContain('stroke-dashoffset={ringDashoffset}');
    // The dot indicator (which of the 4 phases) stays - the ring is a
    // finer per-second reading alongside it, not a replacement for it.
    expect(markup).toContain('breathing-dots');
  });

  it('resets the ring on a phase change before the fill transition starts', () => {
    expect(source).toContain('ringResetting');
    expect(source).toContain('requestAnimationFrame');
    expect(source).toContain('.phaseIndex');
  });

  it('respects prefers-reduced-motion on the ring, same as the aura and core', () => {
    const reducedMotionBlock = source.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
    expect(reducedMotionBlock).toContain('breathing-ring-progress');
  });

  it('centers the ring explicitly, since an absolutely positioned element takes no part in a flex parent\'s centering', () => {
    const ringRule = source.match(/\.breathing-ring \{[\s\S]*?\}/)?.[0] ?? '';
    expect(ringRule).toContain('top: 50%');
    expect(ringRule).toContain('left: 50%');
    expect(ringRule).toContain('translate(-50%, -50%)');
  });

  it('is bigger than it was (Alicja: "bigger, or share a row" - it grew)', () => {
    // The outer ring - the halo's own outline - is the panel's headline
    // size; it grew from 210 to 240. The aura inside it also grew, to
    // 210, which is why this checks the outer ring's own rule rather than
    // asserting no "210px" appears anywhere in the file.
    const outerRingRule = source.match(/\.breathing-outer-ring \{[\s\S]*?\}/)?.[0] ?? '';
    expect(outerRingRule).toContain('width: 240px');
  });
});
