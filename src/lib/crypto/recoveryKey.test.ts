import { test, expect } from 'vitest';
import {
  RECOVERY_KEY_ENTROPY_BITS,
  RECOVERY_KEY_LENGTH,
  RecoveryKeyMistypedError,
  canonicalRecoveryKey,
  displayRecoveryKey,
  generateRecoveryKey
} from './recoveryKey.ts';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

test('a generated key is five groups of five, from the Crockford alphabet only', () => {
  for (let i = 0; i < 200; i++) {
    const key = generateRecoveryKey();
    expect(key).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}$/);
    for (const symbol of key.replace(/-/g, '')) expect(ALPHABET).toContain(symbol);
  }
});

/* The check symbol has 37 possible values and the alphabet has 32, so a
   generator that did not redraw would put a `*`, `~`, `$`, `=` or `U` on
   somebody's paper about one time in eight. Two hundred draws makes a
   missing redraw a certainty rather than a coin flip. */
test('the check symbol never falls outside the alphabet, across many draws', () => {
  for (let i = 0; i < 200; i++) {
    const canonical = generateRecoveryKey().replace(/-/g, '');
    expect(ALPHABET).toContain(canonical[canonical.length - 1]);
  }
});

test('a generated key round-trips through the parser it was minted through', () => {
  const key = generateRecoveryKey();
  const canonical = canonicalRecoveryKey(key);
  expect(canonical).toHaveLength(RECOVERY_KEY_LENGTH);
  expect(canonical).toBe(key.replace(/-/g, ''));
  expect(displayRecoveryKey(canonical)).toBe(key);
});

test('two keys are never the same, and the claim is 120 bits', () => {
  expect(RECOVERY_KEY_ENTROPY_BITS).toBe(120);
  const keys = new Set(Array.from({ length: 50 }, () => generateRecoveryKey()));
  expect(keys.size).toBe(50);
});

test('lowercase, spaces and missing separators all read as the same key', () => {
  const key = generateRecoveryKey();
  const canonical = canonicalRecoveryKey(key);

  expect(canonicalRecoveryKey(key.toLowerCase())).toBe(canonical);
  expect(canonicalRecoveryKey(key.replace(/-/g, ''))).toBe(canonical);
  expect(canonicalRecoveryKey(key.replace(/-/g, ' '))).toBe(canonical);
  expect(canonicalRecoveryKey(`  ${key.toLowerCase()}  `)).toBe(canonical);
});

test("Crockford's substitutions are applied, so an I is a 1 and an O is a 0", () => {
  /* Built rather than generated: the substitution can only be exercised by
     a key that actually contains a 1 or a 0, and a random key need not. */
  let key = generateRecoveryKey();
  while (!/[01]/.test(key.replace(/-/g, '').slice(0, 24))) key = generateRecoveryKey();

  const canonical = canonicalRecoveryKey(key);
  const typedBadly = key.replace(/1/g, 'I').replace(/0/g, 'O');
  expect(canonicalRecoveryKey(typedBadly)).toBe(canonical);

  const typedWorse = key.replace(/1/g, 'l').replace(/0/g, 'o');
  expect(canonicalRecoveryKey(typedWorse)).toBe(canonical);
});

test('a U is a slip rather than a symbol, and is refused by name', () => {
  const canonical = canonicalRecoveryKey(generateRecoveryKey());
  const withU = `U${canonical.slice(1)}`;
  expect(() => canonicalRecoveryKey(withU)).toThrow(RecoveryKeyMistypedError);
  expect(() => canonicalRecoveryKey(withU)).toThrow(/no U in it/);
});

test('one wrong character is caught by the check symbol', () => {
  const canonical = canonicalRecoveryKey(generateRecoveryKey());

  /* Every position, and every substitution at that position: the check
     symbol's whole claim is that no single-symbol error survives it, and
     37 being larger than the biggest possible error is why. A summed
     checksum would pass this and fail the transposition test below. */
  for (let at = 0; at < canonical.length; at++) {
    for (const symbol of ALPHABET) {
      if (symbol === canonical[at]) continue;
      const wrong = canonical.slice(0, at) + symbol + canonical.slice(at + 1);
      expect(() => canonicalRecoveryKey(wrong)).toThrow(RecoveryKeyMistypedError);
    }
  }
});

test('two swapped characters are caught, which a summed checksum would not be', () => {
  const canonical = canonicalRecoveryKey(generateRecoveryKey());

  let swaps = 0;
  for (let a = 0; a < canonical.length; a++) {
    for (let b = a + 1; b < canonical.length; b++) {
      if (canonical[a] === canonical[b]) continue;
      const transposed =
        canonical.slice(0, a) + canonical[b] + canonical.slice(a + 1, b) + canonical[a] + canonical.slice(b + 1);
      expect(() => canonicalRecoveryKey(transposed)).toThrow(RecoveryKeyMistypedError);
      swaps++;
    }
  }
  expect(swaps).toBeGreaterThan(100);
});

test('a key of the wrong length is refused with its length named', () => {
  const canonical = canonicalRecoveryKey(generateRecoveryKey());
  expect(() => canonicalRecoveryKey(canonical.slice(0, -1))).toThrow(/24/);
  expect(() => canonicalRecoveryKey(`${canonical}7`)).toThrow(/26/);
  expect(() => canonicalRecoveryKey('')).toThrow(RecoveryKeyMistypedError);
});
