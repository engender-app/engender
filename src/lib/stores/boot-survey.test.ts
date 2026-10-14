import { beforeEach, expect, test, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  own: vi.fn(), secret: vi.fn(), device: vi.fn(), legacy: vi.fn()
}));
vi.mock('../data/credential-ownership', async (original) => ({
  ...await original<typeof import('../data/credential-ownership')>(), authenticateCredentials: hooks.own
}));
vi.mock('../data/keystore-file', async (original) => ({
  ...await original<typeof import('../data/keystore-file')>(), readKeystoreSource: hooks.secret
}));
vi.mock('../data/device-bound-journal', async (original) => ({
  ...await original<typeof import('../data/device-bound-journal')>(), deviceBoundJournalExists: hooks.device
}));
vi.mock('../data/legacy-journal', async (original) => ({
  ...await original<typeof import('../data/legacy-journal')>(), legacyStoragePresent: hooks.legacy
}));
import { performPlatformEffect } from './boot-platform';
import { initialBoot, reduce } from './boot-machine';

beforeEach(() => vi.clearAllMocks());

test('the web survey waits for credential ownership and dispatches cleanup before releasing it', async () => {
  let enter!: () => void;
  const waiting = new Promise<void>(resolve => { enter = resolve; });
  let owned = false;
  hooks.own.mockImplementation(async (work: () => Promise<void>) => {
    await waiting;
    owned = true;
    try { await work(); } finally { owned = false; }
  });
  hooks.secret.mockResolvedValue(null);
  hooks.device.mockResolvedValue(false);
  hooks.legacy.mockResolvedValue(false);
  const dispatch = vi.fn(() => { expect(owned).toBe(true); });
  const pending = performPlatformEffect({ type: 'survey-web' }, dispatch);
  expect(hooks.secret).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
  enter();
  await pending;
  expect(dispatch).toHaveBeenCalledWith({ type: 'web-surveyed', keystoreSecretSource: null,
    deviceBoundKeystoreExists: false, legacyStoragePresent: false });
  expect(owned).toBe(false);
});


test('a setup completed while the survey waits owns its mirrors', async () => {
  let setupFinished!: () => void;
  const setup = new Promise<void>(resolve => { setupFinished = resolve; });
  hooks.own.mockImplementation(async (work: () => Promise<void>) => { await setup; return work(); });
  hooks.secret.mockResolvedValue(null);
  hooks.device.mockResolvedValue(false);
  hooks.legacy.mockResolvedValue(false);
  const dispatch = vi.fn();
  const pending = performPlatformEffect({ type: 'survey-web' }, dispatch);
  expect(hooks.secret).not.toHaveBeenCalled();
  hooks.secret.mockResolvedValue('pin');
  setupFinished();
  await pending;
  const step = reduce(initialBoot(), dispatch.mock.calls[0][0]);
  expect(step.machine.boot.accessMode).toBe('pin');
  expect(step.machine.boot.status).toBe('needs-unlock');
  expect(step.effects).not.toContainEqual({ type: 'discard-erased-journal-mirrors' });
});

test('a setup queued by synchronous survey dispatch runs after ownership releases', async () => {
  let turn = Promise.resolve();
  hooks.own.mockImplementation((work: () => Promise<void>) => {
    const next = turn.then(work);
    turn = next.catch(() => {});
    return next;
  });
  hooks.secret.mockResolvedValue(null);
  hooks.device.mockResolvedValue(false);
  hooks.legacy.mockResolvedValue(false);
  let queued!: Promise<void>;
  let created = false;
  await performPlatformEffect({ type: 'survey-web' }, () => {
    queued = hooks.own(async () => { created = true; });
  });
  await queued;
  expect(created).toBe(true);
});
