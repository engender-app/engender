import { describe, expect, it } from 'vitest';

import { findPhotoById, lastPhotoReference, pickedPhoto } from './photoSection';

type FakePhoto = { id: string; fileName: string };

const photos: FakePhoto[] = [
  { id: 'a', fileName: 'a.jpg' },
  { id: 'b', fileName: 'b.jpg' }
];

describe('findPhotoById', () => {
  it('finds a photo by id against the owner’s current list', () => {
    expect(findPhotoById(photos, 'b')).toEqual({ id: 'b', fileName: 'b.jpg' });
  });

  it('returns undefined for an id the owner does not have', () => {
    expect(findPhotoById(photos, 'missing')).toBeUndefined();
  });
});

describe('lastPhotoReference', () => {
  it('is null against an empty list - nothing to compare a first shot against', () => {
    expect(lastPhotoReference<FakePhoto>([])).toBeNull();
  });

  it('is the list’s last entry, not its first', () => {
    expect(lastPhotoReference(photos)).toEqual({ fileName: 'b.jpg' });
  });
});

describe('pickedPhoto', () => {
  it('is null when the picker returned nothing - backing out, not an error', () => {
    expect(pickedPhoto([])).toBeNull();
  });

  it('is the one photo pickPhotos(1) returned', () => {
    expect(pickedPhoto(['x'])).toBe('x');
  });
});
