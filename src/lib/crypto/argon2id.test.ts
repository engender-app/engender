import { test, expect } from 'vitest';
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
