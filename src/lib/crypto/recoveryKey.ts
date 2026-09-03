/* The recovery key's own form (ADR-0054, ticket sec-01): the string a
   person writes down, and the one thing that turns it back into a secret
   the KDF can take.

   Nothing here is cryptography - the wrap is `keystore.ts`'s, unchanged.
   What this module owns is that a key can be read off paper by somebody
   who is not a computer, and that a key typed slightly wrong is told apart
   from a key that is simply not this journal's. Those are two different
   sentences at the gate, and the check symbol is the only thing that can
   distinguish them: a wrong key and a mistyped key both fail the wrap
   identically (aesGcm.ts deliberately cannot tell a wrong key from
   corruption), so a wrong-key message on a typo would send somebody
   looking for different paper.

   Deliberately rune-free and DOM-free, so it runs in the Node tier next to
   the rest of the pure model (ADR-0017). */

/** Crockford base32: the digits and the alphabet with I, L, O and U left
    out, so nothing in a written key can be confused for 1, 0 or a word. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 15 random bytes, which is the whole reason the numbers below are what
    they are: 15 x 8 is exactly 24 x 5, so the bytes and the symbols are a
    bijection with no padding, no bits that are always zero, and no partial
    leading symbol. 120 bits is not a compromise against a bigger number -
    at 2^120 the paper is the attack and the arithmetic is not. */
const KEY_BYTES = 15;

/** 24 symbols carrying the key, plus one check symbol, shown as five
    groups of five. The grouping is for whoever is copying this off a
    screen by hand, which is the only way it ever gets used.

    24 x 5 is 120 bits, less about a fifth of one for the redraw below, and
    that figure is stated in ADR-0054 rather than exported from here: no
    interface copy quotes it - the screens say "25 characters", which is
    what a person is being asked to write down - so a constant for it would
    have had one reader, its own test. */
const DATA_SYMBOLS = 24;
const GROUP_SIZE = 5;

/** The canonical length: the data symbols and the check symbol, with no
    separators. This is the form the KDF sees. */
export const RECOVERY_KEY_LENGTH = DATA_SYMBOLS + 1;

/** Thrown for a key that cannot be what was written down - a wrong length,
    a symbol outside the alphabet, or a check symbol that disagrees with
    the rest. Distinct from DecryptionFailedError on purpose: this one
    means "check what you typed", and retyping it might well work. */
export class RecoveryKeyMistypedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoveryKeyMistypedError';
  }
}

/* The check symbol makes the whole written key, read as a base-32 number
   over all 25 of its symbols, divisible by 37. Two properties follow, and
   both are why 37 rather than a sum or a smaller modulus:

   A single wrong symbol shifts the total by d x 32^i where d is at most 31
   in either direction. 37 is prime and larger than 31, so that can never
   land back on a multiple of 37. Every one-symbol slip is caught.

   Swapping two symbols shifts it by (b - a) x (32^i - 32^j). The first
   factor is never zero modulo 37 for the same reason; the second is zero
   only when the positions are 36 apart, and a key is 25 long. So every
   transposition is caught too, which a summed checksum catches none of.

   The check symbol has to be inside the run for that second property to
   hold at every position. Computing it over the 24 data symbols alone -
   Crockford's own framing, and the first thing this module did - leaves
   exactly one hole, because 32^18 is congruent to -1 modulo 37: swapping
   the symbol at that one position with the check symbol always produced a
   key that validated. The transposition test found it.

   The remainder can be any of 37 values and the alphabet has 32, so
   generation redraws when it cannot be written (`generateRecoveryKey`).
   That conditions the key on a public property of itself and costs about a
   fifth of one bit. */
const CHECK_MODULUS = 37n;

/** The symbols, read as one base-32 number, modulo 37. */
function remainder(symbols: string): number {
  let value = 0n;
  for (const symbol of symbols) value = (value * 32n + BigInt(ALPHABET.indexOf(symbol))) % CHECK_MODULUS;
  return Number(value);
}

/** The symbol that makes `data` plus itself divisible by 37, or null when
    that symbol is one the alphabet cannot write. */
function checkSymbol(data: string): string | null {
  const needed = (CHECK_MODULUS - BigInt(remainder(data)) * 32n % CHECK_MODULUS) % CHECK_MODULUS;
  return needed < BigInt(ALPHABET.length) ? ALPHABET[Number(needed)] : null;
}

function encodeSymbols(bytes: Uint8Array): string {
  let bits = 0;
  let carry = 0;
  let out = '';
  for (const byte of bytes) {
    carry = (carry << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(carry >> bits) & 31];
      carry &= (1 << bits) - 1;
    }
  }
  return out;
}

const group = (canonical: string): string =>
  (canonical.match(new RegExp(`.{1,${GROUP_SIZE}}`, 'g')) ?? []).join('-');

/** A fresh key, in the form it is shown and written down: five groups of
    five, separated by hyphens. Feed it back through
    `canonicalRecoveryKey` to get the secret - minting through the parser
    rather than beside it means a generator that disagreed with the parser
    could not ship. */
export function generateRecoveryKey(): string {
  for (;;) {
    const data = encodeSymbols(crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
    const check = checkSymbol(data);
    if (check !== null) return group(data + check);
  }
}

/** The secret, from whatever somebody typed. Case is ignored, separators
    and spaces are ignored, and Crockford's substitutions are applied: I
    and L are 1, O is 0. U is not substituted and is an error, which is the
    reason it is not in the alphabet - it is never in a real key, so a U is
    always a slip rather than something to guess at.

    Throws RecoveryKeyMistypedError for anything that cannot be a key.
    Never throws for a well-formed key that happens to be the wrong one:
    that is the wrap's answer to give, not this module's. */
export function canonicalRecoveryKey(typed: string): string {
  const stripped = typed.replace(/[\s-]/g, '').toUpperCase();
  const canonical = stripped.replace(/[IL]/g, '1').replace(/O/g, '0');

  if (canonical.length !== RECOVERY_KEY_LENGTH) {
    throw new RecoveryKeyMistypedError(
      `a recovery key is ${RECOVERY_KEY_LENGTH} characters, and this one is ${canonical.length}`
    );
  }
  for (const symbol of canonical) {
    if (!ALPHABET.includes(symbol)) {
      throw new RecoveryKeyMistypedError(`a recovery key has no ${symbol} in it`);
    }
  }

  if (remainder(canonical) !== 0) {
    throw new RecoveryKeyMistypedError('that is not quite a recovery key - one character is off');
  }

  return canonical;
}
