/* What the wear log calls each kind of session (phase 8 features ticket 50,
   ADR-0064), alongside doseLabels.ts for the same reason that file exists:
   the wording speaks paraglide, and nothing the Node tier touches may import
   that (ADR-0016). wearSessions.ts holds the vocabulary itself and stays
   free of it; this is where it gets its words.

   Every record is a total `Record<WearKind, ...>`, the rule labels.ts sets
   out: a kind added to the union without its wording is a typecheck failure
   here rather than a raw key on screen. That matters more than usual for
   this vocabulary, because the whole ticket is that a session is never
   described in generic words again.

   Keyed one message per kind rather than composed from a noun and a
   template. Polish declines the noun differently in each of the sentences
   below - "sesja z binderem" but "sesja tuckingu" - so a "{kind} session"
   template would be wrong in two thirds of the catalogue, the same trap
   doseLabels.ts names for injection sites.

   Five strings deliberately stay generic and are not here. Four name a
   surface holding all three kinds at once - the screen's own title, the More
   hub's row, the stats-area label and the search-hit label - and "Wear log"
   is what all three are. The fifth is `tile_wear_title` ("Wear timer"),
   which unprompted/registry.ts uses for the row that switches the tile off
   as a kind: that switch covers all three too, and the tile the switch is
   about does carry the kind (`wearTileTitle` below).

   Two more are generic for a reason that is not that. The empty state has no
   session to name and no kind to draw from, and naming the fallback kind
   there would put a guess in front of somebody who has logged nothing. And
   `prov_reminder_wear`, on the reminders list, is resolved from a reminder's
   `autoSource` marker alone (provenance.ts) - naming the kind would mean
   that screen reading wear sessions to render a hint. */

/* Relative rather than `$lib`, unlike doseLabels.ts beside it: liveTiles.ts
   reads this file for the wear tile's title, and liveTiles.grid.test.ts
   runs on the Node tier, where no alias exists (vitest.config.ts). */
import { m } from '../../paraglide/messages';
import type { WearKind } from '../types';

const KIND_LABELS: Record<WearKind, () => string> = {
  binder: m.wear_kind_binder,
  tucking: m.wear_kind_tucking,
  compression: m.wear_kind_compression
};

/* The add button's accessible name. It opens a blank draft on `latestKind`,
   so it says which kind that is rather than "a wear session" - what the
   button is about to do is the whole of what an accessible name owes. */
const ADD_ARIA: Record<WearKind, () => string> = {
  binder: m.wear_session_add_aria_binder,
  tucking: m.wear_session_add_aria_tucking,
  compression: m.wear_session_add_aria_compression
};

const NEW_SHEET_TITLES: Record<WearKind, () => string> = {
  binder: m.wear_session_new_sheet_binder,
  tucking: m.wear_session_new_sheet_tucking,
  compression: m.wear_session_new_sheet_compression
};

const EDIT_SHEET_TITLES: Record<WearKind, () => string> = {
  binder: m.wear_session_edit_sheet_binder,
  tucking: m.wear_session_edit_sheet_tucking,
  compression: m.wear_session_edit_sheet_compression
};

const RUNNING_SHEET_TITLES: Record<WearKind, () => string> = {
  binder: m.wear_session_running_sheet_binder,
  tucking: m.wear_session_running_sheet_tucking,
  compression: m.wear_session_running_sheet_compression
};

/* The row above the list and the sheet that opens from it say different
   things - "Binding now" names a row in a list, "Currently binding" titles
   the editor for it - which is why this is a second record rather than the
   one above reused in two places. */
const RUNNING_CARD_TITLES: Record<WearKind, () => string> = {
  binder: m.wear_session_running_card_binder,
  tucking: m.wear_session_running_card_tucking,
  compression: m.wear_session_running_card_compression
};

const DELETE_SHEET_TITLES: Record<WearKind, () => string> = {
  binder: m.wear_session_delete_sheet_binder,
  tucking: m.wear_session_delete_sheet_tucking,
  compression: m.wear_session_delete_sheet_compression
};

