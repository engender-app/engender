/* Add labels, icons and destinations to textSearch.ts results. Use the owning screen's icon
   from the More hub and name the record kind in its subtitle. Keep results in one
   newest-first list across all areas.

   Link to the individual record if it has a route. Otherwise, link to the screen that owns
   it. The search registry owns reads and tables. */

import { m } from '$lib/paraglide/messages';
import { photoCaptionDate } from '$lib/data/dates';
import { hubRow, type HubRow } from '$lib/data/hubRows';
import { hitsForPlatform } from '$lib/data/journal/searchPlatform';
import { isAndroid } from '$lib/platform';
import { type SearchAreaKey, type SearchHit } from '$lib/data/journal/textSearch';
import { matchWindow } from '$lib/data/searchQuery';
import { iconOf } from './rowIcon';

/** One hit as a row: where it goes, and what it says. */
interface SearchHitRow extends Pick<HubRow, 'icon'> {
  /** The row's own walkthrough handle - stable, never the copy. */
  key: string;
  /** The registered area's key, for the walkthrough's handle on the row. */
  area: SearchAreaKey;
  /** What kind of thing this is, in the words its own screen uses. */
  label: string;
  href: string;
  /** The day the record belongs to, already worded, or undefined for an area
      whose records have no day (a roadmap goal, a checklist). */
  date?: string;
  /** What the row reads: the text around the match rather than the field's
      first line, since a letter runs to paragraphs and the match can be
      anywhere in it. */
  excerpt: string;
}

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
  procedures: {
    ...iconOf('surgery'),
    label: () => m.surgery_journey_title(),
    // Its own screen (prh12), the way an appointment's hit opens that appointment.
    href: (hit) => `${hubRow('surgery').href}/${encodeURIComponent(hit.id)}`
  },
  appointments: {
    ...iconOf('appointments'),
    label: () => m.appointments_title(),
    // Its own screen (prh12), the way a tryout's hit opens that tryout.
    href: (hit) => `${hubRow('appointments').href}/${hit.id}`
  },
  /* One area, two screens. A question written for an appointment belongs to the prep list,
     which is a section of the visit screen; a line of a procedure's recovery checklist
     belongs to that journey, and the owner's id on the row is what tells them apart and
     names the procedure to open (textSearch.ts). The prep list is the more common of the
     two, so its screen is what the row's own icon names. */
  checklistItems: {
    ...iconOf('appointments'),
    label: () => m.appointment_prep_title(),
    href: (hit) =>
      hit.context ? `${hubRow('surgery').href}/${encodeURIComponent(hit.context)}` : hubRow('appointments').href
  },
  sideEffects: { ...iconOf('effects'), label: () => m.side_effects(), href: () => hubRow('effects').href },
  /* A felt sense hangs off a tryout, and the tryout's id travels with the
     hit for exactly this (textSearch.ts): the hit opens that tryout, which
     is where its history is read. */
  feltSense: {
    ...iconOf('tryouts'),
    label: () => m.search_area_felt_sense(),
    href: (hit) => `${hubRow('tryouts').href}/${hit.context}`
  },
  tryouts: {
    ...iconOf('tryouts'),
    label: () => m.tryout_title(),
    href: (hit) => `${hubRow('tryouts').href}/${hit.id}`
  },
  presentations: {
    icon: 'palette',
    label: () => m.presentations_title(),
    href: () => '/settings'
  },
  eras: { icon: 'era', label: () => m.eras_title(), href: () => '/settings/eras' },
  roadmapGoals: { ...iconOf('roadmap'), label: () => m.roadmap_title(), href: () => hubRow('roadmap').href },
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
  labResults: { icon: 'flask', label: () => m.lab_results(), href: () => '/care/labs' },
  taperSessions: { ...iconOf('dilation'), label: () => m.dilation(), href: () => hubRow('dilation').href },
  wearSessions: { ...iconOf('wear'), label: () => m.wear_log(), href: () => hubRow('wear').href },
  // The compare surface rather than the recorder: a hit is a take somebody
  // is looking for, not a new one (dayRows.ts sends a benchmark there too).
  voiceBenchmarks: {
    ...iconOf('voice-benchmark'),
    label: () => m.vb_title(),
    href: () => `${hubRow('voice-benchmark').href}?tab=compare`
  },
  hairRemovalSessions: {
    ...iconOf('hair-removal'),
    label: () => m.hair_removal(),
    href: () => hubRow('hair-removal').href
  },
  // No screen of its own - the regimen sits behind the care row - but the
  // icon it always had already agrees with that row's, so read it off there.
  regimenEpisodes: { ...iconOf('care'), label: () => m.regimen(), href: () => '/care/regimen' },
  /* No screen of its own to deep-link into any more - the stock editor is
     a sheet off Care's own regimen block (ADR-0084) - so a hit
     lands on Care itself rather than on a stub that would bounce it there
     a second time. That is the care row's own screen, exactly, so its icon
     comes from there too. */
  medicationStock: { ...iconOf('care'), label: () => m.stock_title(), href: () => hubRow('care').href },
  reminders: { icon: 'bell', label: () => m.reminders(), href: () => '/settings/reminders' },
  /* A margin note has no screen of its own - it opens the entry it
     annotates, and `date` on the row is already that entry's own day
     (textSearch.ts's own reasoning for dating this area by the owner
     rather than by when the note was written), which is what lets the hit
     name the entry without this label needing to. */
  marginNotes: {
    icon: 'note',
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
  return hitsForPlatform(hits, isAndroid()).flatMap((hit) => {
    const declared = AREA_ROWS[hit.area as SearchAreaKey];
    if (!declared) return [];
    return [
      {
        key: `${hit.area}-${hit.id}`,
        area: hit.area as SearchAreaKey,
        label: declared.label(),
        icon: declared.icon,
        href: declared.href(hit),
        date: hit.epochDay === null ? undefined : photoCaptionDate(hit.epochDay),
        excerpt: excerptOf(hit.value, query)
      }
    ];
  });
}
