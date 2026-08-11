/* The PIN as it is stored: a salted Argon2id hash and nothing else
   (ticket 17). The plaintext PIN exists only as an argument here and in
   whatever component collected the digits; nothing writes it anywhere.

   The record carries the parameters it was made with, for the same reason
   the archive header does (ADR-0013): PIN_ARGON2_PARAMS is a benchmark
   result, not a constant of nature, and re-tuning it must not lock out
   everyone who set a PIN under the old numbers.

   This is a UI gate, not encryption - the derived bytes protect nothing
   but the comparison below, and the journal itself is readable to anyone
   holding the browser profile (PRD, ADR-0014). Copy on the lock screen
   must not suggest otherwise. */

import { deriveKey, randomSalt } from '../crypto/argon2id.ts';
import { PIN_ARGON2_PARAMS, type Argon2Params } from '../crypto/params.ts';

const RECORD_VERSION = 'v1';

/** `v1$memory$iterations$parallelism$length$salt$hash`, the last two
    base64. One string, because a preference is one value. */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomSalt();
  const hash = await deriveKey(pin, salt, PIN_ARGON2_PARAMS);
  return [
    RECORD_VERSION,
    PIN_ARGON2_PARAMS.memorySize,
    PIN_ARGON2_PARAMS.iterations,
    PIN_ARGON2_PARAMS.parallelism,
    PIN_ARGON2_PARAMS.hashLength,
    base64(salt),
    base64(hash)
  ].join('$');
}

/** False rather than a throw for a missing or damaged record: the mirror
    it comes from is hand-editable localStorage, and a lock screen that
    crashes is a lock screen with no way to reach the reset action. */
export async function verifyPin(pin: string, record: string | null): Promise<boolean> {
  // hash-wasm rejects an empty password outright, and no record was ever
  // made from one, so the answer is false rather than a thrown error.
  if (!pin) return false;
  const parsed = parseRecord(record);
  if (!parsed) return false;
  const attempt = await deriveKey(pin, parsed.salt, parsed.params);
  return equalBytes(attempt, parsed.hash);
}

interface PinRecord {
  params: Argon2Params;
  salt: Uint8Array<ArrayBuffer>;
  hash: Uint8Array<ArrayBuffer>;
}

function parseRecord(record: string | null): PinRecord | null {
  if (!record) return null;
  const [version, memorySize, iterations, parallelism, hashLength, salt, hash, ...rest] = record.split('$');
  if (version !== RECORD_VERSION || rest.length > 0) return null;

  const params = {
    memorySize: Number(memorySize),
    iterations: Number(iterations),
    parallelism: Number(parallelism),
    hashLength: Number(hashLength)
  };
  if (Object.values(params).some((value) => !Number.isInteger(value) || value <= 0)) return null;

  try {
    return { params, salt: fromBase64(salt), hash: fromBase64(hash) };
  } catch {
    return null;
  }
}

/** Compares every byte whatever it finds, so how long a wrong PIN takes to
    reject says nothing about how much of it was right. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) throw new Error('not base64');
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
