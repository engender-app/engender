# Photo metadata is stripped on normalize, not just resized

In addition to the resize-and-discard-original normalization in ADR-0008, importing
a photo strips all EXIF metadata — GPS/geolocation and device identifiers
included. Orientation is baked into the pixel data before the tag is dropped, so
rotation still renders correctly with no EXIF surviving into storage.

## Why

A photo diary tracking a gender transition is exactly the kind of data whose EXIF
GPS coordinates or device identifiers would be actively dangerous if the photo (or
an exported archive containing it) ever left the device unintentionally. The
normalize step already re-encodes every photo, so stripping metadata costs nothing
extra beyond the decision to do it.

## Consequences

Thumbnails, generated from the same normalized bytes, inherit the same
metadata-free guarantee with no separate handling.

One segment does survive, and it is not one of the ones this decision is about.
Chromium's canvas writes a 470-byte APP2 ICC colour profile into everything it
encodes, describing the colour space of the bytes it just produced. It is not
carried over from the photo: the browser tier normalizes two unrelated photos, one
of them carrying EXIF going in, and asserts the profile bytes are identical, which
they would not be if the source's own profile were surviving. Left in place because
dropping it means post-processing the JPEG to delete a segment, and colour would
shift on any viewer that assumes sRGB when no profile is present.

So the guarantee is exact rather than absolute: no EXIF (APP1), no XMP (also APP1),
no IPTC or Photoshop blocks (APP13), no comments (COM). An ICC profile can name a
device on some cameras, which is why it gets checked rather than waved through.
