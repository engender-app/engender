# The archive is a framed container with chunked AES-GCM

Status: Accepted
Decided: 2026-08-11
Last reviewed: 2026-11-02
Supersedes: none

An archive is a plaintext header (magic bytes, format version, Argon2id parameters, salt, chunk size, total chunk count) followed by the body encrypted as a sequence of AES-256-GCM chunks of about 1 MB (`src/lib/data/archive/container.ts`). Each chunk has its own nonce. Each chunk's AAD is the whole header followed by the chunk's index.

## Why

WebCrypto's AES-GCM does not stream. One-shot encryption needs the whole archive in memory twice, and years of progress photos run to hundreds of megabytes. Chunking keeps peak memory bounded on a phone.

The header is plaintext so unknown and corrupt files are rejected before any key is derived. Binding the header and chunk index into the AAD means truncating, reordering or re-labelling the file fails authentication. Without it, a truncated archive decrypts cleanly into a silently incomplete journal, which is the worst failure for a restore.

## Consequences

Version handling is asymmetric on purpose. A lower `formatVersion` is migrated on import by the payload ladder (`PAYLOAD_MIGRATIONS`, `codec.ts`). A higher one is refused as `UnsupportedArchiveError` with kind `newer-version`. A section name this build does not know is refused the same way. A known section an archive lacks reads as empty, so a new area needs no format bump. Sections removed before 1.0 are listed in `DROPPED_ARCHIVE_SECTION_NAMES` and skipped on restore.

The payload records `writer.app` and `writer.schema` from the build's app version and `LATEST_SCHEMA_VERSION`. They describe the writer and add no import gate. Archives without a stamp still restore.

The per-chunk nonce-then-ciphertext framing belongs to `aesGcm.ts` (`seal` and `open`), shared with the other stores that seal a byte string. This file owns only the header, chunk index and AAD binding. The key-derivation cost an archive may demand is capped on import (ADR-0013).

History: amended 2026-09 (chunk framing moved to `aesGcm.ts`) and later (writer stamp); folded 2026-11-02.