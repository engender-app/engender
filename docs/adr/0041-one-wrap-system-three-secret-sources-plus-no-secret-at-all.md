# One wrap system, three secret sources, plus no secret at all

Status: Accepted
Decided: 2026-08-30
Last reviewed: 2026-11-02
Supersedes: ADR-0014 (merged in)
Amends: ADR-0018

The journal's access mode is one choice, made in one module (onboarding, and Settings to change it): **no secret** (device-bound), or a **secret-derived** key wrapped exactly like a passphrase-wrapped key, where the secret is a typed **passphrase**, a **PIN**, or a **biometric**-released value. `JournalAccessMode` is `'passphrase' | 'pin' | 'biometric' | 'device-bound' | 'unlocked' | null` (`data/journal-access-mode.ts`); the mode is read off the keystore's `secretSource` rather than tracked beside it. Product decision (2026-08-28): a four-digit PIN may encrypt, provided its real floor is sized and stated honestly. This overrides ADR-0014's earlier claim that a PIN cannot be the key.

## Why one wrap system

`createKeystore`, `unlockKeystore` and `rewrapKeystore` (`crypto/keystore.ts`) take a secret string and a KDF profile and do not care where the string came from. A PIN and a biometric value are strings. Each source gets its own consumer profile (ADR-0013); `pin-encryption` is heavier than a passphrase's.

## The PIN's real floor

Four digits is 10,000 candidates, and no KDF cost a cold start can afford closes that: a bandwidth-bound rig covers them all in about five seconds. So the heavy KDF does not carry the PIN. The PIN is **not the whole secret**: it is combined with a non-extractable HMAC key held on the device (`data/device-secret.ts`), and the KDF sees the pair. Somebody who copied `keystore.json` alone cannot start guessing. The five-second figure applies to an attacker who holds the device and runs their own code, and the setup copy says so and names passphrase mode for anyone whose threat is a person with their unlocked phone.

On the web the HMAC key lives in the browser's key store, so a whole-profile copy takes both halves and lands in the same five-second bucket. On Android it is an HMAC key under its own Keystore alias (`PinBindingKeystore`, `PinBindingPlugin`), outside the app's directory, so a copy of app data yields neither half. `KeystoreMetadata.pinBinding` (`'browser' | 'keystore'`) records which key wrapped a journal, because inferring it from the platform would report a correct PIN as wrong on a journal made before the move; the migration runs on the next correct PIN.

**PIN mode is tied to one device**, as device-bound mode is and passphrase mode is not. Losing the browser profile loses the journal unless the person has an archive (it survives losing the device) or a recovery key (ADR-0054; it survives losing the secret while the device remains). Neither replaces the other.

## Forgotten secrets and wrong attempts

A forgotten secret has no data-preserving recovery unless a recovery key exists. The way back is a clearly labeled reset on the lock gate that wipes local data and returns to onboarding (`data/reset.ts`, `JournalGate.svelte`), with the loss stated before it happens; an earlier archive still restores. PIN-set copy says this before the PIN is finished.

Wrong PIN attempts get a growing delay, never a wipe (`lock/throttle.ts`, `lock/pin-throttle.ts`): the first miss is free, then the wait grows to a one-minute cap, and the count survives a reload. Android keeps the authoritative count natively. An automatic wipe after N misses was rejected: on top of the deliberate reset it becomes an accidental way to lose everything, tripped by a bored kid or a mis-tap. The throttle prices out somebody typing at the device and is worth nothing against the offline attack, which never loads the app's code. It is not the reason four digits may encrypt.

## Biometric is not one mechanism across platforms

**Android** already has it: device-bound mode's key is in Keystore, which releases it only after the platform confirms who is present. Copy names this; there is no second mechanism.

**The web** uses the WebAuthn PRF extension (`data/journal-biometric.ts`). The credential is non-discoverable with `userVerification: 'required'`, so it takes no authenticator slot and a silently satisfied assertion cannot pass. Credential id and PRF salt live in the keystore metadata, and `parseKeystore` refuses a biometric keystore missing either. A PRF output is 32 bytes of authenticator entropy, so `biometric-prf` shares the passphrase profile's budget. Detection is conservative (`getClientCapabilities()` reports `prf`, plus a user-verifying platform authenticator); where a browser cannot be asked, the mode is absent. A platform that advertises PRF and returns nothing fails as "not available here", never as a wrong secret.

## Unlocked mode and switching

`'unlocked'` keeps the journal encrypted at rest but gated by nothing. On Android it uses a second Keystore alias (`engender-unlocked-key`, authentication not required), so a cold boot opens straight to Home while a copy of app data still yields only ciphertext. `JournalKeystore` can wrap an existing 32-byte data key under either variant, so switching to device-bound or unlocked on Android re-wraps instantly without re-encrypting; an interrupted switch leaves one mode or the other, with the gated one taking precedence.

## Fresh proof before changing protection

An open journal does not suffice to change its access mode. Each change needs the current PIN, current passphrase or a fresh biometric check; Android biometrics cannot fall back to the device lock. Web device-bound mode is the exception, since no secret exists and the open session supplies authority. Android unlocked mode needs fresh biometrics or the existing recovery key. Approval belongs to one operation and one journal session, and cancellation, lock, reset, session replacement or a credential change invalidates it (`data/credential-ownership.ts`). A successful recovery unlock supplies one-use proof for immediate protection setup only.

## Rejected

A PIN that only gates a UI lock screen (the old shape) and keeping the old app-lock gate beside a PIN access mode: one word, one meaning. A single biometric mechanism reused verbatim on both platforms: Android needs no new crypto, and the web has no primitive but PRF.

History: amended 2026-08-31, 2026-09-01, 2026-09-03, 2026-09-10 and 2026-10-14 (PIN cost, Keystore binding, recovery key, unlocked mode, fresh proof); absorbed ADR-0014 2026-11-02.