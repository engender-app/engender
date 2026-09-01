/* What each of the search registry's areas looks like as a hit (phase 5
   deepening ticket 24).

   textSearch.ts holds the keys, the tables and the reads and speaks no
   paraglide (ADR-0016); this is where they get their words, the same split
   dayRows.ts keeps from day.ts. Beside the components rather than in
   vocabulary/ for the reason dayRows.ts is: none of it is vocabulary, it is
   one screen's reading of rows other screens own.

   Three rules the whole map answers to, and the first and third are
   dayRows.ts's:

   *A hit's icon is the icon of the screen it goes to.* Not one glyph per
   record type - the disc says where the hit leads, so a milestone and a
   surgery journey both wearing `flag` is the app agreeing with itself. The
   More hub is where those icons are decided.

   *Every hit says what kind of thing it is, on the row.* That is the
   ticket's own condition, and it was first met by grouping - a heading per
   area, in the registry's order. Built and looked at, that was wrong for the
   same reason DayRecords.svelte gives for refusing it: eighteen areas can
   answer a query, and a display-size heading over a card of one row turns
   three hits into a screen of framework with slivers of content in it.
   Grouping also threw away the order the hits arrived in, which is newest
   first across every area and is the useful one.

   So the kind is the row's subtitle and the hits stay in one list, newest
   first. `search_elsewhere_heading` names the list once, the way
   "Also this day" names a day's context list.

   *A hit goes to the record where there is a screen for one, and to the
   screen that owns it otherwise.* A letter and a tryout have their own
   route; a side effect does not, and sending somebody to the side-effects
   screen is honest where inventing a deep link would not be. */

import { m } from '$lib/paraglide/messages';
import { fmtDay } from '$lib/data/dates';
import { PROCEDURE_CHECKLIST_OWNER_KIND } from '$lib/data/journal/procedures';
import { type SearchAreaKey, type SearchHit } from '$lib/data/journal/textSearch';
import { matchWindow } from '$lib/data/searchQuery';

/** One hit as a row: where it goes, and what it says. */
export interface SearchHitRow {
  /** The row's own walkthrough handle (ADR-0029) - stable, never the copy. */
  key: string;
  /** The registered area's key, for the walkthrough's handle on the row. */
  area: SearchAreaKey;
  /** What kind of thing this is, in the words its own screen uses. */
  label: string;
  icon: string;
  href: string;
  /** The day the record belongs to, already worded, or undefined for an area
      whose records have no day (a roadmap goal, an affirmation). */
  date?: string;
  /** What the row reads: the text around the match rather than the field's
      first line, since a letter runs to paragraphs and the match can be
      anywhere in it. */
  excerpt: string;
}

const MILESTONES = '/settings/milestones';
const SURGERY = '/settings/surgery';
const TRYOUTS = '/settings/tryouts';

/** How each registered area reads as a row.

    A full `Record` over the registry's own keys, and that is the half of the
    registry's promise this file owes. textSearch.ts makes an area registered
    nowhere a compile error; without this, an area added there would compile,
    be searched, and render as hits with no name, no icon and nowhere to go.
    A new key is a type error here until somebody says what it looks like. */
const AREA_ROWS: Record<
  SearchAreaKey,
  { icon: string; label: () => string; href: (hit: SearchHit) => string }
