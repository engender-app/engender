import { test, expect } from 'vitest';
import { deriveKey, randomSalt } from './argon2id.ts';
import { PIN_ARGON2_PARAMS } from './params.ts';
import { capturedConsoleOutput } from './test-support/capture-console.ts';

test('derives a key of the requested length', async () => {
  const key = await deriveKey('correct horse', randomSalt(), PIN_ARGON2_PARAMS);
  expect(key).toBeInstanceOf(Uint8Array);
  expect(key.length).toBe(PIN_ARGON2_PARAMS.hashLength);
});

test('is deterministic for the same password, salt and params', async () => {
  const salt = randomSalt();
  const a = await deriveKey('correct horse', salt, PIN_ARGON2_PARAMS);
  const b = await deriveKey('correct horse', salt, PIN_ARGON2_PARAMS);
  expect(a).toEqual(b);
});

test('a different salt derives a different key from the same password', async () => {
  const a = await deriveKey('correct horse', randomSalt(), PIN_ARGON2_PARAMS);
  const b = await deriveKey('correct horse', randomSalt(), PIN_ARGON2_PARAMS);
  expect(a).not.toEqual(b);
});

test('a different password derives a different key from the same salt', async () => {
  const salt = randomSalt();
  const a = await deriveKey('correct horse', salt, PIN_ARGON2_PARAMS);
  const b = await deriveKey('wrong horse', salt, PIN_ARGON2_PARAMS);
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
    const key = await deriveKey(password, randomSalt(), PIN_ARGON2_PARAMS);
    keyHex = Buffer.from(key).toString('hex');
  });

  for (const text of output) {
    expect(text.includes(password)).toBe(false);
    expect(text.includes(keyHex)).toBe(false);
  }
});
