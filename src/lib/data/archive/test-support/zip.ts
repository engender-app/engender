/* Writing a zip, for the tests that read one (phase 7 ticket 09).

   The app never writes a zip - its own archive container is codec.ts's
   encrypted format - so this is test support rather than a sibling of
   zip.ts. It exists because a `.daylio` fixture has to be a real zip: a
   hand-rolled reader that is only ever fed bytes from the same session's
   hand-rolled writer proves very little, so the writer here emits the
   parts a real zipper does, in the order it does, including the CRC our
   reader chooses not to check.

   `deflate` picks the compression method per entry, because the two paths
   through zip.ts are not the same code and a fixture that only exercised
   stored entries would leave the inflate half untested. */

const encoder = new TextEncoder();

/** CRC-32 as the zip format defines it. Nothing in the app needs this -
    zip.ts does not verify it - but a fixture claiming to be a real zip
    should be openable by something that does. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface ZipSource {
  /** Written verbatim, so a test can give the leading-slash form Daylio
      itself uses. */
  name: string;
  bytes: Uint8Array;
  deflate?: boolean;
}

/** The entries as one zip archive: local header and data for each, then a
    central directory, then the end-of-central-directory record. */
export async function makeZip(sources: readonly ZipSource[]): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const source of sources) {
    const name = encoder.encode(source.name);
    const stored = source.deflate ? await deflateRaw(source.bytes) : source.bytes;
    const method = source.deflate ? 8 : 0;
    const crc = crc32(source.bytes);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0, true); // flags
    local.setUint16(8, method, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, stored.length, true);
    local.setUint32(22, source.bytes.length, true);
    local.setUint16(26, name.length, true);

    const record = new DataView(new ArrayBuffer(46));
    record.setUint32(0, 0x02014b50, true);
    record.setUint16(4, 20, true); // version made by
    record.setUint16(6, 20, true); // version needed
    record.setUint16(10, method, true);
    record.setUint32(16, crc, true);
    record.setUint32(20, stored.length, true);
    record.setUint32(24, source.bytes.length, true);
    record.setUint16(28, name.length, true);
    record.setUint32(42, offset, true);

    parts.push(new Uint8Array(local.buffer), name, stored);
    central.push(new Uint8Array(record.buffer), name);
    offset += 30 + name.length + stored.length;
  }

  const directory = concat(central);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, sources.length, true);
  end.setUint16(10, sources.length, true);
  end.setUint32(12, directory.length, true);
  end.setUint32(16, offset, true);

  return concat([...parts, directory, new Uint8Array(end.buffer)]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    joined.set(part, at);
    at += part.length;
  }
  return joined;
}
