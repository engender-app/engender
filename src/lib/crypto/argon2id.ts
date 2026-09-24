/* Argon2id key derivation (ticket 12), identical code on web and Android -
   hash-wasm bundles its WASM as base64 rather than fetching it, so this
   introduces no runtime network request (Notes: re-verify once wired in,
   README claims and runtime behavior have diverged before). */

import { argon2id } from 'hash-wasm';
import type { Argon2Params } from './params.ts';

/* Argon2id runs in a worker where there is one (ux-carpet ticket 209): on
   the main thread it held rendering for 64ms at full speed and 263ms at 4x
   CPU on every passphrase or PIN unlock, the demo's included. Same call,
   same parameters (ADR-0013) - argon2id.worker.ts - only another thread.
   Without a worker (the node tier, which tests this module) it runs here as
   it always did, and so does a derivation whose worker fails to start: a
   slower unlock is better than none. */
let prewarmed: Worker | null = null;

function argon2Worker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./argon2id.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

/** Starts a worker and lets it compile hash-wasm's wasm before any secret
    exists, so the first derivation of a cold boot does not also pay for
    that. Holds nothing: the worker gets a secret only from `deriveKey`. */
export function prewarmArgon2(): void {
  if (!prewarmed) prewarmed = argon2Worker();
}

function inThread(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  params: Argon2Params
): Promise<Uint8Array<ArrayBuffer>> {
  return argon2id({
    password,
    salt,
    iterations: params.iterations,
    parallelism: params.parallelism,
    memorySize: params.memorySize,
    hashLength: params.hashLength,
    outputType: 'binary'
  }) as Promise<Uint8Array<ArrayBuffer>>;
}

/** Derives a key from a password (or PIN) and salt under the given
    parameter set. Never logs `password` or the returned key. */
export async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  params: Argon2Params
): Promise<Uint8Array<ArrayBuffer>> {
  const worker = prewarmed ?? argon2Worker();
  prewarmed = null;
  if (!worker) return inThread(password, salt, params);
  const answer = await new Promise<{ ok: true; key: Uint8Array<ArrayBuffer> } | { ok: false; error?: string; loadFailed?: boolean }>(
    (resolve) => {
      worker.onmessage = (event) => resolve(event.data);
      worker.onerror = (event) => {
        event.preventDefault();
        resolve({ ok: false, loadFailed: true, error: event.message });
      };
      /* The salt is copied, not transferred: the caller still holds it to
         write beside the wrapped key. */
      worker.postMessage({ password, salt, params });
    }
  );
  worker.terminate();
  if (answer.ok) return answer.key;
  /* A worker that never ran - blocked, or its module failed to load - says
     nothing about the secret, so the derivation happens here instead. One
     that ran and failed is a real argon2id failure, and fails the same way
     the in-thread call would. */
  if ('loadFailed' in answer && answer.loadFailed) {
    console.warn('argon2id worker did not start; deriving on the main thread', answer.error);
    return inThread(password, salt, params);
  }
  throw new Error(answer.error ?? 'argon2id failed');
}

/** A fresh random salt, sized for Argon2id's recommended minimum (16 bytes). */
export function randomSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(16));
}
