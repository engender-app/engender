/* The first frame in src/app.html (phase 14 pre-release ticket 13): that it
   says what palettes.css says, that it holds still, and that the handover
   adds the one class the CSS reads. */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { SPLASH_BEGIN, SPLASH_END, holdModulePreloads, readSplashPalettes, splashBlock, sunStops } from '../src/lib/theme/splash.ts';
import { dismissSplash } from '../src/lib/splash.ts';

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

describe('the first frame holds still', () => {
  it('has no animation, keyframes or transform: it only fades', () => {
    expect(handwritten).not.toMatch(/@keyframes|animation|transform\s*:/);
    expect(handwritten).toMatch(/transition: opacity/);
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

describe('dismissSplash', () => {
  function fakeSplash() {
    const classes = new Set<string>();
    return {
      classes,
      removed: false,
      classList: { add: (c: string) => classes.add(c), contains: (c: string) => classes.has(c) },
      remove() {
        this.removed = true;
      }
    };
  }

  it('waits two frames, adds the class, then takes the element out', () => {
    vi.useFakeTimers();
    const frames: Array<() => void> = [];
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => void frames.push(cb));
    const splash = fakeSplash();
    const doc = { getElementById: () => splash } as unknown as Document;

    dismissSplash(doc);
    expect(splash.classes.has('is-leaving')).toBe(false);
    frames.shift()!();
    expect(splash.classes.has('is-leaving')).toBe(false);
    frames.shift()!();
    expect(splash.classes.has('is-leaving')).toBe(true);
    expect(splash.removed).toBe(false);
    vi.advanceTimersByTime(800);
    expect(splash.removed).toBe(true);

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('is a no-op with no first frame, and on a second call', () => {
    const frames: Array<() => void> = [];
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => void frames.push(cb));
    dismissSplash({ getElementById: () => null } as unknown as Document);
    const splash = fakeSplash();
    splash.classes.add('is-leaving');
    dismissSplash({ getElementById: () => splash } as unknown as Document);
    expect(frames).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});
