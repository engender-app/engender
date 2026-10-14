import { afterEach, beforeEach, describe, test, expect, vi } from 'vitest';
import { deriveKey, randomSalt } from './argon2id.ts';
import type { Argon2Params } from './params.ts';

/* Deliberately not one of the shipped profiles: these tests are about what
   deriveKey does with parameters, not about any consumer's cost, and every
   shipped profile is now heavy enough to make six of them a slow file. */
const CHEAP: Argon2Params = { memorySize: 1024, iterations: 1, parallelism: 1, hashLength: 32 };
import { capturedConsoleOutput } from './test-support/capture-console.ts';

test('derives a key of the requested length', async () => {
  const key = await deriveKey('correct horse', randomSalt(), CHEAP);
  expect(key).toBeInstanceOf(Uint8Array);
  expect(key.length).toBe(CHEAP.hashLength);
});

test('is deterministic for the same password, salt and params', async () => {
  const salt = randomSalt();
  const a = await deriveKey('correct horse', salt, CHEAP);
  const b = await deriveKey('correct horse', salt, CHEAP);
  expect(a).toEqual(b);
});

test('a different salt derives a different key from the same password', async () => {
  const a = await deriveKey('correct horse', randomSalt(), CHEAP);
  const b = await deriveKey('correct horse', randomSalt(), CHEAP);
  expect(a).not.toEqual(b);
});

test('a different password derives a different key from the same salt', async () => {
  const salt = randomSalt();
  const a = await deriveKey('correct horse', salt, CHEAP);
  const b = await deriveKey('wrong horse', salt, CHEAP);
  expect(a).not.toEqual(b);
});

test('randomSalt never repeats across calls', () => {
  const salts = new Set(Array.from({ length: 50 }, () => randomSalt().join(',')));
  expect(salts.size).toBe(50);
});

test('never logs the password or the derived key', async () => {
  const password = 'super-secret-password-marker';
  let keyHex = '';

  const output = await capturedConsoleOutput(async () => {
    const key = await deriveKey(password, randomSalt(), CHEAP);
    keyHex = Buffer.from(key).toString('hex');
  });

  for (const text of output) {
    expect(text.includes(password)).toBe(false);
    expect(text.includes(keyHex)).toBe(false);
  }
});

describe('worker handover and fallback', () => {
  const salt = Uint8Array.from({ length: 16 }, (_, i) => i);
  const expected = Uint8Array.from(Buffer.from('77cce82a2481b757eb86f92a001910c970069038c7537a3ec40d22d50763d0f8', 'hex'));
  type Answer = { ok: true; key: Uint8Array<ArrayBuffer> } | { ok: false; error?: string; loadFailed?: boolean };
  class FakeWorker {
    static made: FakeWorker[] = [];
    onmessage: ((event: { data: Answer }) => void) | null = null;
    onerror: ((event: { message: string; preventDefault(): void }) => void) | null = null;
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor(readonly url: URL, readonly options: WorkerOptions) {
      FakeWorker.made.push(this);
    }
    fail() {
      const preventDefault = vi.fn();
      this.onerror?.({ message: 'chunk 404', preventDefault });
      return preventDefault;
    }
  }

  beforeEach(() => {
    vi.resetModules();
    FakeWorker.made = [];
    vi.stubGlobal('Worker', FakeWorker);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('prewarming starts one module worker and derivation consumes it', async () => {
    const { deriveKey, prewarmArgon2 } = await import('./argon2id.ts');
    prewarmArgon2();
    prewarmArgon2();
    expect(FakeWorker.made).toHaveLength(1);
    const worker = FakeWorker.made[0];
    expect(worker.url.pathname).toMatch(/\/argon2id\.worker\.ts$/);
    expect(worker.options).toEqual({ type: 'module' });

    const result = deriveKey('correct horse', salt, CHEAP);
    expect(FakeWorker.made).toHaveLength(1);
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({ password: 'correct horse', salt, params: CHEAP });
    worker.onmessage?.({ data: { ok: true, key: expected } });
    expect(await result).toBe(expected);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(salt).toEqual(Uint8Array.from({ length: 16 }, (_, i) => i));
    prewarmArgon2();
    expect(FakeWorker.made).toHaveLength(2);
  });

  test('a worker load error suppresses its event and derives the known key on this thread', async () => {
    const { deriveKey } = await import('./argon2id.ts');
    const output = await capturedConsoleOutput(async () => {
      const result = deriveKey('correct horse', salt, CHEAP);
      const worker = FakeWorker.made[0];
      expect(worker.fail()).toHaveBeenCalledOnce();
      expect(await result).toEqual(expected);
      expect(worker.terminate).toHaveBeenCalledOnce();
    });
    expect(output).toEqual(['argon2id worker did not start; deriving on the main thread chunk 404']);
  });

  test('a failed prewarm terminates once and never receives or retries a secret', async () => {
    const { deriveKey, prewarmArgon2 } = await import('./argon2id.ts');
    prewarmArgon2();
    const worker = FakeWorker.made[0];
    expect(worker.fail()).toHaveBeenCalledOnce();
    expect(worker.terminate).toHaveBeenCalledOnce();
    prewarmArgon2();
    expect(FakeWorker.made).toHaveLength(1);
    expect(await deriveKey('correct horse', salt, CHEAP)).toEqual(expected);
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(FakeWorker.made).toHaveLength(1);
  });

  test.each([
    { ok: false as const, error: 'invalid profile' },
    { ok: false as const, error: 'invalid profile', loadFailed: false },
    { ok: false as const }
  ])('a worker that ran and failed refuses without retrying: %j', async (answer) => {
    const { deriveKey } = await import('./argon2id.ts');
    const result = deriveKey('correct horse', salt, CHEAP);
    const refused = expect(result).rejects.toThrow(answer.error ?? 'argon2id failed');
    const worker = FakeWorker.made[0];
    worker.onmessage?.({ data: answer });
    await refused;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  test.each(['absent', 'throws'])('an unavailable worker falls back without prewarming: %s', async (failure) => {
    vi.stubGlobal('Worker', failure === 'absent' ? undefined : class {
      constructor() { throw new Error('worker blocked'); }
    });
    const { deriveKey, prewarmArgon2 } = await import('./argon2id.ts');
    expect(() => prewarmArgon2()).not.toThrow();
    expect(await deriveKey('correct horse', salt, CHEAP)).toEqual(expected);
  });
});
