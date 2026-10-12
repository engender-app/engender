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
  /* A first frame, a document and the frames that document asks for.
     `screen.reads` holds a read; `screen.arriving` is the end time of a
     finite animation still running on the screen (0 for none). */
  function handoverDoc(screen: { reads: boolean; arriving: number } = { reads: false, arriving: 0 }, withView = true) {
    const classes = new Set<string>();
    const splash = {
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
    const frames: ((now: number) => void)[] = [];
    const documentElement = { dataset: { splash: '' } as Record<string, string> };
    const animation = (endTime: number) => ({ playState: 'running', effect: { getComputedTiming: () => ({ endTime }) } });
    /* A sweep that loops for good never counts as arriving. */
    const root = { getAnimations: () => [animation(Infinity), ...(screen.arriving ? [animation(screen.arriving)] : [])] };
    const doc = {
      getElementById: () => splash,
      querySelector: (selector: string) =>
        selector === '[data-app-root]' ? root : screen.reads && selector.includes('data-read-reserve-hold') ? {} : null,
      documentElement,
      defaultView: withView ? { requestAnimationFrame: (cb: (now: number) => void) => frames.push(cb) } : null
    } as unknown as Document;
    /* Runs the frames queued so far, one per timestamp. */
    const play = (...times: number[]) => {
      for (const now of times) frames.splice(0).forEach((cb) => cb(now));
    };
    return { doc, splash, classes, documentElement, frames, play };
  }

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

  /* Alicja, on the flipbooks: "splash with crossfade". The screen waits
     under the first frame (html[data-splash]) and fades in while the first
     frame fades out, so nothing of the app sits at full opacity under a
     half-transparent mark. */
  it('crossfades: once the screen has settled, it fades in with the first frame fading out, and both end together', () => {
    vi.useFakeTimers();
    const { doc, splash, classes, documentElement, play } = handoverDoc();
    answerSplash(doc);
    play(0, 16, 33, 50);
    expect(classes.has('is-leaving')).toBe(true);
    expect(classes.has('is-answered')).toBe(true);
    expect(documentElement.dataset.splash).toBe('leaving');
    vi.advanceTimersByTime(799);
    expect(splash.removed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(splash.removed).toBe(true);
    expect('splash' in documentElement.dataset).toBe(false);
    vi.useRealTimers();
  });

  /* Ticket 08. Blink does not paint a subtree at opacity 0, and nothing
     under an opaque layer is rastered, so at 0 under 1 the WebView met
     every GPU pipeline the screen needs on the fade's first frame. */
  it('holds the screen under the first frame at a nil opacity Blink still paints, and fades it in on the same curve and length', () => {
    expect(html).toMatch(/<html [^>]*data-splash[ >]/);
    const root = handwritten.match(/html\[data-splash\] \[data-app-root\] \{\s*opacity: ([\d.]+);\s*will-change: opacity;\s*\}/);
    expect(root).not.toBeNull();
    const rootOpacity = Number(root![1]);
    /* Blink skips painting below 0.0004. */
    expect(rootOpacity).toBeGreaterThan(0.0004);
    const mark = handwritten.match(/#splash \{[^}]*opacity: ([\d.]+);[^}]*\}/);
    const markOpacity = Number(mark![1]);
    expect(markOpacity).toBeLessThan(1);
    /* What shows of the screen through the mark, in 8-bit levels. */
    expect(rootOpacity * (1 - markOpacity) * 255).toBeLessThan(0.5);
    expect(handwritten).toContain('#splash.is-leaving { opacity: 0; }');
    expect(handwritten).toMatch(
      /html\[data-splash='leaving'\] \[data-app-root\] \{\s*opacity: 1;\s*transition: opacity 280ms var\(--ease-out-soft, [^)]+\)\);\s*\}/
    );
  });

  it('holds the mark through slow frames and crosses after three quick ones', () => {
    vi.useFakeTimers();
    const { doc, classes, documentElement, play } = handoverDoc();
    answerSplash(doc);
    expect(classes.has('is-answered')).toBe(true);
    expect(classes.has('is-leaving')).toBe(false);
    expect(documentElement.dataset.splash).toBe('');
    play(0, 192, 367, 383, 400);
    expect(classes.has('is-leaving')).toBe(false);
    play(416);
    expect(classes.has('is-leaving')).toBe(true);
    vi.useRealTimers();
  });

  it('waits for held reads to answer, then for quick frames', () => {
    vi.useFakeTimers();
    const screen = { reads: true, arriving: 0 };
    const { doc, classes, play } = handoverDoc(screen);
    answerSplash(doc);
    play(0, 16, 33, 50, 66);
    expect(classes.has('is-leaving')).toBe(false);
    screen.reads = false;
    play(83, 100, 116);
    expect(classes.has('is-leaving')).toBe(false);
    play(133);
    expect(classes.has('is-leaving')).toBe(true);
    vi.useRealTimers();
  });

  /* A read's body fades in from 0, so it first reaches the GPU when that
     fade starts: on the phone, 33 pipelines and a 158 ms stall 38 ms into a
     handover that had only waited for the holds to leave. */
  it('waits for the arrivals that answered reads start, then for quick frames', () => {
    vi.useFakeTimers();
    const screen = { reads: false, arriving: 280 };
    const { doc, classes, play } = handoverDoc(screen);
    answerSplash(doc);
    play(0, 16, 33, 50, 66);
    expect(classes.has('is-leaving')).toBe(false);
    screen.arriving = 0;
    play(83, 100, 116);
    expect(classes.has('is-leaving')).toBe(false);
    play(133);
    expect(classes.has('is-leaving')).toBe(true);
    vi.useRealTimers();
  });

  it('crosses at the cap when the screen never settles or no frames come', () => {
    vi.useFakeTimers();
    const { doc, classes } = handoverDoc({ reads: true, arriving: 0 });
    answerSplash(doc);
    vi.advanceTimersByTime(2499);
    expect(classes.has('is-leaving')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(classes.has('is-leaving')).toBe(true);
    vi.useRealTimers();
  });

  it('stops asking for frames once it has crossed', () => {
    vi.useFakeTimers();
    const { doc, frames, play } = handoverDoc();
    answerSplash(doc);
    play(0, 16, 33, 50);
    expect(frames.length).toBe(0);
    vi.useRealTimers();
  });

  it('a second answer, while holding or after, queues nothing more', () => {
    vi.useFakeTimers();
    const { doc, frames, play } = handoverDoc();
    answerSplash(doc);
    const timers = vi.getTimerCount();
    const queued = frames.length;
    answerSplash(doc);
    expect(vi.getTimerCount()).toBe(timers);
    expect(frames.length).toBe(queued);
    play(0, 16, 33, 50);
    const after = vi.getTimerCount();
    answerSplash(doc);
    expect(vi.getTimerCount()).toBe(after);
    expect(frames.length).toBe(0);
    vi.useRealTimers();
  });

  it('with no window to watch frames in, crosses at once', () => {
    vi.useFakeTimers();
    const { doc, classes } = handoverDoc(undefined, false);
    answerSplash(doc);
    expect(classes.has('is-leaving')).toBe(true);
    vi.useRealTimers();
  });

  it('with no first frame, lets the screen show at once rather than holding it', () => {
    const documentElement = { dataset: { splash: '' } as Record<string, string> };
    const doc = { getElementById: () => null, documentElement } as unknown as Document;
    expect(() => answerSplash(doc)).not.toThrow();
    expect('splash' in documentElement.dataset).toBe(false);
  });
});
