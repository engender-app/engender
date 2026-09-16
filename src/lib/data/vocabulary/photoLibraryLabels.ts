/* What the photo library calls a source and a chip (phase 11 ticket 14).

   Here rather than in `photos/library.ts` for the reason `hubLabels.ts`
   gives: that module is pure and the Node tier tests it, and nothing the
   Node tier touches may import paraglide (ADR-0016). The rules about which
   chip a source answers to live there; the words live here.

   Both records are total over their key, so a seventh source or a
   seventh chip is a typecheck failure rather than a tile with no label on
   the screen that exists to say where a photograph came from. */

import { m } from '$lib/paraglide/messages';
import type { PhotoChip, PhotoSource } from '$lib/data/photos/library';

const SOURCE_LABEL: Record<PhotoSource, () => string> = {
  entry: m.ph_source_entry,
  milestone: m.ph_source_milestone,
  hair: m.ph_source_hair,
  hairRemoval: m.ph_source_hair_removal,
  tryout: m.ph_source_tryout,
  procedure: m.ph_source_procedure,
  video: m.ph_source_video
};

const CHIP_LABEL: Record<PhotoChip, () => string> = {
  everything: m.ph_chip_everything,
  body: m.ph_chip_body,
  hair: m.ph_chip_hair,
  tryouts: m.ph_chip_tryouts,
  surgery: m.ph_chip_surgery,
  video: m.ph_chip_video
};

/** Where a photograph came from, in one or two words: the tile's label and
    half of its accessible name. */
export function photoSourceLabel(source: PhotoSource): string {
  return SOURCE_LABEL[source]();
}

export function photoChipLabel(chip: PhotoChip): string {
  return CHIP_LABEL[chip]();
}

/** The line under the wipe on that side of the frame: the record's own name
    where it has one, and what kind of photograph it is where it has not. A
    milestone called "First appointment" says more than "Milestone" does;
    a hair photograph has nothing but its source to give. */
export function photoOwnerLine(photo: { source: PhotoSource; ownerName: string | null }): string {
  return photo.ownerName ?? photoSourceLabel(photo.source);
}
