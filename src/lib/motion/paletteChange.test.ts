import { describe, expect, it } from 'vitest';
import { changePalette, takePaletteSunFade } from './paletteChange';

describe('palette change', () => {
  it('saves immediately when view transitions are unavailable', () => {
    let palette = 'trans';
    changePalette(() => { palette = 'nonbinary'; }, { startViewTransition: undefined } as unknown as Document);
    expect(palette).toBe('nonbinary');
    expect(takePaletteSunFade('/settings', '/')).toBe(true);
    expect(takePaletteSunFade('/settings', '/')).toBe(false);
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
    expect('paletteTransition' in root.dataset).toBe(true);
    expect(palette).toBe('trans');
    await update!();
    expect(palette).toBe('nonbinary');
    expect(takePaletteSunFade('/settings', '/')).toBe(true);
    finish();
    await finished;
    await Promise.resolve();
    await Promise.resolve();
    expect('paletteTransition' in root.dataset).toBe(false);
  });

  it('drops the sun fade when leaving Settings for another screen', () => {
    changePalette(() => {}, { startViewTransition: undefined } as unknown as Document);
    expect(takePaletteSunFade('/settings', '/calendar')).toBe(false);
    expect(takePaletteSunFade('/calendar', '/')).toBe(false);
  });
});
