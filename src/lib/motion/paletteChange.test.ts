import { describe, expect, it } from 'vitest';
import { changePalette, changeTheme, takePaletteSunFade } from './paletteChange';

describe('palette change', () => {
  it('saves immediately when view transitions are unavailable', () => {
    let palette = 'trans';
    changePalette(() => { palette = 'nonbinary'; }, { startViewTransition: undefined } as unknown as Document);
    expect(palette).toBe('nonbinary');
    expect(takePaletteSunFade('/settings', '/')).toBe(true);
    expect(takePaletteSunFade('/settings', '/')).toBe(false);
  });

  it('saves theme choices without view transitions', () => {
    let theme = 'system';
    changeTheme(() => { theme = 'dark'; }, { startViewTransition: undefined } as unknown as Document);
    expect(theme).toBe('dark');
    expect(takePaletteSunFade('/settings', '/')).toBe(false);
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
    expect(takePaletteSunFade('/settings', '/')).toBe(true);
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
    expect('appearanceTransition' in root.dataset).toBe(true);
    expect('paletteTransition' in root.dataset).toBe(false);
    changeTheme(() => { theme = 'dark'; }, doc);
    await updates[1]();
    await updates[0]();
    expect(theme).toBe('dark');
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
    await updates[0]();
    expect(palette).toBe('nonbinary');
    expect(theme).toBe('dark');
  });

  it('drops the sun fade when leaving Settings for another screen', () => {
    changePalette(() => {}, { startViewTransition: undefined } as unknown as Document);
    expect(takePaletteSunFade('/settings', '/calendar')).toBe(false);
    expect(takePaletteSunFade('/calendar', '/')).toBe(false);
  });
});
