import { describe, expect, test, vi } from 'vitest';
import { registerSetupBack, setupBack } from './back';

describe('mounted setup Back owner', () => {
  test('unmounted drafts cannot consume Back from Today', () => {
    const previous = vi.fn(() => true);
    const unregister = registerSetupBack(previous);
    expect(setupBack()).toBe(true);
    unregister();
    expect(setupBack()).toBe(false);
    expect(previous).toHaveBeenCalledTimes(1);
  });

  test('cleanup of an older mount cannot unregister its replacement', () => {
    const old = registerSetupBack(() => true);
    const current = registerSetupBack(() => false);
    old();
    expect(setupBack()).toBe(false);
    current();
  });
});
