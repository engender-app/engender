/* photoSection.svelte.ts is deliberately not exercised directly here, the
   same reason recordEditor.svelte.ts's own suite stops at recordEditor.ts:
   it is $state-only glue, and vitest.config.ts's Node environment has no
   Svelte plugin, so a rune (or a $lib-aliased import, which the reactive
   file also carries) cannot even load here, let alone run. Every path
   photoSection() wires - reading the list, adding a picked photo, finding
   one to remove - is covered below against a fake owner: a plain photos
   array plus spy functions standing in for the real add/remove calls. */

import { describe, expect, it, vi } from 'vitest';

import { addPickedPhoto, findPhotoById, lastPhotoReference, pickedPhoto } from './photoSection';

type FakePhoto = { id: string; fileName: string };

/** A fake owner's current photos - what `photos()` returns in
    PhotoSectionOptions. */
const photos: FakePhoto[] = [
  { id: 'a', fileName: 'a.jpg' },
  { id: 'b', fileName: 'b.jpg' }
];

describe('findPhotoById - the remove path', () => {
  // photoSection() hands this straight to recordEditor() as `findById`,
  // which is what resolves a delete-confirm target; recordEditor.ts's own
  // suite covers what happens once a target is found, so this is the one
  // new piece: finding the right photo in a fake owner's list.
  it('finds a photo by id against the owner’s current list', () => {
    expect(findPhotoById(photos, 'b')).toEqual({ id: 'b', fileName: 'b.jpg' });
  });

  it('returns undefined for an id the owner does not have', () => {
    expect(findPhotoById(photos, 'missing')).toBeUndefined();
  });
});

describe('lastPhotoReference - the list path', () => {
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

describe('addPickedPhoto - the add path', () => {
  it('never calls the fake owner’s add when the picker came back empty', async () => {
    const add = vi.fn();
    await addPickedPhoto([], add);
    expect(add).not.toHaveBeenCalled();
  });

  it('stores the picked photo against the fake owner', async () => {
    const add = vi.fn();
    await addPickedPhoto(['new.jpg'], add);
    expect(add).toHaveBeenCalledWith('new.jpg');
  });
});
