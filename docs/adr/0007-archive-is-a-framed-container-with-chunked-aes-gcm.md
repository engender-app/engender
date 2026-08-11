# The archive is a framed container with chunked AES-GCM

An archive is a plaintext header (magic bytes, format version, Argon2id parameters,
salt) followed by the body encrypted as a sequence of AES-256-GCM chunks of roughly
1 MB. Each chunk carries its own nonce, and each chunk's index and the total chunk
count go into the AAD.

## Why

WebCrypto's AES-GCM does not stream. Encrypting an archive in one shot needs the
whole thing in memory twice, and years of progress photos plausibly run to hundreds
of megabytes; base64-ing them into a JSON document would add another third on top.
Chunking keeps peak memory bounded on a phone.

The header must be plaintext because F14 requires unknown and corrupt files to be
rejected safely, which is only possible if the version and the key-derivation
parameters can be read before any decryption is attempted.

Binding the chunk index and total count into the AAD means truncating or reordering
the file fails authentication. Without it, a truncated archive decrypts cleanly
into a silently incomplete journal, which is the worst possible failure for a
restore.

## Consequences

Version handling is asymmetric on purpose: any `formatVersion` lower than the
current one is migrated on import, and anything higher is refused rather than
attempted.
