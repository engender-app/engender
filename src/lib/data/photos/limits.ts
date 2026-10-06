export const PHOTO_SIZE_CEILING = 32 * 1024 * 1024;

export class PhotoTooLargeError extends Error {
  constructor() {
    super('Selected photo exceeds 32 MB');
    this.name = 'PhotoTooLargeError';
  }
}

export function refuseLargePhoto(size: number): void {
  if (size > PHOTO_SIZE_CEILING) throw new PhotoTooLargeError();
}
