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
import { hubRow, type HubRow, type HubRowKey } from '$lib/data/hubRows';
import { PROCEDURE_CHECKLIST_OWNER_KIND } from '$lib/data/journal/procedures';
import { type SearchAreaKey, type SearchHit } from '$lib/data/journal/textSearch';
import { matchWindow } from '$lib/data/searchQuery';

/** One hit as a row: where it goes, and what it says. */
interface SearchHitRow extends Pick<HubRow, 'icon'> {
  /** The row's own walkthrough handle (ADR-0029) - stable, never the copy. */
  key: string;
  /** The registered area's key, for the walkthrough's handle on the row. */
  area: SearchAreaKey;
  /** What kind of thing this is, in the words its own screen uses. */
  label: string;
  href: string;
  /** The day the record belongs to, already worded, or undefined for an area
      whose records have no day (a roadmap goal, an affirmation). */
  date?: string;
  /** What the row reads: the text around the match rather than the field's
      first line, since a letter runs to paragraphs and the match can be
      anywhere in it. */
  excerpt: string;
}

/** An area's icon, read off the hub row that owns its screen rather than
    named a second time here - the rule this file's own header states. */
const iconOf = (key: HubRowKey): Pick<HubRow, 'icon'> => {
  const { icon } = hubRow(key);
  return { icon };
};

/** A raw icon name, wrapped the same shape `iconOf` hands back - for an area
    with no screen of its own to read one from (a Settings reference list, or
    content with no route beyond the record it annotates), and for handing a
    row's already-resolved icon on to `searchHitRows`' own return value.
    Kept as one call rather than naming the property inline, so every icon on
    this file's rows - owned by a hub row or not - is read out of a function
    rather than declared by hand. */
const asIcon = (value: string): Pick<HubRow, 'icon'> => ({ ['icon']: value });

/** How each registered area reads as a row.

    A full `Record` over the registry's own keys, and that is the half of the
    registry's promise this file owes. textSearch.ts makes an area registered
    nowhere a compile error; without this, an area added there would compile,
    be searched, and render as hits with no name, no icon and nowhere to go.
    A new key is a type error here until somebody says what it looks like. */
const AREA_ROWS: Record<
  SearchAreaKey,
  Pick<HubRow, 'icon'> & { label: () => string; href: (hit: SearchHit) => string }
