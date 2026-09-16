import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';
import type { TransitionConfig } from 'svelte/transition';

import { containerReceive, containerSend, fadeThrough, scrimFade, sharedAxisX, sheetRise } from './navigation';
import { EASE_OUT } from './tokens';

/* The node tier has no DOM, and these read their durations and distances
   out of the token layer through $lib/motion/tokens. A stub document is
   enough for both: tokens.ts asks getComputedStyle for the number and
   documentElement.dataset for the reduced-motion signal. */
function stubDocument(vars: Record<string, string>, reduced = false) {
  const g = globalThis as Record<string, unknown>;
  g.document = { documentElement: { dataset: reduced ? { a11yMotion: 'reduce' } : {} } };
  g.getComputedStyle = () => ({ getPropertyValue: (name: string) => vars[name] ?? '' });
}

const TOKENS = {
  '--dur-fast': '150ms',
  '--dur-med': '240ms',
  '--dur-slow': '380ms',
  '--dur-crossfade': '120ms',
  '--motion-distance-md': '24px'
};

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.document;
  delete g.getComputedStyle;
});

const node = {} as Element;
/** The transform a primitive asks for at a point in its timeline. */
function frame(css: (t: number, u: number) => string, t: number) {
  return css(t, 1 - t);
}

describe('fade-through, between the four tabs', () => {
  it('brings the incoming screen in from 1.03 and lands it at rest', () => {
    stubDocument(TOKENS);
    const { css, duration } = fadeThrough(node, {}, { direction: 'in' });
    expect(duration).toBe(240);
    expect(frame(css!, 0)).toMatch(/scale\(1\.03\)/);
    expect(frame(css!, 0)).toMatch(/opacity: 0\b/);
    expect(frame(css!, 1)).toMatch(/scale\(1\)/);
    expect(frame(css!, 1)).toMatch(/opacity: 1\b/);
  });

  it('settles the outgoing screen to 0.97 rather than shrinking it the same way', () => {
    stubDocument(TOKENS);
    const { css } = fadeThrough(node, {}, { direction: 'out' });
    expect(frame(css!, 1)).toMatch(/scale\(1\)/);
    expect(frame(css!, 0)).toMatch(/scale\(0\.97\)/);
  });

  /* Material's fade-through is asymmetric on purpose. An exit that takes as
     long as an entrance reads as the app hesitating before it answers. */
  it('leaves faster than it arrives', () => {
    stubDocument(TOKENS);
    expect(fadeThrough(node, {}, { direction: 'out' }).duration).toBe(150);
    expect(fadeThrough(node, {}, { direction: 'in' }).duration).toBe(240);
    expect(sharedAxisX(node, {}, { direction: 'out' }).duration).toBe(150);
    expect(sharedAxisX(node, {}, { direction: 'in' }).duration).toBe(240);
  });

  it('crossfades with no transform at all under reduced motion', () => {
    stubDocument(TOKENS, true);
    const { css, duration } = fadeThrough(node, {}, { direction: 'in' });
    expect(duration, 'a crossfade needs a duration the 1ms clamp cannot reach').toBe(120);
    expect(frame(css!, 0.5)).not.toContain('transform');
    expect(frame(css!, 0.5)).toMatch(/opacity: 0\.5/);
  });
});

describe('shared-axis-X, into a detail from a list', () => {
  it('enters from the far side and leaves toward the near one', () => {
    stubDocument(TOKENS);
    expect(frame(sharedAxisX(node, {}, { direction: 'in' }).css!, 0)).toMatch(/translateX\(24px\)/);
    expect(frame(sharedAxisX(node, {}, { direction: 'in' }).css!, 1)).toMatch(/translateX\(0px\)/);
    expect(frame(sharedAxisX(node, {}, { direction: 'out' }).css!, 0)).toMatch(/translateX\(-24px\)/);
  });

  it('reverses the axis on the way back', () => {
    stubDocument(TOKENS);
    expect(frame(sharedAxisX(node, { back: true }, { direction: 'in' }).css!, 0)).toMatch(/translateX\(-24px\)/);
    expect(frame(sharedAxisX(node, { back: true }, { direction: 'out' }).css!, 0)).toMatch(/translateX\(24px\)/);
  });

  it('crossfades with no transform at all under reduced motion', () => {
    stubDocument(TOKENS, true);
    const { css, duration } = sharedAxisX(node, {}, { direction: 'in' });
    expect(duration).toBe(120);
    expect(frame(css!, 0.5)).not.toContain('transform');
  });
});

