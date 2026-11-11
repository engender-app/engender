import { describe, expect, test, vi } from 'vitest';
import { registerStepBack, stepBack } from './stepBack';

describe('a mounted step machine owns Back', () => {
  test('a registered owner answers, and nothing answers once it is gone', () => {
    const previous = vi.fn(() => true);
    const unregister = registerStepBack(previous);
    expect(stepBack()).toBe(true);
    unregister();
    expect(stepBack()).toBe(false);
    expect(previous).toHaveBeenCalledTimes(1);
  });

  test('an owner on its first step declines, so Back leaves the screen as before', () => {
    const unregister = registerStepBack(() => false);
    expect(stepBack()).toBe(false);
    unregister();
  });

  test('cleanup of an older mount cannot unregister its replacement', () => {
    const old = registerStepBack(() => false);
    const current = registerStepBack(() => true);
    old();
    expect(stepBack()).toBe(true);
    current();
  });
});
