/* The editor's chip row (phase 11 ticket 19): one chip per folded
   section, under the note, each opening its section directly under the
   row. Mode and Gender are not here: Alicja's note on the spike (17
   September 2026) was that those two stay open on the page, so the chips
   are the five that fold - the order the questions used to be asked in,
   minus mood, which moved to the save bar; attachments are split by kind
   because a person adding a photo does not want the recorder.

   Rune-free, so the value a chip states is tested under the Node tier the
   way entryDraft.ts is. The names themselves are catalogue strings and
   stay in the component. */

import { BODY_REGION_MIDPOINT } from './bodyMap';
import type { EntryDraft } from './entryDraft';

export const ENTRY_SECTIONS = ['tags', 'body', 'photos', 'voice', 'video'] as const;
export type EntrySection = (typeof ENTRY_SECTIONS)[number];

export function isEntrySection(value: unknown): value is EntrySection {
  return typeof value === 'string' && (ENTRY_SECTIONS as readonly string[]).includes(value);
}

type SectionDraft = Pick<EntryDraft, 'tags' | 'bodyRegions' | 'photos' | 'recordings' | 'videos'>;

/** What a chip states under its name once its section holds something -
    "4" for four tags, "2" for two photos - or null while the section is
    empty, in which case the chip reads its name alone (DIRECTION.md rule
    13's key shape: the name, and the answer on a second line only where
    there is one). */
export function sectionState(section: EntrySection, draft: SectionDraft): string | null {
  switch (section) {
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
