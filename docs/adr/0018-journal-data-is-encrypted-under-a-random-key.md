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
