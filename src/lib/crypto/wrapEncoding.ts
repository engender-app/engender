import type { DataKeyWrap } from './keystore.ts';

export const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
export const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** Reads the byte fields and KDF parameters shared by both persisted wraps. */
export function parseWrap(
  raw: Record<string, unknown>,
  file: string,
  Unreadable: new (message: string) => Error
): DataKeyWrap {
  if (raw.kdf !== 'argon2id' || typeof raw.salt !== 'string' ||
      typeof raw.nonce !== 'string' || typeof raw.wrappedKey !== 'string') {
    throw new Unreadable(`${file} is missing fields`);
  }
  const params = raw.params as Partial<DataKeyWrap['params']> | undefined;
  const numbers: (keyof DataKeyWrap['params'])[] = ['memorySize', 'iterations', 'parallelism', 'hashLength'];
  if (!params || numbers.some((field) => typeof params[field] !== 'number')) {
    throw new Unreadable(`${file} has no usable KDF parameters`);
  }
  try {
    return {
      kdf: 'argon2id', params: params as DataKeyWrap['params'],
      salt: fromBase64(raw.salt), nonce: fromBase64(raw.nonce), wrappedKey: fromBase64(raw.wrappedKey)
    };
  } catch {
    throw new Unreadable(`${file} has unreadable base64`);
  }
}
