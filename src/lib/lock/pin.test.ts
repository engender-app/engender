import { test, expect } from 'vitest';
import { hashPin, verifyPin } from './pin.ts';
import { deriveKey, randomSalt } from '../crypto/argon2id.ts';
import { PIN_ARGON2_PARAMS } from '../crypto/params.ts';
import { capturedConsoleOutput } from '../crypto/test-support/capture-console.ts';

test('a stored record verifies the PIN it was made from', async () => {
  const record = await hashPin('1234');
  expect(await verifyPin('1234', record)).toBe(true);
});

test('a wrong PIN does not verify', async () => {
  const record = await hashPin('1234');
  expect(await verifyPin('4321', record)).toBe(false);
  expect(await verifyPin('', record)).toBe(false);
  expect(await verifyPin('12345', record)).toBe(false);
});

test('the record holds neither the PIN nor anything that spells it', async () => {
  const record = await hashPin('8317');
  expect(record.includes('8317')).toBe(false);
  expect(atob(record.split('$').at(-1)!)).not.toContain('8317');
});

test('the same PIN twice gives two different records, and both verify', async () => {
  const first = await hashPin('1234');
  const second = await hashPin('1234');
  expect(first).not.toBe(second);
  expect(await verifyPin('1234', first)).toBe(true);
  expect(await verifyPin('1234', second)).toBe(true);
});

test('a fresh record is stamped with this build’s parameters', async () => {
  const record = await hashPin('1234');

  expect(record.split('$').slice(0, 5)).toEqual([
    'v1',
    String(PIN_ARGON2_PARAMS.memorySize),
    String(PIN_ARGON2_PARAMS.iterations),
    String(PIN_ARGON2_PARAMS.parallelism),
    String(PIN_ARGON2_PARAMS.hashLength)
  ]);
});

test('a record made under other parameters still verifies, so a re-tune locks nobody out', async () => {
  /* What the preference would hold if this build's PIN_ARGON2_PARAMS were
     a re-tune of the numbers the PIN was set under. Written out by hand,
     because hashPin only ever uses the current set. */
  const params = { memorySize: 1024, iterations: 2, parallelism: 1, hashLength: 16 };
  const salt = randomSalt();
  const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
  const record = `v1$1024$2$1$16$${base64(salt)}$${base64(await deriveKey('1234', salt, params))}`;

  expect(await verifyPin('1234', record)).toBe(true);
  expect(await verifyPin('4321', record)).toBe(false);
});

test('an absent or damaged record verifies nothing rather than throwing', async () => {
  const good = await hashPin('1234');
  for (const record of [null, '', 'nonsense', good.slice(0, -4), good.replace('v1', 'v2'), 'v1$a$b$c$d$e$f']) {
    expect(await verifyPin('1234', record)).toBe(false);
  }
});

test('never logs the PIN', async () => {
  const pin = '9074';
  const output = await capturedConsoleOutput(async () => {
    const record = await hashPin(pin);
    await verifyPin(pin, record);
    await verifyPin('0000', record);
    await verifyPin(pin, 'nonsense');
  });
  for (const text of output) expect(text.includes(pin)).toBe(false);
});
