# Photos are normalized to JPEG on import, stripped of metadata, and originals are not kept

Status: Accepted
Decided: 2026-08-11
Last reviewed: 2026-11-02
Supersedes: ADR-0015 (merged in)

A photo added to an entry, milestone or document is decoded once and re-encoded to JPEG, at most 2048px on the long edge (`MAX_EDGE`, never upscaled), under an opaque `<uuid>.jpg` name, with a stored thumbnail of at most 320px. The originally selected file is not kept. The re-encode through a canvas carries no metadata across: no EXIF (GPS and device identifiers included), no XMP, no IPTC, no comments. Orientation is baked into the pixels at decode (`imageOrientation: 'from-image'`) before the tag is gone. The thumbnail comes from the same decoded image and inherits the guarantee. All of it is `src/lib/data/photos/normalize-pixels.ts`.

## Why

Phone cameras produce 4 to 12 MB per shot. Left as picked, a few years of progress photos make the encrypted archive impractical to produce and share, which undermines backup health, the thing that matters most in a local-first app. 2048px is well above what the compare view or any export needs, and without thumbnails the photo library decodes every full image at once.

A photo diary of a transition is exactly the data whose GPS coordinates or device identifiers would be dangerous if a photo or archive left the device. The re-encode already happens, so stripping costs nothing extra.

Names are opaque and resolved against a per-platform root, because an absolute OPFS path cannot round-trip to Android and archives must import on either platform. The thumbnail name is derived from the photo's, not stored (ADR-0010).

## Consequences

**Lossy and irreversible**, and it applies to photos whose purpose is showing small changes over years. Accepted deliberately against archives too large to export. A file over 50 MB or one the browser cannot decode (HEIC included) is refused with a message, not stored.

The guarantee is exact, not absolute: Chromium's canvas writes its own ICC colour profile into every JPEG it encodes. It is kept because deleting the segment means post-processing the JPEG, and colour would shift on viewers that assume sRGB. A profile can name a device on some cameras, so the browser tier proves where this one comes from (`tests/browser-tier/photos-probe.ts`): a source with its profile stripped comes back with one, so the encoder adds it, and a source with a forged profile comes back without it, so nothing is carried over.

Photo files sit outside the SQL transaction that deletes their rows, so a killed process leaves unreferenced files. An orphan sweep lists the directory after the database opens and deletes anything no row references. It runs after a restore, after a failed file delete, and weekly (`sqlite/orphan-sweep-schedule.ts`).

History: absorbed ADR-0015 (metadata stripping, ICC note) 2026-11-02; orphan sweep changed from every boot to after-restore, after-failure and weekly.