> = {
  letters: { icon: 'book', label: () => m.letters_title(), href: (hit) => `/settings/letters/${hit.id}` },
  milestones: { icon: 'flag', label: () => m.milestones(), href: () => MILESTONES },
  procedures: { icon: 'flag', label: () => m.surgery_journey_title(), href: () => SURGERY },
  /* One area, two screens. A question written for an appointment belongs to
     the prep list; a line of a procedure's recovery checklist belongs to
     that journey, and the owner kind on the row is what tells them apart
     (procedures.ts). */
  checklistItems: {
    icon: 'check',
    label: () => m.appointment_prep_title(),
    href: (hit) => (hit.context === PROCEDURE_CHECKLIST_OWNER_KIND ? SURGERY : '/settings/appointment-prep')
  },
  sideEffects: { icon: 'zap', label: () => m.side_effects(), href: () => '/settings/side-effects' },
  /* A felt sense hangs off a tryout or off a milestone, and the tryout's id
     travels with the hit for exactly this (textSearch.ts): with one, the hit
     opens that tryout, which is where its history is read; without one, the
     owner is a milestone and the milestones screen is as close as there is. */
  feltSense: {
    icon: 'tag',
    label: () => m.search_area_felt_sense(),
    href: (hit) => (hit.context ? `${TRYOUTS}/${hit.context}` : MILESTONES)
  },
  tryouts: { icon: 'tag', label: () => m.tryout_title(), href: (hit) => `${TRYOUTS}/${hit.id}` },
  presentations: { icon: 'palette', label: () => m.presentations_title(), href: () => '/settings/presentations' },
  eras: { icon: 'columns', label: () => m.eras_title(), href: () => '/settings/eras' },
  roadmapGoals: { icon: 'globe', label: () => m.roadmap_title(), href: () => '/settings/roadmap' },
  affirmations: {
    icon: 'sparkle',
    label: () => m.affirmations_row_title(),
    href: () => '/settings/affirmations'
  },
  labResults: { icon: 'flask', label: () => m.lab_results(), href: () => '/settings/labs' },
  sizeRecords: { icon: 'package', label: () => m.size_log(), href: () => '/settings/sizes' },
  wearSessions: { icon: 'clock', label: () => m.wear_log(), href: () => '/settings/wear' },
  // The compare surface rather than the recorder: a hit is a take somebody
  // is looking for, not a new one (dayRows.ts sends a benchmark there too).
  voiceBenchmarks: { icon: 'mic', label: () => m.vb_title(), href: () => '/settings/voice' },
  hairStages: { icon: 'comb', label: () => m.hair_progress(), href: () => '/settings/hair-progress' },
  hairRemovalSessions: {
    icon: 'shuffle',
    label: () => m.hair_removal(),
    href: () => '/settings/hair-removal'
  },
  regimenEpisodes: { icon: 'timeline', label: () => m.regimen(), href: () => '/settings/regimen' },
  medicationStock: { icon: 'package', label: () => m.stock_title(), href: () => '/settings/stock' },
  reminders: { icon: 'bell', label: () => m.reminders(), href: () => '/settings/reminders' }
};

/** The text a row shows: the window around the match, joined, or the whole
    field where no window could be taken (searchQuery.ts's matchWindow states
    when that happens). Joined rather than kept in three parts, because
    ListRow's title is a string - a marked-up match would mean a row
    component of this screen's own, and the excerpt is what makes a long hit
    readable; the emphasis is not. */
function excerptOf(text: string, query: string): string {
  const window = matchWindow(text, query);
  return window === null ? text : `${window.before}${window.match}${window.after}`;
}

/** The hits as rows, in the order they arrived - newest first across every
    area (textSearch.ts), which is the order somebody scanning results wants.

    A hit whose area this file has never heard of is dropped rather than
    drawn without a name: `AREA_ROWS` being a full Record makes that
    unreachable through the registry, and the guard is for the one path that
    is not the registry - a journal from a build that had an area this one
    does not. */
export function searchHitRows(hits: readonly SearchHit[], query: string): SearchHitRow[] {
  return hits.flatMap((hit) => {
    const declared = AREA_ROWS[hit.area as SearchAreaKey];
    if (!declared) return [];
    return [
      {
        key: `${hit.area}-${hit.id}`,
        area: hit.area as SearchAreaKey,
        label: declared.label(),
        icon: declared.icon,
        href: declared.href(hit),
        date: hit.epochDay === null ? undefined : fmtDay(hit.epochDay, { month: 'short', year: '2-digit' }),
        excerpt: excerptOf(hit.value, query)
      }
    ];
  });
}
