import { describe, expect, it } from 'vitest';
import { changePalette, changeTheme, isAppearancePending } from './paletteChange';

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
      startViewTransition() { return { finished }; }
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
        return { finished };
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
        return { finished };
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
        return { finished: Promise.resolve() };
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

  it('lets a rapid choice return to the saved palette before capture', async () => {
    const updates: (() => Promise<void>)[] = [];
    const doc = {
      documentElement: { dataset: {} as DOMStringMap },
      startViewTransition(callback: () => Promise<void>) {
        updates.push(callback);
        return { finished: Promise.resolve() };
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

});
