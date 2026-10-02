import type { Delivery } from './deliver';
import { androidFileDelivery } from './android-file-delivery-bridge';

const PIECE_BYTES = 1024 * 1024;

export async function deliverAndroidFile(file: {
  fileName: string;
  type: string;
  body: AsyncIterable<Uint8Array>;
}): Promise<Delivery> {
  const { createSHA256 } = await import('hash-wasm');
  const digest = await createSHA256();
  const { transferId } = await androidFileDelivery.beginFile({ fileName: file.fileName, type: file.type });
  try {
    let byteLength = 0;
    for await (const piece of file.body) {
      digest.update(piece);
      for (let at = 0; at < piece.length; at += PIECE_BYTES) {
        const bytes = piece.subarray(at, at + PIECE_BYTES);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        await androidFileDelivery.appendFile({ transferId, offset: byteLength, base64: btoa(binary) });
        byteLength += bytes.length;
      }
    }
    const { saved } = await androidFileDelivery.finishFile({ transferId, byteLength, sha256: digest.digest('hex') });
    return saved ? 'downloaded' : 'cancelled';
  } finally {
    await androidFileDelivery.abortFile({ transferId }).catch(() => {});
  }
}
