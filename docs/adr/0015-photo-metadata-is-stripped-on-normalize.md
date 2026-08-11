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
