/* What the photo library calls a source and a chip.

   Here rather than in `photos/library.ts` for the reason `hubLabels.ts` gives: that module
   is pure and the Node tier tests it, and nothing the Node tier touches may import
   paraglide. The rules about which chip a source answers to live there; the words live
   here.

   Both records are total over their key, so a seventh source or a seventh chip is a
   typecheck failure rather than a tile with no label on the screen that exists to say where
   a photograph came from. */

import { m } from '$lib/paraglide/messages';
import type { PhotoChip, PhotoSource } from '$lib/data/photos/library';

const SOURCE_LABEL: Record<PhotoSource, () => string> = {
  entry: m.ph_source_entry,
  milestone: m.ph_source_milestone,
  hairRemoval: m.hair_removal,
  tryout: m.ph_source_tryout,
  procedure: m.ph_source_procedure,
  video: m.ph_source_video,
  progress: m.ph_source_progress
};

const CHIP_LABEL: Record<PhotoChip, () => string> = {
  everything: m.ph_chip_everything,
  body: m.ph_chip_body,
  progress: m.ph_chip_progress,
  hair: m.ph_chip_hair,
  tryouts: m.ph_chip_tryouts,
  surgery: m.ph_chip_surgery,
  video: m.ph_chip_video,
  starred: m.ph_chip_starred
};

/** Where a photograph came from, in one or two words: the tile's label and
    half of its accessible name. */
export function photoSourceLabel(source: PhotoSource): string {
  return SOURCE_LABEL[source]();
}

export function photoChipLabel(chip: PhotoChip): string {
  return CHIP_LABEL[chip]();
}
