/* The capture → review → accept/cancel cycle every capturePhoto() call site
   now runs through (ticket 12, ADR-0033): identical everywhere, so it lives
   here once rather than five times. What "the last photo of this context"
   means stays entirely the caller's - `getReference` is a plain callback
   the caller supplies, never a shared registry this module or
   PhotoAlignmentReview.svelte knows anything about. */

import { capturePhoto, type ReferencePhoto } from './photoPicking';
import type { NormalizedPhoto } from '../data/journal/photos';

interface PhotoReview {
  /** The shot waiting on a decision, or null when there's nothing to
      review. Drives PhotoAlignmentReview's `open`. */
  readonly photo: NormalizedPhoto | null;
  /** Resolved once per capture, not read fresh on every render: a retake
      compares against the same "last photo" the first shot did, not
      whatever the caller's data happens to say by the time it resolves. */
  readonly reference: ReferencePhoto | null;
  /** Opens the native camera; sets `photo` (and freezes `reference`) if it
      returns a shot. Also what a retake re-invokes. */
  capture(): Promise<void>;
  /** Commits whatever's under review and closes it. */
  accept(photo: NormalizedPhoto): void | Promise<void>;
  /** Discards whatever's under review without storing anything. */
  cancel(): void;
}

export function photoReview(
  getReference: () => ReferencePhoto | null,
  onAccept: (photo: NormalizedPhoto) => void | Promise<void>
): PhotoReview {
  let reviewingPhoto = $state<NormalizedPhoto | null>(null);
  let reviewingReference = $state<ReferencePhoto | null>(null);

  async function capture() {
    const photo = await capturePhoto();
    if (photo) {
      reviewingReference = getReference();
      reviewingPhoto = photo;
    }
  }

  return {
    get photo() {
      return reviewingPhoto;
    },
    get reference() {
      return reviewingReference;
    },
    capture,
    async accept(photo) {
      reviewingPhoto = null;
      await onAccept(photo);
    },
    cancel() {
      reviewingPhoto = null;
    }
  };
}
