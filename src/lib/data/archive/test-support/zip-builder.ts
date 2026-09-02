/* Building a minimal, valid zip for tests and fixtures (phase 7 ticket 11):
   local file headers immediately followed by their data, then a central
   directory, then one EOCD record - what any writer produces without being
   asked for a comment, a data descriptor or Zip64. What dayone-zip.ts's
   reader needs to handle is a subset of what a real zip writer has to
   produce, which is the whole reason this stays this narrow too.

   Node-only (`node:zlib` for the deflated case): fixtures are generated
   once and committed, and the zip-reading tests that use this run in the
   Node tier already. */

import { deflateRawSync } from 'node:zlib';

const enc = new TextEncoder();

export interface ZipInput {
  name: string;
  data: Uint8Array;
  method: 0 | 8;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export function buildZip(files: readonly ZipInput[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const centralRecords: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const compressed = file.method === 8 ? deflateRawSync(file.data) : file.data;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, file.method, true);
    local.setUint32(18, compressed.length, true);
    local.setUint32(22, file.data.length, true);
    local.setUint16(26, nameBytes.length, true);
    const localHeaderOffset = offset;

    chunks.push(new Uint8Array(local.buffer), nameBytes, compressed);
    offset += 30 + nameBytes.length + compressed.length;

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(10, file.method, true);
    central.setUint32(20, compressed.length, true);
    central.setUint32(24, file.data.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint32(42, localHeaderOffset, true);
    centralRecords.push(new Uint8Array(central.buffer), nameBytes);
  }

  const centralDirOffset = offset;
  const centralDirBytes = centralRecords.reduce((n, c) => n + c.length, 0);

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, centralDirBytes, true);
  eocd.setUint32(16, centralDirOffset, true);

  return concat([...chunks, ...centralRecords, new Uint8Array(eocd.buffer)]);
}
