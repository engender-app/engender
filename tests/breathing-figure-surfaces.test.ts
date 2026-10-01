/* Surface tests for the breathing exercise's tide (phase 12 breathing
   ticket 01). String-matching against the component source, the same shape
   safe-space-surfaces.test.ts uses for +page.svelte - the component itself
   has no test tier a Svelte render can run under (no rune compilation
   under vitest.config.ts). The motion is held where it lives: the curve in
   breathClock.test.ts, the frames in tests/breathing-frames.mjs. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = readFileSync(root + 'src/lib/components/BreathingExercise.svelte', 'utf8');
const script = source.match(/<script[\s\S]*?<\/script>/)?.[0] ?? '';
const markup = source.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
const style = source.match(/<style[\s\S]*?<\/style>/)?.[0] ?? '';
// Comments may quote the wrong pattern while explaining why it was wrong.
const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

describe('role tokens (found while wiring the old ring: --role-accent is not a token kit.css defines)', () => {
  it('never reads --role-accent, which always resolves empty', () => {
    expect(codeOnly).not.toMatch(/:\s*var\(--role-accent/);
  });

  it('never nests --role-hairline inside another border shorthand - it already is one', () => {
    expect(codeOnly).not.toMatch(/border:\s*1px solid var\(--role-hairline\)/);
  });
});

describe('one clock', () => {
  it('paints off readBreath on animation frames, with no interval anywhere', () => {
    expect(script).toContain('readBreath(clockElapsed(clock, now)');
    expect(script).toContain('requestAnimationFrame(frame)');
    expect(codeOnly).not.toMatch(/setInterval|setTimeout/);
  });

  it('writes the resting pose into the markup, so the first paint is not a frame of defaults', () => {
    expect(markup).toContain('style="--breath:0; --surface-y:{restReduced ? STILL : LOW}px; --lap-x:{C}px; --lap-y:{C - TRACK}px"');
  });

  it('stops the loop when it leaves the screen', () => {
    expect(script).toMatch(/onDestroy\(\(\) => cancelAnimationFrame\(raf\)\)/);
  });
});

describe('the tide', () => {
  /* Alicja's first look at the prototype: "those weird handles on the right
     and below". Each tick was rotated with an SVG rotate(angle cx cy)
     attribute while a blanket CSS transform-origin also put the pivot at the
     centre, so the pivot was applied twice and three of the four ticks
     landed off the ring - one beside it, one under the button, one on the
     list below. Placed by coordinates now, with no transform to compound. */
  it('places the quarter ticks by coordinates, never by a transform', () => {
    const ticks = markup.match(/<line class="breathing-tick"[^>]*>/g) ?? [];
    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) expect(tick).not.toMatch(/transform/);
    expect(style).not.toMatch(/transform-origin/);
  });

  it('moves the water by transform rather than by its height', () => {
    expect(style).toMatch(/\.breathing-water \{[^}]*transform: translateY\(var\(--surface-y\)\)/);
    expect(codeOnly).not.toMatch(/setAttribute\('height'/);
  });

  it('draws the word a second time in the fill ink, clipped to the same water', () => {
    expect(markup).toMatch(/<g clip-path="url\(#\{uid\}-water\)">[\s\S]*?class="breathing-word on-fill"/);
    expect(style).toMatch(/\.breathing-word\.on-fill \{[^}]*fill: var\(--role-fill-ink\)/);
  });

  it('fades the word on a JS tick, which base.css cannot clamp to a cut under reduced motion', () => {
    expect(script).toMatch(/tick: \(t: number\) =>/);
    expect(script).not.toMatch(/from 'svelte\/transition'/);
  });

  it('under reduced motion fades the water instead of moving it', () => {
    expect(style).toMatch(/\.breathing-figure\.is-reduced \.breathing-water \{[^}]*fill-opacity: calc\(/);
    expect(script).toMatch(/reduced \? STILL :/);
  });

  it('announces the phase word only once started, and keeps the walkthrough handles', () => {
    expect(markup).toMatch(/aria-live="polite">\s*\{#if started\}/);
    expect(markup).toContain('data-breathing-phase={phase}');
    expect(markup).toContain('data-breathing-toggle');
    expect(markup).toContain('data-breathing-exercise');
  });
});