/* The title a session's own auto-managed Reminder is created with
   (wearSessions.ts). Set once, on the first save that asks for a reminder,
   so a session started as one kind and corrected to another keeps the title
   it already had - the same rule stock.ts's reconcile follows. */
const REMINDER_TITLES: Record<WearKind, () => string> = {
  binder: m.wear_session_reminder_title_binder,
  tucking: m.wear_session_reminder_title_tucking,
  compression: m.wear_session_reminder_title_compression
};

/* The return surface's row for a session left running through a gap
   (offers.ts's `returning-wear-session`). The offer's own sheet copy says
   "this session" throughout and needs no kind; the row that opens it is
   naming a record in a list of other records, so it does. */
const RETURNING_ROW_TITLES: Record<WearKind, () => string> = {
  binder: m.coming_back_wear_row_binder,
  tucking: m.coming_back_wear_row_tucking,
  compression: m.coming_back_wear_row_compression
};

const TILE_TITLES: Record<WearKind, () => string> = {
  binder: m.tile_wear_title_binder,
  tucking: m.tile_wear_title_tucking,
  compression: m.tile_wear_title_compression
};

/* The static safety facts (ticket 50 section 4). Three per kind, none of
   them about duration and none of them conditional on the duration cue's
   toggle: these are the near-universally agreed ones, and somebody turning
   off an eight-hour marker is not asking to be told less about tape.

   Every claim traces to a source named in
   `.scratch/phase-8/features/binder-tucking-safety-guidance-research.md`,
   and `source` says which on screen - the same rule ADR-0059 put on the
   voice screen's pitch bands, which is the app's other exception to "no
   medical framing" (docs/ui-copy.md). Binding's three are the research
   file's own "solid enough to state as fact" list, stated independently by
   Point of Pride, Desert AIDS Project, the Rainbow Project and UVM
   Children's Hospital; tucking's come from Trans Lifeline's guide and
   UCSF's clinical page; compression's are Genderkit's generic corset
   precautions, which is the only source found for that practice at all and
   opens by saying the research does not exist.

   Testicular torsion is deliberately absent. It is widely repeated as a
   tucking risk and appears in none of the sources checked, so the ticket
   rules it out by name rather than leaving it to judgment. */
const SAFETY_FACTS: Record<WearKind, { facts: () => string[]; source: () => string }> = {
  binder: {
    facts: () => [m.wear_facts_binder_1(), m.wear_facts_binder_2(), m.wear_facts_binder_3()],
    source: m.wear_facts_binder_source
  },
  tucking: {
    facts: () => [m.wear_facts_tucking_1(), m.wear_facts_tucking_2(), m.wear_facts_tucking_3()],
    source: m.wear_facts_tucking_source
  },
  compression: {
    facts: () => [m.wear_facts_compression_1(), m.wear_facts_compression_2(), m.wear_facts_compression_3()],
    source: m.wear_facts_compression_source
  }
};

export const wearKindLabel = (kind: WearKind): string => KIND_LABELS[kind]();
export const wearAddAria = (kind: WearKind): string => ADD_ARIA[kind]();
export const wearNewSheetTitle = (kind: WearKind): string => NEW_SHEET_TITLES[kind]();
export const wearEditSheetTitle = (kind: WearKind): string => EDIT_SHEET_TITLES[kind]();
export const wearRunningSheetTitle = (kind: WearKind): string => RUNNING_SHEET_TITLES[kind]();
export const wearRunningCardTitle = (kind: WearKind): string => RUNNING_CARD_TITLES[kind]();
export const wearDeleteSheetTitle = (kind: WearKind): string => DELETE_SHEET_TITLES[kind]();
export const wearReminderTitle = (kind: WearKind): string => REMINDER_TITLES[kind]();
export const wearTileTitle = (kind: WearKind): string => TILE_TITLES[kind]();
export const wearReturningRowTitle = (kind: WearKind): string => RETURNING_ROW_TITLES[kind]();
export const wearSafetyFacts = (kind: WearKind): { facts: string[]; source: string } => ({
  facts: SAFETY_FACTS[kind].facts(),
  source: SAFETY_FACTS[kind].source()
});
