/* Argon2id off the main thread (ux-carpet ticket 209).

   One derivation per worker: the caller posts the secret, the salt and the
   parameter set, gets the key back, and terminates the worker. hash-wasm's
   own memory held the secret and the key while it worked, and a worker that
   is gone takes that memory with it, which a long-lived one would not.

   The same `argon2id` call with the same parameters as argon2id.ts's
   in-thread path (ADR-0013); only the thread it runs on changed. Importing
   hash-wasm is what compiles its bundled wasm, so a worker started early
   (argon2id.ts, `prewarmArgon2`) has that done before a secret exists. */

import { argon2id } from 'hash-wasm';
import type { Argon2Params } from './params.ts';

type Request = { password: string; salt: Uint8Array<ArrayBuffer>; params: Argon2Params };

onmessage = async (event: MessageEvent<Request>) => {
  const { password, salt, params } = event.data;
  try {
    const key = (await argon2id({
      password,
      salt,
      iterations: params.iterations,
      parallelism: params.parallelism,
      memorySize: params.memorySize,
      hashLength: params.hashLength,
      outputType: 'binary'
    })) as Uint8Array<ArrayBuffer>;
    postMessage({ ok: true, key }, { transfer: [key.buffer] });
  } catch (error) {
    postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
