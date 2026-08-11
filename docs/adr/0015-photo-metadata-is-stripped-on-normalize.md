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
encodes, describing the colour space of the bytes it just produced.

An ICC profile is one of the places a camera can put a device name, so the browser
tier establishes where this one comes from rather than assuming. Two fixtures, both
checked to be what they claim before they are used: a source with its profile
stripped out comes back with one, so the encoder is what adds it; and a source
carrying a forged, recognisable profile comes back without it, so nothing is carried
over from the photo. Comparing two canvas-made photos would have proved neither,
since both already carry the same profile going in.

Left in place because dropping it means post-processing the JPEG to delete a
segment, and colour would shift on any viewer that assumes sRGB when no profile is
present.

So the guarantee is exact rather than absolute: no EXIF (APP1), no XMP (also APP1),
no IPTC or Photoshop blocks (APP13), no comments (COM). An ICC profile can name a
device on some cameras, which is why it gets checked rather than waved through.
