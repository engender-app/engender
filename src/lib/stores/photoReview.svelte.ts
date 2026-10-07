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
  /** An accept is being stored: the review holds, and a second accept
      stores nothing. */
  readonly busy: boolean;
  /** Opens the native camera; sets `photo` (and freezes `reference`) if it
      returns a shot. Also what a retake re-invokes. */
  capture(): Promise<void>;
  /** Commits whatever's under review and closes it once that lands. An
      `onAccept` that answers `false` (its write failed and said so) leaves
      the shot under review, so it can be accepted again rather than lost
      (after-release 06). */
  accept(photo: NormalizedPhoto): void | Promise<void>;
  /** Discards whatever's under review without storing anything. */
  cancel(): void;
}

export function photoReview(
  getReference: () => ReferencePhoto | null,
  onAccept: (photo: NormalizedPhoto) => void | boolean | Promise<void | boolean>
): PhotoReview {
  let reviewingPhoto = $state<NormalizedPhoto | null>(null);
  let reviewingReference = $state<ReferencePhoto | null>(null);
  let accepting = $state(false);

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
    get busy() {
      return accepting;
    },
    capture,
    async accept(photo) {
      if (accepting) return;
      accepting = true;
      try {
        if ((await onAccept(photo)) === false) return;
      } finally {
        accepting = false;
      }
      if (reviewingPhoto === photo) reviewingPhoto = null;
    },
    cancel() {
      reviewingPhoto = null;
    }
  };
}
