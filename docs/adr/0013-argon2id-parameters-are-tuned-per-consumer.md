# Argon2id parameters are tuned per consumer, not shared

Status: Accepted
Decided: 2026-08-11
Last reviewed: 2026-11-02
Supersedes: none

Each consumer of a secret has its own Argon2id parameter set, written as data in `src/lib/crypto/params.ts`, never inlined at a call site. The archive password targets roughly one second on a mid-range 2020 Android device. The Journal passphrase costs less, because it is paid on every cold start. The PIN, now an encryption credential (ADR-0041), has its own profile. The archive's set travels in its header (ADR-0007), so it can evolve without breaking old archives. The keystore likewise stores the set it was written with.

## Why

The archive key protects an export that can sit anywhere. The Journal passphrase is the wall between a copied keystore file and the data key, so it cannot be cheap, but it is paid on every cold start, so it cannot cost what the archive costs. A four-digit PIN has 10,000 values whatever the hash costs, so its KDF cost is not what makes PIN mode defensible. The device binding is, and `params.ts` states the small figure plainly. Paying archive-grade cost on every PIN entry would add latency to something done many times a day for no security gain.

## Consequences

The numbers come from benchmarking real hardware (`scripts/benchmark-argon2.mjs`) and are re-tuned there, not hand-edited. Which consumer takes the current profile and which the persisted one is declared in `src/lib/crypto/credential-consumers.ts`, so archive, passphrase, PIN, biometric and recovery-key flows do not pick profiles at their call sites.

An archive is untrusted input. Import refuses a header whose parameters exceed `ARCHIVE_ARGON2_MAX_PARAMS` as corrupt, before any key is derived (`kdf-cost-cap.test.ts`). Export keeps the released default.

Losing the archive password is unrecoverable by design. The app warns plainly when the password is set and again before any encrypted export.

History: amended 2026-08 to 2026-10 (Journal passphrase as third consumer, consumer registry, import cost ceiling); the app-lock PIN-hash profile was retired with the gate it served, and ADR-0014's throttle now lives in ADR-0041; folded 2026-11-02.