/* The first frame in src/app.html (phase 14 pre-release ticket 13): that it
   says what palettes.css says, that it holds still, and that the handover
   adds the one class the CSS reads. */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { SPLASH_INK, SPLASH_BEGIN, SPLASH_END, readSplashPalettes, splashBlock, sunStops } from '../src/lib/theme/splash.ts';
import { MARK_SEAM, MARK_TILE, MARK_TILE_RADIUS } from '../src/lib/components/mark.ts';
import { holdModulePreloads } from '../src/lib/document/holdModulePreloads.ts';
import { answerSplash, releaseSplash } from '../src/lib/splash.ts';

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
  it('has no animation or keyframes, and fades by default', () => {
    expect(handwritten).not.toMatch(/@keyframes|animation/);
    expect(handwritten).toMatch(/#splash \{[^}]*transition: opacity/);
  });

  /* TEMPORARY, while Alicja picks between the two handovers (after-release
     ticket 31). The rise moves the first frame up and its ground down by
     the same amount, so the ground and the mark stay where they are and
     only the clipping edge travels. */
  it('moves nothing in the rise but the edge: the frame and its ground travel by opposite amounts', () => {
    const rules = [...handwritten.matchAll(/([^{}]+)\{([^}]*transform\s*:[^}]*)\}/g)];
    expect(rules.length).toBe(2);
    for (const [, selector] of rules) expect(selector).toContain("html[data-splash-handover='rise']");
    const frame = rules.find(([, selector]) => /#splash\.is-leaving\s*$/.test(selector.trim()))![2];
    const ground = rules.find(([, selector]) => /#splash\.is-leaving b\s*$/.test(selector.trim()))![2];
    expect(frame).toContain('transform: translateY(-100%)');
    expect(ground).toContain('transform: translateY(100%)');
    expect(handwritten).toMatch(/html\[data-splash-handover='rise'\] #splash,\s*html\[data-splash-handover='rise'\] #splash b \{\s*transition: transform/);
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
  const docOf = (splash: unknown) => ({ getElementById: () => splash }) as unknown as Document;

  it('starts leaving the moment the layout mounts, in that same call', () => {
    const splash = fakeSplash();
    releaseSplash(docOf(splash));
    expect(splash.classes.has('is-leaving')).toBe(true);
    expect(splash.classes.has('is-answered')).toBe(false);
    expect(splash.removed).toBe(false);
  });

  it('is gone 800 ms after boot answers, and not before', () => {
    vi.useFakeTimers();
    const splash = fakeSplash();
    releaseSplash(docOf(splash));
    answerSplash(docOf(splash));
    expect(splash.classes.has('is-answered')).toBe(true);
    vi.advanceTimersByTime(799);
    expect(splash.removed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(splash.removed).toBe(true);
    vi.useRealTimers();
  });

  it('answering with no release first still leaves, and a second answer does nothing', () => {
    vi.useFakeTimers();
    const splash = fakeSplash();
    answerSplash(docOf(splash));
    expect(splash.classes.has('is-leaving')).toBe(true);
    const timers = vi.getTimerCount();
    answerSplash(docOf(splash));
    expect(vi.getTimerCount()).toBe(timers);
    vi.useRealTimers();
  });

  it('does nothing when there is no first frame', () => {
    expect(() => {
      releaseSplash(docOf(null));
      answerSplash(docOf(null));
    }).not.toThrow();
  });
});
