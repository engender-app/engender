import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { COLD_SCREEN_SAMPLER } from './cold-screen-sampler.mjs';

it('records one observation per rendering frame after a delayed timer', () => {
  const frames: ((at: number) => void)[] = [];
  const timers: (() => void)[] = [];
  const window: { __coldSamples?: unknown[] } = {};
  let now = 0;
  runInNewContext(COLD_SCREEN_SAMPLER, {
    window,
    navigator: {},
    location: { pathname: '/more' },
    document: { querySelectorAll: () => [] },
    performance: { now: () => now },
    requestAnimationFrame: (callback: (at: number) => void) => frames.push(callback),
    setTimeout: (callback: () => void) => timers.push(callback)
  });
  frames.shift()!(100);
  now = 150;
  timers.shift()!();
  expect(window.__coldSamples).toHaveLength(1);

  frames.shift()!(100.002);
  timers.shift()?.();
  expect(window.__coldSamples).toHaveLength(1);

  now = 167;
  frames.shift()!(166.667);
  timers.shift()!();
  expect(window.__coldSamples).toHaveLength(2);
});
