export const PHOTO_CHANNEL_TIMEOUT_MS = 30_000;

export class PhotoChannelTimeoutError extends Error {
  constructor(operation: 'write' | 'pick') {
    super(`photo ${operation} channel timed out`);
    this.name = 'PhotoChannelTimeoutError';
  }
}
