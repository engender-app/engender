import { describe, expect, it } from 'vitest';
import { bloomGeometry, bloomGradient, changePalette, changeTheme, isAppearancePending } from './paletteChange';

describe('palette change', () => {
  it('saves immediately when view transitions are unavailable', () => {
    let palette = 'trans';
    changePalette(() => { palette = 'nonbinary'; }, { startViewTransition: undefined } as unknown as Document);
    expect(palette).toBe('nonbinary');
  });

  it('saves theme choices without view transitions', () => {
    let theme = 'system';
    changeTheme(() => { theme = 'dark'; }, { startViewTransition: undefined } as unknown as Document);
    expect(theme).toBe('dark');
  });

  it('clears an active reveal if view transitions become unavailable', () => {
    const root = { dataset: { appearanceTransition: '', paletteTransition: '' } as DOMStringMap };
    let theme = 'system';
    changeTheme(() => { theme = 'light'; }, {
      documentElement: root,
      startViewTransition: undefined
    } as unknown as Document);
    expect(theme).toBe('light');
    expect(root.dataset).toEqual({});
  });

  it('saves a choice if a transition ends before its update callback', async () => {
    const root = { dataset: {} as DOMStringMap };
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => { finish = resolve; });
    const doc = {
      documentElement: root,
      startViewTransition() { return { ready: Promise.resolve(), finished }; }
    } as unknown as Document;
    let theme = 'system';

    changeTheme(() => { theme = 'dark'; }, doc);
    finish();
    await finished;
    await Promise.resolve();
    await Promise.resolve();
    expect(theme).toBe('dark');
    expect(isAppearancePending('theme')).toBe(false);
    expect(root.dataset).toEqual({});
  });

  it('keeps the capture active until the transition finishes', async () => {
    const root = { dataset: {} as DOMStringMap };
    let update: (() => Promise<void>) | undefined;
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => { finish = resolve; });
    const doc = {
      documentElement: root,
      startViewTransition(callback: () => Promise<void>) {
        update = callback;
        return { ready: Promise.resolve(), finished };
      }
    } as unknown as Document;
    let palette = 'trans';

    changePalette(() => { palette = 'nonbinary'; }, doc);
    expect('appearanceTransition' in root.dataset).toBe(true);
    expect('paletteTransition' in root.dataset).toBe(true);
    expect(palette).toBe('trans');
    await update!();
    expect(palette).toBe('nonbinary');
    finish();
    await finished;
    await Promise.resolve();
    await Promise.resolve();
    expect('appearanceTransition' in root.dataset).toBe(false);
    expect('paletteTransition' in root.dataset).toBe(false);
  });

  it('uses the same reveal for theme and keeps the latest rapid choice', async () => {
    const root = { dataset: {} as DOMStringMap };
    const updates: (() => Promise<void>)[] = [];
    const finishes: (() => void)[] = [];
    const doc = {
      documentElement: root,
      startViewTransition(callback: () => Promise<void>) {
        updates.push(callback);
        const finished = new Promise<void>((resolve) => { finishes.push(resolve); });
        return { ready: Promise.resolve(), finished };
      }
    } as unknown as Document;
    let theme = 'system';

    changeTheme(() => { theme = 'light'; }, doc);
    expect(isAppearancePending('theme')).toBe(true);
    expect('appearanceTransition' in root.dataset).toBe(true);
    expect('paletteTransition' in root.dataset).toBe(false);
    changeTheme(() => { theme = 'dark'; }, doc);
    await updates[1]();
    await updates[0]();
    expect(theme).toBe('dark');
    expect(isAppearancePending('theme')).toBe(false);
    finishes[0]();
    await Promise.resolve();
    await Promise.resolve();
    expect('appearanceTransition' in root.dataset).toBe(true);
    finishes[1]();
    await Promise.resolve();
    await Promise.resolve();
    expect('appearanceTransition' in root.dataset).toBe(false);
  });

  it('keeps a palette choice when a theme choice follows before capture', async () => {
    const updates: (() => Promise<void>)[] = [];
    const doc = {
      documentElement: { dataset: {} as DOMStringMap },
      startViewTransition(callback: () => Promise<void>) {
        updates.push(callback);
        return { ready: Promise.resolve(), finished: Promise.resolve() };
      }
    } as unknown as Document;
    let palette = 'trans';
    let theme = 'system';

    changePalette(() => { palette = 'nonbinary'; }, doc);
    changeTheme(() => { theme = 'dark'; }, doc);
    await updates[1]();
    expect(palette).toBe('nonbinary');
    expect(theme).toBe('dark');
    await updates[0]();
    expect(palette).toBe('nonbinary');
    expect(theme).toBe('dark');
  });

  it('swallows ready rejecting when the browser skips the transition', async () => {
    /* A viewport resize or a second transition skips this one, and `ready`
       rejects with nothing reading it; the window got the rejection. */
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', record);
    try {
      const doc = {
        documentElement: { dataset: {} as DOMStringMap },
        startViewTransition() {
          return { ready: Promise.reject(new Error('Viewport size changed')), finished: Promise.resolve() };
        }
      } as unknown as Document;
      changePalette(() => {}, doc);
      await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      process.off('unhandledRejection', record);
    }
    expect(unhandled).toEqual([]);
  });

  it('lets a rapid choice return to the saved palette before capture', async () => {
    const updates: (() => Promise<void>)[] = [];
    const doc = {
      documentElement: { dataset: {} as DOMStringMap },
      startViewTransition(callback: () => Promise<void>) {
        updates.push(callback);
        return { ready: Promise.resolve(), finished: Promise.resolve() };
      }
    } as unknown as Document;
    let palette = 'trans';

    changePalette(() => { palette = 'nonbinary'; }, doc);
    expect(isAppearancePending('palette')).toBe(true);
    changePalette(() => { palette = 'trans'; }, doc);
    await updates[1]();
    await updates[0]();
    expect(palette).toBe('trans');
    expect(isAppearancePending('palette')).toBe(false);
  });

  /* prh12 bug 9: the new colours bloom from the sun's own centre, and the
     circle has to cover the farthest corner of the window wherever the sun
     is, including partly off screen above a scrolled Settings. */
  it('reaches the farthest window corner from the sun centre', () => {
    const corner = bloomGeometry({ x: 390, y: 0 }, 390, 844);
    expect(corner.reach).toBeCloseTo(Math.hypot(390, 844), 5);
    const scrolled = bloomGeometry({ x: 390, y: -300 }, 390, 844);
    expect(scrolled.reach).toBeCloseTo(Math.hypot(390, 1144), 5);
    const middle = bloomGeometry({ x: 100, y: 400 }, 390, 844);
    expect(middle.reach).toBeCloseTo(Math.hypot(290, 444), 5);
    /* The ring band rides outside the reach, so the last ring has left the
       window when the new colours cover it. */
    expect(corner.outer).toBeGreaterThan(corner.reach);
  });

  it('draws the rings as a band outside the reach, outermost stripe outermost', () => {
    const gradient = bloomGradient(['red', 'white', 'blue'], 100, 160, 6);
    expect(gradient.startsWith('radial-gradient(circle farthest-side, transparent 0px 100px, ')).toBe(true);
    /* Inner to outer: blue from 100, white from 120, red from 140 to 160,
       each with the black seam on its own outer edge. */
    expect(gradient).toContain('blue 100px 114px, #000 114px 120px');
    expect(gradient).toContain('red 140px 154px, #000 154px 160px)');
  });
});