describe('sheet rise', () => {
  /* A sheet's travel is its own, so the stub is a box plus the scrim it sits
     in - the frame the app's sheets are fixed to, which is what "the window's
     bottom edge" means when the app is a phone frame inside a page. Numbers
     read like the real thing: a phone-sized frame with a sheet standing on
     its floor, which is every sheet in the app at 390px wide. */
  function sheetNode(top: number, bottom: number, frameBottom = 800) {
    return {
      getBoundingClientRect: () => ({ top, bottom, height: bottom - top }),
      closest: () => ({ getBoundingClientRect: () => ({ bottom: frameBottom }) })
    } as unknown as Element;
  }

  it('travels its own height, not a token', () => {
    stubDocument(TOKENS);
    const { css } = sheetRise(sheetNode(300, 800));
    expect(frame(css!, 0)).toMatch(/translateY\(500px\)/);
    expect(frame(css!, 1)).toMatch(/translateY\(0px\)/);
  });

  /* Ticket 38: a 24px nudge under an opacity fade is a crossfade, which is
     how Alicja read it on ticket 35's flipbooks. ADR-0078: a block never
     fades up from nothing. The scrim is what announces the sheet. */
  it('does not fade - a solid object slides', () => {
    stubDocument(TOKENS);
    const { css } = sheetRise(sheetNode(300, 800));
    expect(frame(css!, 0)).not.toContain('opacity');
    expect(frame(css!, 0.5)).not.toContain('opacity');
  });

  /* Centred on a wide window, so the sheet's own height would leave its top
     edge on screen. It goes past the frame's bottom edge instead. */
  it('goes past the bottom edge when it is not sitting on it', () => {
    stubDocument(TOKENS);
    expect(frame(sheetRise(sheetNode(200, 600)).css!, 0)).toMatch(/translateY\(600px\)/);
  });

  /* Sheet.svelte's own comment: letting go past the threshold leaves the
     sheet where the finger left it while the exit carries it the rest of the
     way. The rect is read live, so a sheet dragged 200px down measures from
     where it was left and carries on from there. */
  it('carries a dragged sheet on from where the finger left it', () => {
    stubDocument(TOKENS);
    expect(frame(sheetRise(sheetNode(500, 1000)).css!, 0)).toMatch(/translateY\(500px\)/);
  });

  /* `.sheet-drag` caps at 85% of the scrim and `.sheet` scrolls inside that,
     so the tall case is a shorter box, not a longer travel. Held here so the
     cap failing shows up as a sheet that cannot clear the edge. */
  it('clears the edge for a sheet capped at the frame height', () => {
    stubDocument(TOKENS);
    expect(frame(sheetRise(sheetNode(120, 800)).css!, 0)).toMatch(/translateY\(680px\)/);
  });

  /* The field's own settle (ticket 28), which is what Alicja asked a sheet to
     take: coming up it runs past its mark and comes back. Svelte reads an
     entrance as t = easing(p) and the geometry below uses u = 1 - t, so an
     easing that passes 1 is the sheet passing its resting place. */
  it('runs past its mark coming up, and lands on it', () => {
    stubDocument(TOKENS);
    const { easing } = sheetRise(sheetNode(300, 800), {}, { direction: 'in' });
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => easing!(i / 100)));
    /* 6% of 500px is 30px, capped at 8, which is 1.6% of the travel. */
    expect(peak).toBeGreaterThan(1);
    expect((peak - 1) * 500).toBeCloseTo(8, 0);
    expect(easing!(1)).toBe(1);
  });

  it('does not run past anything going down', () => {
    stubDocument(TOKENS);
    const { easing } = sheetRise(sheetNode(300, 800), {}, { direction: 'out' });
    for (let i = 0; i <= 100; i++) expect(easing!(i / 100)).toBeLessThanOrEqual(1);
  });

  /* The yank between frames 1 and 2, measured. An exit is t = 1 - easing(p),
     so the displacement follows the curve forwards and --ease-out - which
     leaves at four times its average speed - spends a fifth of the travel
     before the second frame is painted. --ease-out-soft is the same
     deceleration with the instant off the front, and it is the one the
     blind's close already takes for this exact reason. */
  it('leaves gently rather than at its steepest', () => {
    stubDocument(TOKENS);
    const { duration, easing } = sheetRise(sheetNode(300, 800), {}, { direction: 'out' });
    const oneFrame = 16 / duration!;
    expect(easing!(oneFrame), 'the first frame of the exit').toBeLessThan(0.06);
    expect(EASE_OUT(oneFrame), 'what --ease-out would have done').toBeGreaterThan(0.15);
  });

  it('runs both ways on --dur-slow', () => {
    stubDocument(TOKENS);
    for (const direction of ['in', 'out'] as const) {
      expect(sheetRise(sheetNode(300, 800), {}, { direction }).duration).toBe(380);
    }
  });

  it('crossfades with no transform at all under reduced motion', () => {
    stubDocument(TOKENS, true);
    const { css, duration } = sheetRise(sheetNode(300, 800), {}, { direction: 'in' });
    expect(duration).toBe(120);
    expect(frame(css!, 0.5)).not.toContain('transform');
    expect(frame(css!, 0.5)).toMatch(/opacity: 0\.5/);
  });
});

