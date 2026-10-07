/* The picker, the review store and the delete-only record editor every
   photo-owning screen assembled for itself around recordEditor.svelte.ts
   and photoReview.svelte.ts (phase 5 audit ticket 11) - wired here once
   instead of at each of five call sites. The reactive half of
   photoSection.ts, deliberately thin: `$state` only works here, so every
   branch stays in the rune-free module and this delegates to it, the same
   split recordEditor.svelte.ts already makes from recordEditor.ts.

   What "the list" means stays the caller's - a liveList query's rows for
   an area that persists a photo immediately, a draft's own single field
   for the one that holds it until Save (milestones/+page.svelte). */

import type { NormalizedPhoto } from '$lib/data/journal/photos';
import type { ReferencePhoto } from '$lib/stores/photoPicking';
import { pickPhotos } from '$lib/stores/photoPicking';
import { photoReview } from '$lib/stores/photoReview.svelte';
import { addPickedPhoto, findPhotoById } from './photoSection';
import { m } from '$lib/paraglide/messages';
import { attempt } from '$lib/stores/attempt.svelte';
import { recordEditor } from './recordEditor.svelte';

interface PhotoSectionOptions<TPhoto extends { id: string }> {
  /** The owner's current photos, already reactive. */
  photos(): TPhoto[];
  /** Store a newly picked or captured photo against this owner. */
  /** `false` keeps a reviewed shot open after a write that failed. */
  add(photo: NormalizedPhoto): void | boolean | Promise<void | boolean>;
  /** Delete a stored photo by id. */
  remove(id: string): void | Promise<void>;
  /** What the toast says once `remove` lands; null where the removal is
      only from a draft and nothing is deleted until its Save. Omitted,
      "Deleted.". */
  deleted?: () => string | null;
  /** The post-capture review's comparison photo (ADR-0033). What "the last
      photo of this context" means stays the caller's -
      photoSection.ts's `lastPhotoReference` is the usual answer. */
  reference(): ReferencePhoto | null;
}

export function photoSection<TPhoto extends { id: string }>(options: PhotoSectionOptions<TPhoto>) {
  const record = recordEditor<TPhoto>({
    remove: options.remove,
    deleted: options.deleted,
    findById: (id) => findPhotoById(options.photos(), id)
  });

  const review = photoReview(options.reference, options.add);

  async function pick() {
    const picked = await pickPhotos(1);
    // The picker holds nothing to retry from, so the failure says to pick again.
    await attempt(() => addPickedPhoto(picked, options.add), m.photo_pick_save_failed());
  }

  return {
    get photos() {
      return options.photos();
    },
    record,
    review,
    pick
  };
}
