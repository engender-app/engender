/* Localize each WearKind (ADR-0064). Exhaustive records make a missing
   kind a type error. Use whole messages because Polish noun forms vary
   across contexts. Keep wearSessions.ts free of Paraglide (ADR-0016).

   Shared surfaces, the tile switch and empty state use generic wording.
   rem provenance sees only autoSource, so its hint also stays generic. */

/* Relative rather than `$lib`, unlike doseLabels.ts beside it: liveTiles.ts
   reads this file for the wear tile's title, and liveTiles.grid.test.ts
   runs on the Node tier, where no alias exists (vitest.config.ts). */
import { m } from '../../paraglide/messages';
import type { WearKind } from '../types';
import { WEAR_SAFETY_REVIEWED_ON } from '../journal/wearSessions';

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

/* The return surface names the kind of a session still running through a
   gap, then links to Wear to close it. */
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

/* Keep three safety facts per kind visible independently of the
   duration cue. Binding guidance draws on Point of Pride, Desert
   AIDS Project, the Rainbow Project and UVM Children's Hospital.
   Tucking sources are Trans Lifeline and UCSF. Compression uses
   Genderkit's corset precautions, which acknowledge limited evidence.
   The checked sources do not substantiate testicular torsion. */
export interface WearSafetyFact {
  text: string;
  reviewedOn: string;
}

const reviewedFact = (text: string): WearSafetyFact => ({ text, reviewedOn: WEAR_SAFETY_REVIEWED_ON });

const SAFETY_FACTS: Record<WearKind, { facts: () => WearSafetyFact[]; source: () => string }> = {
  binder: {
    facts: () => [reviewedFact(m.wear_facts_binder_1()), reviewedFact(m.wear_facts_binder_2()), reviewedFact(m.wear_facts_binder_3())],
    source: m.wear_facts_binder_source
  },
  tucking: {
    facts: () => [reviewedFact(m.wear_facts_tucking_1()), reviewedFact(m.wear_facts_tucking_2()), reviewedFact(m.wear_facts_tucking_3())],
    source: m.wear_facts_tucking_source
  },
  compression: {
    facts: () => [reviewedFact(m.wear_facts_compression_1()), reviewedFact(m.wear_facts_compression_2()), reviewedFact(m.wear_facts_compression_3())],
    source: m.wear_facts_compression_source
  }
};

function labelForKind(record: Record<WearKind, () => string>, kind: WearKind): string {
  return Object.prototype.hasOwnProperty.call(record, kind) ? record[kind]() : kind;
}

export const wearKindLabel = (kind: WearKind): string => labelForKind(KIND_LABELS, kind);
export const wearAddAria = (kind: WearKind): string => labelForKind(ADD_ARIA, kind);
export const wearNewSheetTitle = (kind: WearKind): string => labelForKind(NEW_SHEET_TITLES, kind);
export const wearEditSheetTitle = (kind: WearKind): string => labelForKind(EDIT_SHEET_TITLES, kind);
export const wearRunningSheetTitle = (kind: WearKind): string => labelForKind(RUNNING_SHEET_TITLES, kind);
export const wearRunningCardTitle = (kind: WearKind): string => labelForKind(RUNNING_CARD_TITLES, kind);
export const wearDeleteSheetTitle = (kind: WearKind): string => labelForKind(DELETE_SHEET_TITLES, kind);
export const wearReminderTitle = (kind: WearKind): string => labelForKind(REMINDER_TITLES, kind);
export const wearTileTitle = (kind: WearKind): string => labelForKind(TILE_TITLES, kind);
export const wearReturningRowTitle = (kind: WearKind): string => labelForKind(RETURNING_ROW_TITLES, kind);
export const wearSafetyFacts = (kind: WearKind): { facts: WearSafetyFact[]; source: string } =>
  Object.prototype.hasOwnProperty.call(SAFETY_FACTS, kind)
    ? { facts: SAFETY_FACTS[kind].facts(), source: SAFETY_FACTS[kind].source() }
    : { facts: [], source: '' };
