/* Argon2id parameters as data (ADR-0013): tuned per consumer, never
   inlined at the call site, so the archive's set can travel in its header
   and evolve without a code change breaking old archives.

   The numbers below are a starting point, not the decision - ADR-0013
   explicitly defers the exact values to benchmark.mjs run against real
   hardware. Re-tune them there and record the result in a follow-up ADR;
   don't hand-edit these without re-running the benchmark. */

export interface Argon2Params {
  /** Kibibytes of memory the KDF is allowed to use. */
  memorySize: number;
  iterations: number;
  parallelism: number;
  /** Output key length in bytes - 32 for AES-256. */
  hashLength: number;
}

/** Targets roughly one second on a mid-range 2020 Android device (ADR-0013).
    The archive key protects an export that can leave the device. */
export const ARCHIVE_ARGON2_PARAMS: Argon2Params = {
  memorySize: 65536,
  iterations: 3,
  parallelism: 1,
  hashLength: 32
};

/** Targets roughly 50-100ms (ADR-0013). The PIN's resistance comes from
    ticket 17's growing-delay throttle, not from hash cost - a 4-digit PIN
    only has 10,000 candidates regardless, and this runs many times a day. */
export const PIN_ARGON2_PARAMS: Argon2Params = {
  memorySize: 8192,
  iterations: 1,
  parallelism: 1,
  hashLength: 32
};

/** The Journal passphrase, ADR-0013's third consumer: paid on every cold
    start, so it cannot cost what the archive costs, but it is the wall
    between a copied keystore file and the data key, so it cannot cost what
    the PIN costs either. ~59ms on the benchmark desktop, which the archive
    path's ratio (107ms here ~ 1s on a mid-range 2020 Android) puts around
    half a second on the reference device. Memory-heavy rather than
    iteration-heavy, because memory is what prices out GPU guessing.

    These numbers are a starting point like the two sets above, and they are
    also *data*: the keystore stores the set it was written with (ticket 09),
    so re-tuning here changes new keystores without breaking old ones. */
export const JOURNAL_ARGON2_PARAMS: Argon2Params = {
  memorySize: 49152,
  iterations: 2,
  parallelism: 1,
  hashLength: 32
};
