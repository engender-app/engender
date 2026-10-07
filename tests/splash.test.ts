/* The first frame in src/app.html (phase 14 pre-release ticket 13): that it
   says what palettes.css says, that it holds still, and that the handover
   adds the one class the CSS reads. */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { SPLASH_INK, SPLASH_BEGIN, SPLASH_END, readSplashPalettes, splashBlock, sunStops } from '../src/lib/theme/splash.ts';
import { MARK_SEAM, MARK_TILE, MARK_TILE_RADIUS } from '../src/lib/components/mark.ts';
import { holdModulePreloads } from '../src/lib/document/holdModulePreloads.ts';
import { answerSplash, splashMayLeave } from '../src/lib/splash.ts';

const html = readFileSync(new URL('../src/app.html', import.meta.url), 'utf8');
const palettesCss = readFileSync(new URL('../src/lib/theme/palettes.css', import.meta.url), 'utf8');

const shipped = html.slice(html.indexOf(SPLASH_BEGIN), html.indexOf(SPLASH_END) + SPLASH_END.length);
const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
const handwritten = style.replace(shipped, '');

describe('the generated block', () => {
  it('says what palettes.css says (run npm run render:splash if this fails)', () => {
    expect(shipped).toBe(splashBlock(readSplashPalettes(palettesCss)));
  });

  it('covers every palette in both themes', () => {
    const declared = [...palettesCss.matchAll(/\[data-palette="([a-z]+)"\]\s*\{\s*--motif-stripes/g)].map((m) => m[1]);
    const palettes = readSplashPalettes(palettesCss);
    expect(palettes.map((p) => p.name)).toEqual(declared);
    for (const name of declared) {
      expect(shipped).toContain(`[data-palette=${name}][data-theme=light]{--splash-ground:`);
      expect(shipped).toContain(`[data-palette=${name}][data-theme=dark]{--splash-ground:`);
    }
  });

  it('draws one ring and one seam per stripe, innermost first, ending on the outer edge and the white tile beyond it', () => {
    const stops = sunStops(['#111111', '#222222', '#333333']);
    expect(stops).toBe(
      '#333333 0% 30.33%,#000 30.33% 33.33%,#222222 33.33% 63.67%,#000 63.67% 66.67%,#111111 66.67% 97%,#000 97% 100%,#FFFFFF 100%'
    );
  });
});

describe("the first frame is the mark's own numbers", () => {
  const markSource = readFileSync(new URL('../src/lib/components/mark.ts', import.meta.url), 'utf8');

  it('draws the edge as mark.ts does: inset half a seam, a seam wide, in the same ink', () => {
    const inset = MARK_SEAM / 2;
    const rect = html.match(/<div id="splash"[\s\S]*?<rect ([^>]*)\/>/)![1];
    expect(rect).toContain(`x="${inset}" y="${inset}" width="${100 - MARK_SEAM}" height="${100 - MARK_SEAM}"`);
    expect(rect).toContain(`rx="${MARK_TILE_RADIUS - inset}"`);
    expect(rect).toContain(`stroke-width="${MARK_SEAM}"`);
    expect(markSource).toContain(`stroke="${SPLASH_INK}"`);
  });

  it('takes the tile colour and radius from the generated block, not from literals', () => {
    expect(shipped).toContain(`--splash-tile:${MARK_TILE};--splash-ink:${SPLASH_INK};--splash-radius:${MARK_TILE_RADIUS}%`);
    expect(handwritten).not.toMatch(/#fff\b|#000\b/i);
  });
});

describe('the first frame holds still', () => {
  /* Alicja's pick in after-release ticket 31: the fade, on the soft
     ease-out base.css gives the blind, over the rising edge. */
  it('has no animation, keyframes, transform or second handover: it only fades, on --ease-out-soft', () => {
    expect(handwritten).not.toMatch(/@keyframes|animation|transform\s*:|data-splash-handover/);
    expect(handwritten).toMatch(/#splash \{[^}]*transition: opacity 280ms var\(--ease-out-soft,/);
  });

  /* The fallback is for the frames before base.css has loaded, so it has
     to be the token's own value or the curve changes mid-fade. */
  it("falls back to --ease-out-soft's own value", () => {
    const baseCss = readFileSync(new URL('../src/lib/theme/base.css', import.meta.url), 'utf8');
    const token = baseCss.match(/--ease-out-soft:\s*([^;]+);/)![1].trim();
    expect(handwritten).toContain(`var(--ease-out-soft, ${token})`);
  });

  it('draws no mark under disguise', () => {
    expect(handwritten).toContain('html[data-disguised] #splash i { display: none; }');
  });

  it('is inert, so nothing under it can be blocked', () => {
    expect(handwritten).toMatch(/#splash \{[^}]*pointer-events: none/);
  });
});

describe('the held module hints', () => {
  it('turns modulepreload inert and leaves every other link alone', () => {
    const before = '<link href="/a.js" rel="modulepreload">\n<link href="/a.css" rel="stylesheet">\n<link rel="preload" href="/f.woff2" as="font">';
    expect(holdModulePreloads(before)).toBe(
      '<link href="/a.js" rel="x-modulepreload">\n<link href="/a.css" rel="stylesheet">\n<link rel="preload" href="/f.woff2" as="font">'
    );
  });

  it('is released by the pre-paint script in app.html, by the same name', () => {
    expect(html).toContain('link[rel="x-modulepreload"]');
  });
});

describe('the handover', () => {
  function fakeSplash() {
    const classes = new Set<string>();
    return {
      classes,
      removed: false,
      classList: {
        add: (...names: string[]) => names.forEach((name) => classes.add(name)),
        contains: (name: string) => classes.has(name)
      },
      remove() {
        this.removed = true;
      }
    };
  }
  const docOf = (splash: unknown) => {
    const documentElement = { dataset: { splash: '' } as Record<string, string> };
    return { getElementById: () => splash, documentElement } as unknown as Document;
  };

  /* After-release ticket 31. It used to start leaving when the layout
     mounted, while boot was still working. On a first visit boot then
     answered "set up", the layout unmounted Home and drew nothing while it
     navigated to onboarding, so the first frame faded onto an empty ground
     and onboarding appeared whole in one frame 0.5 s later. */
  it('waits for boot to answer, and for the screen it answered with to be the one on show', () => {
    expect(splashMayLeave('booting', false)).toBe(false);
    expect(splashMayLeave('needs-setup', true)).toBe(false);
    expect(splashMayLeave('needs-setup', false)).toBe(true);
    expect(splashMayLeave('ready', false)).toBe(true);
    expect(splashMayLeave('error', false)).toBe(true);
  });

  /* Alicja, on the flipbooks: "splash with crossfade". The screen waits at
     opacity 0 under the first frame (html[data-splash]) and fades in while
     the first frame fades out, so nothing of the app sits at full opacity
     under a half-transparent mark. */
  it('crossfades: the answer starts the screen fading in with the first frame fading out, and both end together', () => {
    vi.useFakeTimers();
    const splash = fakeSplash();
    const doc = docOf(splash);
    answerSplash(doc);
    expect(splash.classes.has('is-leaving')).toBe(true);
    expect(splash.classes.has('is-answered')).toBe(true);
    expect(doc.documentElement.dataset.splash).toBe('leaving');
    vi.advanceTimersByTime(799);
    expect(splash.removed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(splash.removed).toBe(true);
    expect('splash' in doc.documentElement.dataset).toBe(false);
    vi.useRealTimers();
  });

  it('holds the screen at opacity 0 under the first frame and fades it in on the same curve and length', () => {
    expect(html).toMatch(/<html [^>]*data-splash[ >]/);
    expect(handwritten).toMatch(/html\[data-splash\] \[data-app-root\] \{\s*opacity: 0;\s*\}/);
    expect(handwritten).toMatch(
      /html\[data-splash='leaving'\] \[data-app-root\] \{\s*opacity: 1;\s*transition: opacity 280ms var\(--ease-out-soft, [^)]+\)\);\s*\}/
    );
  });

  it('a second answer does nothing', () => {
    vi.useFakeTimers();
    const splash = fakeSplash();
    answerSplash(docOf(splash));
    expect(splash.classes.has('is-leaving')).toBe(true);
    const timers = vi.getTimerCount();
    answerSplash(docOf(splash));
    expect(vi.getTimerCount()).toBe(timers);
    vi.useRealTimers();
  });

  it('with no first frame, lets the screen show at once rather than holding it at 0', () => {
    const doc = docOf(null);
    expect(() => answerSplash(doc)).not.toThrow();
    expect('splash' in doc.documentElement.dataset).toBe(false);
  });
});
