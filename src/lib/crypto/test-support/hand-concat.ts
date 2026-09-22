/* What every store used to hand-build itself before seal()/open() existed
   (ticket 27): nonce then ciphertext, concatenated. Kept as a test-only
   helper so the "old format still opens" fixture tests read as building a
   fixture rather than reimplementing seal(). */

export function handConcat(nonce: Uint8Array, ciphertext: Uint8Array): Uint8Array<ArrayBuffer> {
  const stored = new Uint8Array(nonce.length + ciphertext.length);
  stored.set(nonce);
  stored.set(ciphertext, nonce.length);
  return stored;
}
