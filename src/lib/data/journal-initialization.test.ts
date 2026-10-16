import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { androidKeystore } from '../lock/keystore-bridge';
import { initializeJournal, journalAccessExists, JournalAlreadyExistsError } from './journal-initialization';

const native = vi.hoisted(() => ({ readCredential: vi.fn(), storage: vi.fn() }));
vi.mock('../android/plugin-registry', () => ({ androidPluginOwners: { keystore: 'keystore' }, registerAndroidPlugin: () => native }));
vi.mock('./sqlite/android-driver', () => ({ inspectAndroidJournal: native.storage }));
beforeEach(() => { native.readCredential.mockResolvedValue({ initialized: false }); native.storage.mockResolvedValue({ exists: false, plaintext: false }); });

vi.mock('../lock/keystore-bridge', () => ({ androidKeystore: { status: vi.fn() } }));

const locks = navigator.locks;
afterEach(() => vi.unstubAllGlobals());

test.each([false, true])('concurrent initialization publishes exactly one credential (native: %s)', async (native) => {
  if (native) {
    vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'android' } });
    vi.stubGlobal('navigator', {});
  }
  let exists = false;
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  const create = vi.fn(async () => {
    entered();
    await held;
    exists = true;
    return 'original key';
  });
  const first = initializeJournal(create, async () => exists);
  await started;
  const second = initializeJournal(create, async () => exists);
  const rejected = expect(second).rejects.toThrow(JournalAlreadyExistsError);
  release();
  await expect(first).resolves.toBe('original key');
  await rejected;
  expect(create).toHaveBeenCalledTimes(1);
});

test('failed publication releases initialization ownership for a retry', async () => {
  await expect(initializeJournal(async () => { throw new Error('write failed'); }, async () => false)).rejects.toThrow('write failed');
  await expect(initializeJournal(async () => 'retry', async () => false)).resolves.toBe('retry');
});

test.each(['keystore.json', 'device-key.json', 'engender.sqlite3'])('durable %s prevents setup before any metadata parsing', async (name) => {
  vi.stubGlobal('navigator', { locks, storage: { getDirectory: async () => ({
    getFileHandle: async (candidate: string) => {
      if (candidate !== name) throw new DOMException('missing', 'NotFoundError');
      return {};
    }
  }) } });
  const create = vi.fn();
  await expect(initializeJournal(create)).rejects.toThrow(JournalAlreadyExistsError);
  expect(create).not.toHaveBeenCalled();
});

test('storage errors are not mistaken for an empty installation', async () => {
  vi.stubGlobal('navigator', { locks, storage: { getDirectory: async () => { throw new Error('storage denied'); } } });
  await expect(journalAccessExists()).rejects.toThrow('storage denied');
});


test.each([true, false])('native key=%s recheck precedes initialization', async (hasKey) => {
  vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'android' } });
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => ({
    getFileHandle: async () => { throw new DOMException('missing', 'NotFoundError'); }
  }) } });
  vi.mocked(androidKeystore.status).mockResolvedValue({ hasKey });
  const create = vi.fn(async () => 'new key');
  if (hasKey) {
    await expect(initializeJournal(create)).rejects.toThrow(JournalAlreadyExistsError);
    expect(create).not.toHaveBeenCalled();
  } else {
    await expect(initializeJournal(create)).resolves.toBe('new key');
  }
});

test('a web runtime without cross-tab ownership cannot create credentials', async () => {
  vi.stubGlobal('navigator', {});
  const create = vi.fn();
  await expect(initializeJournal(create, async () => false)).rejects.toThrow();
  expect(create).not.toHaveBeenCalled();
});

test('a stale web setup cannot mint a key when only the encrypted pool survives', async () => {
  const getDirectoryHandle = vi.fn(async (name: string, options?: { create?: boolean }) => {
    expect(name).toBe('mc-pool-16lluf4');
    expect(options?.create).not.toBe(true);
    return {};
  });
  vi.stubGlobal('navigator', { locks, storage: { getDirectory: async () => ({
    getFileHandle: async () => { throw new DOMException('missing', 'NotFoundError'); }, getDirectoryHandle
  }) } });
  const create = vi.fn();
  await expect(initializeJournal(create)).rejects.toThrow(JournalAlreadyExistsError);
  expect(create).not.toHaveBeenCalled();
  expect(getDirectoryHandle).toHaveBeenCalledOnce();
});


test.each(['database', 'credential'])('a stale native setup cannot mint over retained %s', async (retained) => {
  vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'android' } });
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => ({
    getFileHandle: async () => { throw new DOMException('missing', 'NotFoundError'); }
  }) } });
  vi.mocked(androidKeystore.status).mockResolvedValue({ hasKey: false });
  if (retained === 'database') native.storage.mockResolvedValue({ exists: true, plaintext: false });
  else native.readCredential.mockResolvedValue({ initialized: true, serialized: '{broken' });
  const create = vi.fn();
  await expect(initializeJournal(create)).rejects.toThrow(JournalAlreadyExistsError);
  expect(create).not.toHaveBeenCalled();
});

test('native survey failure refuses stale setup without minting a key', async () => {
  vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'android' } });
  native.readCredential.mockResolvedValue({ initialized: true });
  vi.mocked(androidKeystore.status).mockResolvedValue({ hasKey: false });
  native.storage.mockRejectedValue(new Error('unreadable storage'));
  const create = vi.fn();
  await expect(initializeJournal(create)).rejects.toThrow('unreadable storage');
  expect(create).not.toHaveBeenCalled();
});

test('an authoritative native tombstone does not readopt stale OPFS during a genuinely fresh setup', async () => {
  vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'android' } });
  const readOpfs = vi.fn(() => { throw new Error('stale OPFS must stay ignored'); });
  vi.stubGlobal('navigator', { storage: { getDirectory: readOpfs } });
  native.readCredential.mockResolvedValue({ initialized: true });
  vi.mocked(androidKeystore.status).mockResolvedValue({ hasKey: false });
  native.storage.mockResolvedValue({ exists: false, plaintext: false });
  const create = vi.fn(async () => 'new key');
  await expect(initializeJournal(create)).resolves.toBe('new key');
  expect(readOpfs).not.toHaveBeenCalled();
});
