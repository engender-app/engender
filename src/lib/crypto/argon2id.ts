/* Argon2id key derivation (ticket 12), identical code on web and Android -
   hash-wasm bundles its WASM as base64 rather than fetching it, so this
   introduces no runtime network request (Notes: re-verify once wired in,
   README claims and runtime behavior have diverged before). */

import { argon2id } from 'hash-wasm';
import type { Argon2Params } from './params.ts';

/** Derives a key from a password (or PIN) and salt under the given
    parameter set. Never logs `password` or the returned key. */
export async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  params: Argon2Params
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await argon2id({
    password,
    salt,
    iterations: params.iterations,
    parallelism: params.parallelism,
    memorySize: params.memorySize,
    hashLength: params.hashLength,
    outputType: 'binary'
  });
  return key as Uint8Array<ArrayBuffer>;
}

/** A fresh random salt, sized for Argon2id's recommended minimum (16 bytes). */
export function randomSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(16));
}