> = {
  letters: {
    ...iconOf('letters'),
    label: () => m.letters_title(),
    href: (hit) => `${hubRow('letters').href}/${hit.id}`
  },
  milestones: { ...iconOf('milestones'), label: () => m.milestones(), href: () => hubRow('milestones').href },
  procedures: { ...iconOf('surgery'), label: () => m.surgery_journey_title(), href: () => hubRow('surgery').href },
  appointments: {
    ...iconOf('appointments'),
    label: () => m.appointments_title(),
    href: () => hubRow('appointments').href
  },
  /* One area, two screens. A question written for an appointment belongs to
     the prep list, which is a section of the visit screen since phase 11
     all-four-doors ticket 12; a line of a procedure's recovery checklist
     belongs to that journey, and the owner kind on the row is what tells
     them apart (procedures.ts). The prep list is the more common of the two,
     so its screen is what the row's own icon names. */
  checklistItems: {
    ...iconOf('appointments'),
    label: () => m.appointment_prep_title(),
    href: (hit) => (hit.context === PROCEDURE_CHECKLIST_OWNER_KIND ? hubRow('surgery').href : hubRow('appointments').href)
  },
  sideEffects: { ...iconOf('effects'), label: () => m.side_effects(), href: () => hubRow('effects').href },
  /* A felt sense hangs off a tryout or off a milestone, and the tryout's id
     travels with the hit for exactly this (textSearch.ts): with one, the hit
     opens that tryout, which is where its history is read; without one, the
     owner is a milestone and the milestones screen is as close as there is.
     The tryout is the more common of the two, so its screen is what the
     row's own icon names. */
  feltSense: {
    ...iconOf('tryouts'),
    label: () => m.search_area_felt_sense(),
    href: (hit) => (hit.context ? `${hubRow('tryouts').href}/${hit.context}` : hubRow('milestones').href)
  },
  tryouts: {
    ...iconOf('tryouts'),
    label: () => m.tryout_title(),
    href: (hit) => `${hubRow('tryouts').href}/${hit.id}`
  },
  presentations: {
    ...asIcon('palette'),
    label: () => m.presentations_title(),
    href: () => '/settings/presentations'
  },
  eras: { ...asIcon('columns'), label: () => m.eras_title(), href: () => '/settings/eras' },
  roadmapGoals: { ...iconOf('roadmap'), label: () => m.roadmap_title(), href: () => hubRow('roadmap').href },
  affirmations: {
    ...asIcon('sparkle'),
    label: () => m.affirmations_row_title(),
    href: () => '/settings/affirmations'
  },
  /* Goes to the document itself rather than to the list: a hit is one
     piece of paper somebody is looking for, and its own screen is the only
     place the page image is drawn at all (ADR-0065). */
  documents: {
    ...iconOf('documents'),
    label: () => m.documents_title(),
    href: (hit) => `${hubRow('documents').href}/${hit.id}`
  },
  /* Neither area has a row of its own - both sit behind the care row
     (hubRows.ts's own LAST_WRITE_WITHOUT_A_ROW), so there is no single
     screen's icon to read these off and they keep their own. */
  labResults: { ...asIcon('flask'), label: () => m.lab_results(), href: () => '/care/labs' },
  sizeRecords: { ...asIcon('package'), label: () => m.size_log(), href: () => '/body/sizes' },
  taperSessions: { ...iconOf('dilation'), label: () => m.dilation(), href: () => hubRow('dilation').href },
  wearSessions: { ...iconOf('wear'), label: () => m.wear_log(), href: () => hubRow('wear').href },
  // The compare surface rather than the recorder: a hit is a take somebody
  // is looking for, not a new one (dayRows.ts sends a benchmark there too).
  voiceBenchmarks: {
    ...iconOf('voice-benchmark'),
    label: () => m.vb_title(),
    href: () => `${hubRow('voice-benchmark').href}?tab=compare`
  },
  hairStages: { ...iconOf('hair-progress'), label: () => m.hair_progress(), href: () => hubRow('hair-progress').href },
  hairRemovalSessions: {
    ...iconOf('hair-removal'),
    label: () => m.hair_removal(),
    href: () => hubRow('hair-removal').href
  },
  // No screen of its own - the regimen sits behind the care row - but the
  // icon it always had already agrees with that row's, so read it off there.
  regimenEpisodes: { ...iconOf('care'), label: () => m.regimen(), href: () => '/care/regimen' },
  /* No screen of its own to deep-link into any more - the stock editor is
     a sheet off Care's own regimen block (ticket 09, ADR-0084) - so a hit
     lands on Care itself rather than on a stub that would bounce it there
     a second time. That is the care row's own screen, exactly, so its icon
     comes from there too. */
  medicationStock: { ...iconOf('care'), label: () => m.stock_title(), href: () => hubRow('care').href },
  reminders: { ...asIcon('bell'), label: () => m.reminders(), href: () => '/settings/reminders' },
  /* A margin note has no screen of its own - it opens the entry it
     annotates, and `date` on the row is already that entry's own day
     (textSearch.ts's own reasoning for dating this area by the owner
     rather than by when the note was written), which is what lets the hit
     name the entry without this label needing to. */
  marginNotes: {
    ...asIcon('note'),
    label: () => m.margin_note_search_label(),
    href: (hit) => `/entry/${hit.context}`
  }
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
        ...asIcon(declared.icon),
        href: declared.href(hit),
        date: hit.epochDay === null ? undefined : fmtDay(hit.epochDay, { month: 'short', year: '2-digit' }),
        excerpt: excerptOf(hit.value, query)
      }
    ];
  });
}