describe('scrim fade', () => {
  it('runs on --dur-slow with EASE_OUT', () => {
    stubDocument(TOKENS);
    const { duration, easing, css } = scrimFade(node);
    expect(duration).toBe(380);
    expect(easing).toBe(EASE_OUT);
    expect(frame(css!, 0)).toBe('opacity: 0');
    expect(frame(css!, 1)).toBe('opacity: 1');
  });

  it('crossfades under reduced motion', () => {
    stubDocument(TOKENS, true);
    const { duration, css } = scrimFade(node);
    expect(duration).toBe(120);
    expect(frame(css!, 0.5)).toBe('opacity: 0.5');
  });
});

describe('container transform, into the entry editor', () => {
  /* The pair is svelte/transition's crossfade, which does the FLIP between
     the two elements. What is worth asserting here is the substitution the
     reduced-motion contract asks for: no FLIP at all, because a FLIP is
     nothing but movement. */
  it('drops the FLIP for a plain crossfade under reduced motion', () => {
    stubDocument(TOKENS, true);
    for (const half of [containerSend, containerReceive]) {
      const config = half(node, { key: 'entry-1' });
      expect(typeof config, 'the reduced substitute is a plain config, not a deferred pair').not.toBe('function');
      const plain = config as TransitionConfig;
      expect(plain.duration).toBe(120);
      expect(frame(plain.css!, 0.5)).not.toContain('transform');
    }
  });

  /* svelte/transition's crossfade defers: send and receive hand back a
     thunk that runs once the counterpart has registered, which is what
     lets it measure both boxes. Reaching further than "it deferred" means
     laying out two real elements, which is the browser tier's job. */
  it('hands off to the real crossfade when motion is allowed', () => {
    stubDocument(TOKENS);
    expect(typeof containerSend(node, { key: 'entry-1' })).toBe('function');
    expect(typeof containerReceive(node, { key: 'entry-1' })).toBe('function');
  });

  /* The only tier-2 pattern that carries a box across the screen and
     resizes it on the way, so it gets the longest of the three durations
     rather than the same one a fade uses. Asserted against the source
     rather than the running transition: the pair defers until both boxes
     exist, so nothing here can observe the duration it was built with. A
     grep is a weak test, but the alternative is asserting the stub back to
     itself, which would pass whatever the module does. */
  it('is configured with the longest tier-2 duration, not the shared one', () => {
    const source = readFileSync(new URL('./navigation.ts', import.meta.url), 'utf8');
    const configured = /crossfade\(\{[\s\S]*?duration:\s*\(\)\s*=>\s*motionDuration\('(--dur-[a-z]+)'/.exec(source);
    expect(configured?.[1], 'the crossfade should not share --dur-med with the fade').toBe('--dur-slow');
  });
});
