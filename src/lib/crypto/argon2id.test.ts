import { test, expect } from 'vitest';
import { deriveKey, randomSalt, prewarmArgon2 } from './argon2id.ts';
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

/* Off the main thread where there is a worker (ux-carpet ticket 209). The
   stand-in below plays the worker's side with the same in-thread call, so
   what is checked is the hand-over, not argon2id itself. */
test('a worker derives the key and is terminated afterwards', async () => {
  const g = globalThis as Record<string, unknown>;
  const prior = g.Worker;
  const made: { terminated: boolean; got: unknown }[] = [];
  g.Worker = class {
    terminated = false;
    got: unknown = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: { message: string; preventDefault(): void }) => void) | null = null;
    constructor() {
      made.push(this);
    }
    postMessage(message: { password: string; salt: Uint8Array<ArrayBuffer>; params: Argon2Params }) {
      this.got = message;
      g.Worker = prior;
      void deriveKey(message.password, message.salt, message.params).then((key) => this.onmessage?.({ data: { ok: true, key } }));
    }
    terminate() {
      this.terminated = true;
    }
  };
  try {
    const salt = randomSalt();
    const viaWorker = await deriveKey('correct horse', salt, CHEAP);
    expect(made).toHaveLength(1);
    expect(made[0].terminated).toBe(true);
    expect(viaWorker).toEqual(await deriveKey('correct horse', salt, CHEAP));
  } finally {
    g.Worker = prior;
  }
});

test('a worker that never starts leaves the derivation to this thread', async () => {
  const g = globalThis as Record<string, unknown>;
  const prior = g.Worker;
  g.Worker = class {
    onerror: ((event: { message: string; preventDefault(): void }) => void) | null = null;
    postMessage() {
      queueMicrotask(() => this.onerror?.({ message: 'blocked', preventDefault() {} }));
    }
    terminate() {}
  };
  try {
    const salt = randomSalt();
    await capturedConsoleOutput(async () => {
      const key = await deriveKey('correct horse', salt, CHEAP);
      g.Worker = prior;
      expect(key).toEqual(await deriveKey('correct horse', salt, CHEAP));
    });
  } finally {
    g.Worker = prior;
  }
});


test('a prewarmed worker load failure falls back before a secret is posted', async () => {
  const g = globalThis as Record<string, unknown>;
  const prior = g.Worker;
  let worker: { onerror?: (event: { message: string; preventDefault(): void }) => void; terminate(): void; postMessage(): void };
  let posts = 0;
  let terminated = false;
  g.Worker = class {
    constructor() { worker = this; }
    postMessage() { posts++; }
    terminate() { terminated = true; }
  };
  try {
    prewarmArgon2();
    worker!.onerror?.({ message: 'chunk 404', preventDefault() {} });
    g.Worker = prior;
    const salt = randomSalt();
    const actual = await Promise.race([
      deriveKey('correct horse', salt, CHEAP),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 100))
    ]);
    expect(actual).toEqual(await deriveKey('correct horse', salt, CHEAP));
    expect(posts).toBe(0);
    expect(terminated).toBe(true);
  } finally { g.Worker = prior; }
});
