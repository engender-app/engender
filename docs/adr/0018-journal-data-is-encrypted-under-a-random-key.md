# Journal data is encrypted under a random key

Status: Accepted
Decided: 2026-08-12
Last reviewed: 2026-11-02
Supersedes: none

The live journal is encrypted under a random data key, never directly under an access secret. On Android the key is protected by Android Keystore. On the web, `keystore.json` in the OPFS root holds the Argon2id parameters (stored as data so they can evolve per keystore, ADR-0013), a salt, and the data key wrapped with AES-GCM under the derived key. The unwrapped key lives in worker and page memory only, so it is gone when the browser process is. The database itself is keyed with the raw data key (`PRAGMA hexkey`, ADR-0020), never with the secret, so stretching happens once, in the wrap. Which secrets can open the wrap (passphrase, PIN, biometric, or none) is ADR-0041.

## Why

The old PIN has 10,000 values and exists to stop a casual glance. As the encryption key it would give a misleading guarantee. Persisting a usable web key beside the ciphertext would make the claim equally weak. A random data key also lets the person change an access secret without rewriting the journal.

## Consequences

**Coverage.** Encryption covers the database, its side files, migration copies, photos, thumbnails, temporary imports, sensitive boot data and caches. A release cannot claim the local journal is encrypted until closed-app inspection finds none of the protected content in plaintext. `tests/browser-tier/encryption-probe.ts` is that gate on the web: it scans the SAHPool pool files, the pre-migration copy, photos, thumbnails and localStorage byte for byte.

**What stays outside, and must be named in any claim copy.** The keystore metadata, which survives disclosure without the secret; the localStorage boot mirror (display and language preferences, lock timing, the disguise setting and the cached access mode, `data/prefs/boot-cache.ts`); paraglide's locale record; and the PIN throttle's attempt timestamps. None of it is journal content. The PIN hash is not in the mirror: a hash with 10,000 preimages beside the ciphertext would be an offline-guessable secret. Imports stream through memory and touch no temporary file.

**Journal text in browser storage is inside the encryption or absent.** The entry editor mirrors its draft to localStorage so a killed process can resume. That draft is journal content, so it is sealed with AES-256-GCM under the session data key (`crypto/aesGcm.ts`, the storage key as additional authenticated data). A draft that outlives a reset decrypts to nothing, and one that will not decrypt is discarded. Recent search terms are session memory only (`recentSearches.ts`): a search term is journal content the moment it echoes a diagnosis or a drug, and nothing needs it after the process ends.

**Plaintext-era journals are refused, not converted.** A journal from before encryption shipped meets a plain refusal screen (`legacy-journal.ts`, the `legacy-refused` boot plan); the app never reports itself encrypted over a partly plaintext journal.

**Forgotten credentials.** The app cannot recover a forgotten secret. Setup says so and tells the person to save a passphrase in a password manager. The one exception is opt-in: a recovery key (ADR-0054) is a second wrap of the same data key that the person writes down and keeps off the device. No flow mints one unasked. So the honest claim has two halves: the app cannot recover a forgotten credential, and a forgotten credential ends the journal only for a person who made no recovery key. Every screen that states the first half names the exception.

Memory inspection, a compromised unlocked operating system, and a person using an already unlocked app stay outside this guarantee. Platform copy states any difference that survives testing.

History: amended 2026-08-18 (web boundary as implemented), 2026-08-20 (plaintext conversion; since removed in favor of refusal), 2026-09-03 (recovery key, ADR-0054), and in two security reviews before release (entry draft sealed, recent searches made session-only); demo and walkthrough notes dropped 2026-11-02.