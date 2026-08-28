/* The rules behind photoSection.svelte.ts (phase 5 audit ticket 11): what
   every photo-owning screen decided for itself before wiring a
   recordEditor(), a photoReview() and a pickPhotos() call around its own
   list. Framework-free and node-tested for the reason recordEditor.ts is -
   $state only works in a .svelte.ts file, so the branching lives here,
   where photoSection.svelte.ts merely delegates to it. */

export function findPhotoById<TPhoto extends { id: string }>(
  photos: TPhoto[],
  id: string
): TPhoto | undefined {
  return photos.find((photo) => photo.id === id);
}

/** The post-capture review's default comparison photo (ADR-0033): the
    list's last entry, or null with nothing stored yet. What "the last
    photo of this context" means for every owner whose photos are a plain
    list; a draft-held single photo means something else by it and passes
    its own `reference` instead (photoReview.svelte.ts's own header). */
export function lastPhotoReference<TPhoto extends { fileName: string }>(
  photos: TPhoto[]
): { fileName: string } | null {
  const last = photos[photos.length - 1];
  return last ? { fileName: last.fileName } : null;
}

/** Whatever pickPhotos(1) returned, or null if the person backed out of
    the picker - an ordinary outcome, not an error (photoPicking.ts). */
export function pickedPhoto<TPhoto>(picked: TPhoto[]): TPhoto | null {
  return picked[0] ?? null;
}
