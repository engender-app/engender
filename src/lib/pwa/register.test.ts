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

  test.each([
    'booting',
    'needs-unlock',
    'needs-authentication',
    'needs-device-recovery',
    'legacy-refused',
    'schema-too-new',
    'error'
  ])('does not register on %s', async (status) => {
    const { registerServiceWorkerAfterBoot } = await import('./register');
    registerServiceWorkerAfterBoot(status);
    expect(whenIdle).not.toHaveBeenCalled();
  });

  test.each(['needs-setup', 'ready'])('hands over to idle time once boot says %s', async (status) => {
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
    registerServiceWorkerAfterBoot('needs-setup');
    expect(whenIdle).toHaveBeenCalledTimes(1);
  });
});
