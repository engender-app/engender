# Journal data is encrypted under a random key

The live Journal is encrypted under a random data key rather than directly under
the app-lock PIN. Android protects that key through Android Keystore. The web wraps
it with a key derived from a Journal passphrase and requires that passphrase again
after the browser process or unlocked session ends. This keeps a usable key out of
persistent browser storage while allowing Android to use its hardware-backed key
store.

## Why

The current PIN has only 10,000 values and exists to stop a casual glance. Making
it the encryption key would provide a misleading guarantee and make PIN recovery
impossible without admitting a bypass. Persisting a usable web key beside the
ciphertext would make the encryption claim equally weak. A random data key also
allows the person to change an access secret without rewriting the whole Journal.

## Consequences

Encryption covers the database, SQLite side files, migration copies, photos,
thumbnails, temporary imports, sensitive boot data and caches. A release cannot
claim that the local Journal is encrypted until closed-app file inspection finds
none of the protected content in plaintext.

The app-lock PIN may grant shorter access while an unlocked key is available, but
it remains a separate control. Forgotten credentials have no data-preserving
recovery. Setup tells the person to save the Journal passphrase in a password
manager and states that Gender Diary cannot recover it.

Memory inspection, a compromised unlocked operating system, and a person who can
use an already unlocked app remain outside this guarantee. Platform-specific copy
must state any difference that survives implementation and testing.

## Amended by ticket 09: the web boundary, as implemented

The web keystore is a JSON file in the OPFS root: Argon2id parameters (a salt
and the tuned set of ADR-0013's third consumer, stored as data so they can
evolve per keystore), and the data key wrapped with AES-GCM under the derived
key. Everything in that file survives disclosure without the passphrase; the
unwrapped key lives in worker and page memory only, so it is gone when the
browser process is. The database itself is keyed with the raw data key
(`PRAGMA hexkey`), never with the passphrase - stretching happens once, in
the wrap.

What deliberately stays outside the encryption on the web, and must be named
in any claim copy, is exactly this: the keystore metadata above; the
localStorage boot mirror, now reduced to theme, palette, language,
lock-on-leave and disguise (the PIN hash left it with this ticket - a hash
with 10,000 preimages beside the ciphertext was an offline-guessable secret);
paraglide's own locale record; and the PIN throttle's attempt timestamps.
None of it is journal content. Imports stream through memory and touch no
temporary file. The claim gate scans everything else - SAHPool pool files,
the pre-migration copy, photos, thumbnails - byte for byte
(tests/browser-tier/encryption-probe.ts).

A journal from before this ticket is refused with a plain message rather
than opened or silently replaced; converting it is ticket 10's job. Demo
builds create and unlock a fixed passphrase themselves so the walkthrough
suite and reviewers land in the journal - the mechanism is identical, only
the typing is skipped, and none of it ships in a production bundle.
