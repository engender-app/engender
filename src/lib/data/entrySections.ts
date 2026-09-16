/* The editor's chip row (phase 11 ticket 19): one chip per structured
   section, under the note, each opening its section directly under the
   row. The order is the order the questions used to be asked in, minus
   mood, which moved to the save bar; attachments are split by kind because
   a person adding a photo does not want the recorder.

   Rune-free, so the value a chip states is tested under the Node tier the
   way entryDraft.ts is. The names themselves are catalogue strings and
   stay in the component. */

import { BODY_REGION_MIDPOINT } from './bodyMap';
import type { EntryDraft } from './entryDraft';

export const ENTRY_SECTIONS = ['mode', 'gender', 'tags', 'body', 'photos', 'voice', 'video'] as const;
export type EntrySection = (typeof ENTRY_SECTIONS)[number];

export function isEntrySection(value: unknown): value is EntrySection {
  return typeof value === 'string' && (ENTRY_SECTIONS as readonly string[]).includes(value);
}

type SectionDraft = Pick<
  EntryDraft,
  'presentationId' | 'dims' | 'tags' | 'bodyRegions' | 'photos' | 'recordings' | 'videos'
>;

/** What a chip states under its name once its section holds something -
    "55 / 87" for two scales, "4" for four tags, the presentation's name -
    or null while the section is empty, in which case the chip reads its
    name alone (DIRECTION.md rule 13's key shape: the name, and the answer
    on a second line only where there is one).

    `dimOrder` is the ticked scales' order, so the figures read left to
    right the way the sliders are drawn; a scale kept from the entry but no
    longer ticked follows them, the same union the sliders themselves draw. */
export function sectionState(
  section: EntrySection,
  draft: SectionDraft,
  ctx: { presentationName: string | null; dimOrder: string[] }
): string | null {
  switch (section) {
    case 'mode':
      return draft.presentationId ? ctx.presentationName : null;
    case 'gender': {
      const set = Object.keys(draft.dims);
      const ordered = [...ctx.dimOrder.filter((key) => set.includes(key)), ...set.filter((key) => !ctx.dimOrder.includes(key))];
      return ordered.length ? ordered.map((key) => String(draft.dims[key])).join(' / ') : null;
    }
    case 'tags':
      return count(draft.tags.length);
    case 'body':
      return count(Object.values(draft.bodyRegions).filter((value) => value !== BODY_REGION_MIDPOINT).length);
    case 'photos':
      return count(draft.photos.length);
    case 'voice':
      return count(draft.recordings.length);
    case 'video':
      return count(draft.videos.length);
  }
}

function count(n: number): string | null {
  return n > 0 ? String(n) : null;
}
