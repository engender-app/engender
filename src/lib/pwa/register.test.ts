import { beforeEach, describe, expect, test, vi } from 'vitest';

const policy = vi.hoisted(() => ({ dev: false, android: false }));
const whenIdle = vi.fn();
/* Replace browser policy and idle scheduling; registration and update
   ownership remain the production modules. */
vi.mock('$app/environment', () => ({ get dev() { return policy.dev; } }));
vi.mock('$app/paths', () => ({ base: '' }));
vi.mock('$lib/platform', () => ({ isAndroid: () => policy.android }));
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


describe('explicit recovery registration', () => {
  beforeEach(() => {
    policy.dev = false;
    policy.android = false;
    whenIdle.mockClear();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  function browser() {
    const registration = {
      active: {}, waiting: { postMessage: vi.fn() }, installing: null,
      update: vi.fn(async () => {}), addEventListener: vi.fn()
    };
    const register = vi.fn(async () => registration);
    const visibility = vi.fn();
    vi.stubGlobal('navigator', { serviceWorker: { register, addEventListener: vi.fn(), removeEventListener: vi.fn() } });
    vi.stubGlobal('document', { addEventListener: visibility });
    vi.stubGlobal('location', { reload: vi.fn() });
    return { registration, register, visibility };
  }

  test('recovery starts immediately and later idle boot adds no second watcher', async () => {
    const { registration, register, visibility } = browser();
    const { registerServiceWorkerAfterBoot, checkForNewerRelease } = await import('./register');
    registerServiceWorkerAfterBoot('schema-too-new');
    expect(whenIdle).not.toHaveBeenCalled();
    expect(await checkForNewerRelease()).toBe(true);
    expect(register).toHaveBeenCalledWith('/service-worker.js', { updateViaCache: 'none' });
    expect(registration.update).toHaveBeenCalledTimes(1);
    registerServiceWorkerAfterBoot('ready');
    await whenIdle.mock.calls[0][0]();
    await checkForNewerRelease();
    expect(register).toHaveBeenCalledTimes(1);
    expect(registration.addEventListener).toHaveBeenCalledTimes(1);
    expect(visibility).toHaveBeenCalledTimes(1);
  });

  test('recovery joins a registration already started by idle boot', async () => {
    const { registration, register, visibility } = browser();
    let finish!: (value: typeof registration) => void;
    register.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { registerServiceWorkerAfterBoot, checkForNewerRelease } = await import('./register');
    registerServiceWorkerAfterBoot('ready');
    whenIdle.mock.calls[0][0]();
    const recovering = checkForNewerRelease();
    expect(register).toHaveBeenCalledTimes(1);
    expect(registration.update).not.toHaveBeenCalled();
    finish(registration);
    expect(await recovering).toBe(true);
    expect(registration.addEventListener).toHaveBeenCalledTimes(1);
    expect(visibility).toHaveBeenCalledTimes(1);
  });

  test('registration failure reaches recovery and a later action retries', async () => {
    const { register, registration } = browser();
    register.mockRejectedValueOnce(new Error('offline'));
    const { checkForNewerRelease } = await import('./register');
    await expect(checkForNewerRelease()).rejects.toThrow('offline');
    expect(await checkForNewerRelease()).toBe(true);
    expect(register).toHaveBeenCalledTimes(2);
    expect(registration.addEventListener).toHaveBeenCalledTimes(1);
  });

  test.each(['development', 'unavailable', 'android'])('%s never acquires a web update', async (mode) => {
    const { register } = browser();
    const unregister = vi.fn(async () => true);
    const getRegistrations = vi.fn(async () => [{ unregister }]);
    if (mode === 'development') policy.dev = true;
    if (mode === 'unavailable') vi.stubGlobal('navigator', {});
    if (mode === 'android') {
      policy.android = true;
      vi.stubGlobal('navigator', { serviceWorker: { register, getRegistrations } });
    }
    const { checkForNewerRelease } = await import('./register');
    expect(await checkForNewerRelease()).toBe(false);
    expect(register).not.toHaveBeenCalled();
    if (mode === 'android') expect(unregister).toHaveBeenCalledTimes(1);
  });
});
