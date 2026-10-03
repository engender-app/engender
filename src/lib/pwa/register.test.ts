import { beforeEach, describe, expect, test, vi } from 'vitest';

const whenIdle = vi.fn();
/* The Node tier has no SvelteKit aliases; register.ts's three imports are
   stood in for, and only the schedule is under test. */
vi.mock('$app/environment', () => ({ dev: false }));
vi.mock('$app/paths', () => ({ base: '' }));
vi.mock('$lib/platform', () => ({ isAndroid: () => false }));
vi.mock('$lib/idle', () => ({ whenIdle: (run: () => void) => whenIdle(run) }));

describe('registerServiceWorkerAfterBoot', () => {
  beforeEach(() => {
    whenIdle.mockClear();
    vi.resetModules();
  });

  test('waits while the journal is still booting', async () => {
    const { registerServiceWorkerAfterBoot } = await import('./register');
    registerServiceWorkerAfterBoot('booting');
    expect(whenIdle).not.toHaveBeenCalled();
  });

  test.each(['needs-setup', 'needs-unlock', 'ready', 'error'])('hands over to idle time once boot says %s', async (status) => {
    const { registerServiceWorkerAfterBoot } = await import('./register');
    registerServiceWorkerAfterBoot('booting');
    registerServiceWorkerAfterBoot(status);
    expect(whenIdle).toHaveBeenCalledTimes(1);
  });

  test('registers once however many times the status changes after that', async () => {
    const { registerServiceWorkerAfterBoot } = await import('./register');
    registerServiceWorkerAfterBoot('needs-unlock');
    registerServiceWorkerAfterBoot('ready');
    registerServiceWorkerAfterBoot('ready');
    expect(whenIdle).toHaveBeenCalledTimes(1);
  });
});
