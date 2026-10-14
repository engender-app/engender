import { afterEach, test, expect, vi } from 'vitest';
import {
  RECOVERY_KEY_LENGTH,
  RecoveryKeyMistypedError,
  canonicalRecoveryKey,
  generateRecoveryKey
} from './recoveryKey.ts';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
afterEach(() => vi.restoreAllMocks());

test('fixed random bytes produce the known recovery key', () => {
  let draws = 0;
  const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
    draws++;
    if (draws > 10) throw new Error('recovery key did not accept ten deterministic draws');
    const bytes = array as Uint8Array;
    bytes.forEach((_, i) => { bytes[i] = (i * 37 + 5 + draws * 11) & 255; });
    return array;
  });

  expect(generateRecoveryKey()).toBe('20TNM-ZX4S7-Q16E2-XGAKW-SW8P1');
  expect(random).toHaveBeenCalledOnce();
});

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
});

test('two keys are never the same', () => {
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

test.each(['I', 'i', 'L', 'l'])("Crockford's %s reads as 1, and O reads as 0", (one) => {
  const canonical = '20TNMZX4S7Q16E2XGAKWSW8P1';
  expect(canonicalRecoveryKey(canonical.replace(/1/g, one).replace(/0/g, 'O'))).toBe(canonical);
  expect(canonicalRecoveryKey(canonical.replace(/0/g, 'o'))).toBe(canonical);
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
