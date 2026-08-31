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

/** The PIN as an encryption credential (ADR-0041, ticket 53), replacing the
    old compare-only app-lock profile.

    Four digits is 10,000 candidates, and no KDF cost closes a gap that
    small - so this profile is not what makes PIN mode defensible. The
    device binding is (data/device-secret.ts). There is exactly one wrap
    here and no second seal: the PIN is joined with a string only this
    device can produce, and the pair is what this profile derives from. So
    a keystore.json copied away from its device has no derivable secret at
    all. What this profile buys is the case where somebody has both halves
    and runs their own code, and there the honest figure is small. State
    it, don't dress it up.

    The arithmetic, at 64 MiB and 4 passes. Argon2id moves about 2 x m x t
    bytes of memory per guess - here 512 MiB - and a guessing rig is bound
    by memory bandwidth rather than arithmetic, so a 1000 GB/s card tops out
    near 1900 guesses/s:

      10,000 candidates / 1900 per second = about 5 seconds.

    Five seconds to walk the whole space, so about half that to expect a hit;
    the copy quotes the whole-space figure and says "all 10,000" so that the
    number and the claim match. It is the figure for an attacker who already
    holds both halves of the secret, which is why the copy sends anyone whose
    threat is a person with their unlocked device to passphrase mode.

    Cost to the person: 130ms measured on the benchmark desktop
    (scripts/benchmark-argon2.mjs), against 107ms for the archive profile in
    the same run - and the archive profile is the one ADR-0013 pitched at
    ~1s on a mid-range 2020 Android, so the ratio puts this near 1.2s
    there. Paid on a cold start and on a mid-session re-entry, which is
    about the most a PIN can cost before it stops being the convenient
    mode. */
export const PIN_ENCRYPTION_ARGON2_PARAMS: Argon2Params = {
  memorySize: 65536,
  iterations: 4,
  parallelism: 1,
  hashLength: 32
};

/** How many digits the pad collects. Four, by product decision (ticket 53):
    PIN mode is the convenient mode, and the device seal rather than the
    digit count is what carries it. Anything longer stops being a PIN. */
export const PIN_LENGTH = 4;

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
