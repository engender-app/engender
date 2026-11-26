# Scheduled archive KDF runs behind the Android bridge

Status: Accepted
Decided: 2026-08-31
Last reviewed: 2026-11-02
Supersedes: none

On Android, Argon2id derivation for scheduled backups runs natively inside `AutoExportPlugin`. The WebView receives a single-use derived key bound to one archive's random salt, and the saved backup password never enters JavaScript memory.

## Why

Scheduled encrypted backups run unattended, so they reuse a saved backup password kept in Keystore-wrapped preferences. If derivation ran in JavaScript, the bridge would have to hand the cleartext password to the page, and any script execution in the WebView could then read a long-lived secret that opens every archive in the backup destination. Gating that read behind biometrics would defeat unattended backups.

Deriving natively splits the KDF across the bridge. `packArchive` generates a fresh salt and asks the bridge for a key derived under it. That key opens only the one archive being packed, not past or future ones.

A later security review found the bridge also took its Argon2id cost (memory, iterations, parallelism, hash length) from the call. Anything that can reach the bridge from the page can already ask for the derived key; if it can also pick the cost, it can ask for one mebibyte at one iteration and grind the stored password offline, or a gigabyte and crash the app. The salt is per-archive and random, so it stays a call argument. The cost belongs to the archive format (ADR-0013), so it is pinned in `AutoExportPlugin` as `ARCHIVE_KDF_*` constants that match `ARCHIVE_ARGON2_PARAMS` in `crypto/params.ts` and apply whatever the call sends.

## Consequences

- `packArchive` (`data/archive/pack.ts`) takes an optional `KeyDerivation`. Web and manual export derive in JavaScript with `hash-wasm`; the Android scheduled path passes a function that calls `androidAutoExport.deriveKey` (`data/archive/folder-sync.ts`).
- `deriveKey` takes only a salt. `deriveArgon2id`, the raw primitive, still takes parameters, which is what the golden-vector agreement test exercises, but nothing untrusted reaches it through the bridge.
- No bridge method hands a secret back to the WebView: `passwordForScheduledBackup` and `revealPassword` are gone. The export settings read `status().hasPassword`, which reveals nothing.
- Native derivation uses BouncyCastle's `Argon2BytesGenerator` and produces byte-for-byte the same output as `hash-wasm` under the same salt and ADR-0013 parameters.
- The container format, headers and archive verifier are unchanged.

History: amended 2026-09 (cost pinned natively after a security review); trimmed 2026-11-02.