/* Reading JPEG segment structure, for tests only.

   ADR-0015 says a normalized photo carries no EXIF - no GPS, no device
   identifiers, nothing. That is a claim about bytes, so proving it needs
   something that walks the segments of the output and reports what it
   finds. Production never asks this question: normalize() re-encodes
   through a canvas, which cannot emit metadata in the first place. The
   check exists to catch the day that stops being true.

   Both tiers use it - the Node tier over synthetic JPEGs built by
   jpegWith(), the browser tier over what a real canvas actually produced. */

/** Metadata-bearing segments found before the compressed data starts.
    APP0/JFIF is structural (density and thumbnail geometry, no camera or
    location data) and is what a canvas legitimately writes, so it is not
    reported. Everything else in APP1..APP15 is: EXIF and XMP ride in
    APP1, Photoshop/IPTC in APP13, and COM is a free-text comment. */
export function metadataMarkers(jpeg: Uint8Array): string[] {
  return [...metadataSegments(jpeg)].map((segment) => segment.name);
}

/** The body of the one segment named `name`, or null. Lets a test ask not
    just whether a segment is there but where it came from - the same bytes
    under two different source photos means the encoder wrote it, not the
    photo. */
export function segmentBody(jpeg: Uint8Array, name: string): Uint8Array | null {
  for (const segment of metadataSegments(jpeg)) if (segment.name === name) return segment.body;
  return null;
}

function* metadataSegments(jpeg: Uint8Array): Generator<{ name: string; body: Uint8Array }> {
  if (jpeg.length < 2 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return;

  let i = 2;
  while (i + 3 < jpeg.length) {
    if (jpeg[i] !== 0xff) break;
    const marker = jpeg[i + 1];
    // SOS: entropy-coded data follows and is no longer segment-structured.
    if (marker === 0xda || marker === 0xd9) break;
    const length = (jpeg[i + 2] << 8) | jpeg[i + 3];
    if (length < 2) break;
    const end = i + 2 + length;

    const isApp = marker >= 0xe0 && marker <= 0xef;
    if (isApp && marker !== 0xe0) {
      yield { name: `APP${marker - 0xe0}${identifierAt(jpeg, i + 4, end)}`, body: jpeg.slice(i + 4, end) };
    } else if (marker === 0xfe) {
      yield { name: 'COM', body: jpeg.slice(i + 4, end) };
    }
    i = end;
  }
}

/** The NUL-terminated ASCII identifier an APPn segment opens with
    ("Exif", "http://ns.adobe.com/xap/1.0/"), as "/Exif". Segments without
    a readable one report nothing beyond their number. */
function identifierAt(jpeg: Uint8Array, from: number, end: number): string {
  let text = '';
  for (let i = from; i < end && i < jpeg.length; i++) {
    const byte = jpeg[i];
    if (byte === 0x00) break;
    if (byte < 0x20 || byte > 0x7e) return '';
    text += String.fromCharCode(byte);
    if (text.length > 32) break;
  }
  return text ? `/${text}` : '';
}

/** A structurally valid JPEG carrying the given segments, for testing the
    reader above. The compressed data is a stub: nothing here decodes it. */
export function jpegWith(segments: { marker: number; body: Uint8Array }[]): Uint8Array {
  const parts: number[] = [0xff, 0xd8];
  for (const { marker, body } of segments) {
    const length = body.length + 2;
    parts.push(0xff, marker, (length >> 8) & 0xff, length & 0xff, ...body);
  }
  parts.push(0xff, 0xda, 0x00, 0x02, 0x00, 0x00);
  return new Uint8Array(parts);
}

export const ascii = (text: string): Uint8Array =>
  new Uint8Array([...text].map((c) => c.charCodeAt(0)));

/** The same JPEG with every APP2 ICC_PROFILE segment taken out.

    Needed because a canvas writes its own colour profile into everything
    it encodes, so a fixture built by a canvas cannot be used to ask where
    an output's profile came from - both sides would already match. Strip
    it and the question has an answer. */
export function withoutIccProfile(jpeg: Uint8Array): Uint8Array {
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  while (i + 3 < jpeg.length) {
    if (jpeg[i] !== 0xff) break;
    const marker = jpeg[i + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = (jpeg[i + 2] << 8) | jpeg[i + 3];
    if (length < 2) break;
    const end = i + 2 + length;
    const isIcc = marker === 0xe2 && identifierAt(jpeg, i + 4, end) === '/ICC_PROFILE';
    if (!isIcc) out.push(...jpeg.slice(i, end));
    i = end;
  }
  return new Uint8Array([...out, ...jpeg.slice(i)]);
}

/** The same JPEG with an APP2 segment claiming to be an ICC profile, whose
    bytes are recognisable nonsense. If this ever comes back out of
    normalize(), the encoder is carrying the source's profile through. */
export function withFakeIccProfile(jpeg: Uint8Array): Uint8Array {
  const body = new Uint8Array([...ascii('ICC_PROFILE'), 0x00, ...ascii('NOT-A-REAL-PROFILE')]);
  const length = body.length + 2;
  const stripped = withoutIccProfile(jpeg);
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe2, (length >> 8) & 0xff, length & 0xff,
    ...body,
    ...stripped.slice(2)
  ]);
}

/** The same JPEG with an EXIF Orientation tag spliced in after the SOI.

    A camera writes this instead of rotating the pixels, and it is the tag
    ADR-0015 says must not survive normalize() - while the rotation it
    describes must. Testing that needs a real one, and no canvas will
    produce it, so the segment is built by hand: TIFF header, one IFD entry
    (tag 0x0112, SHORT, value `orientation`), no next IFD.

    Orientation 6 means "rotate 90 degrees clockwise to display", which is
    what a phone held upright writes. */
export function withExifOrientation(jpeg: Uint8Array, orientation: number): Uint8Array {
  const tiff = [
    0x49, 0x49, 0x2a, 0x00, // "II", little-endian, magic 42
    0x08, 0x00, 0x00, 0x00, // IFD0 starts 8 bytes in, i.e. right here
    0x01, 0x00, // one entry
    0x12, 0x01, // tag 0x0112, Orientation
    0x03, 0x00, // type 3, SHORT
    0x01, 0x00, 0x00, 0x00, // count 1
    orientation & 0xff, 0x00, 0x00, 0x00, // the value, inline
    0x00, 0x00, 0x00, 0x00 // no next IFD
  ];
  const body = new Uint8Array([...ascii('Exif'), 0x00, 0x00, ...tiff]);
  const length = body.length + 2;

  return new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, // APP1
    ...body,
    ...jpeg.slice(2) // everything after the original SOI
  ]);
}
