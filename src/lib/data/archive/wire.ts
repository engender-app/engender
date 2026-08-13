export class CorruptArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorruptArchiveError';
  }
}

export function u32(value: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
}