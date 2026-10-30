/* Wording for the transition roadmap (phase 4 ticket 23): a pack name,
   and a title plus an optional note per goal. roadmap.ts holds
   the keys and takes no paraglide, the same split builtins.ts and this
   file's neighbour labels.ts keep (ADR-0002, ADR-0016).

   The title map is a full Record over every bundled goal key, so a goal
   added to a pack without wording is a typecheck failure rather than a raw
   key on screen. Notes are Partial on purpose: a goal with nothing
   procedural to add gets no note, since a forced one would be filler.

   The Polish pack's legal and procedural wording was checked against
   tranzycja.pl (the step-by-step guides on medical transition, the court
   case and the USC name change), the Supreme Court's own announcement of
   resolution III CZP 6/24 of 4 March 2025, the Ombudsman's guide to
   ustalenie plci proceedings, and the relevant gov.pl pages, on the date
   POLISH_PACK.reviewedOn records. What that check turned up is said out
   loud rather than hidden: roadmap_caveat_pl names that there is still no
   gender recognition statute and that whether identity alone grounds a
   change is pending before the Supreme Court as III CZP 20/26, and
   roadmap_marker_note_pl names that the recorded sex marker itself only
   ever holds K or M, so no procedure produces a third value. Both are
   their own strings rather than one long caveat, on docs/ui-copy.md's
   sentence-count rule for an explanation.

   Every item describes procedure. None of them tells anyone what to do
   about their own case, which is the ticket's out-of-scope line and the
   reason the notes carry deadlines and fees rather than recommendations. */

import { m } from '$lib/paraglide/messages';
import { INSTITUTION_STATUSES, isOneOf } from '../rowValues';
import type { LEGACY_ROADMAP_TRACKS, RoadmapGoalKey, RoadmapInstitutionKey, RoadmapPackKey } from '../roadmap';
import type { RoadmapCategory, RoadmapInstitution } from '../types';

type Message = (inputs?: {}, options?: { locale?: 'en' | 'pl' }) => string;

const PACK_NAME: Record<RoadmapPackKey, Message> = {
  pl: m.roadmap_pack_pl
};

/* What a reader has to know before reading a pack: what the procedure
   rests on and what about it is unsettled. Per pack, because the next
   country's answer will be a different one. */
const PACK_CAVEAT: Record<RoadmapPackKey, Message> = {
  pl: m.roadmap_caveat_pl
};

/* The recorded sex marker's binary range, said as its own sentence pair
   rather than folded into PACK_CAVEAT, which was already at
   docs/ui-copy.md's two-sentence cap for an explanation before this fact
   existed. */
const PACK_MARKER_NOTE: Record<RoadmapPackKey, Message> = {
  pl: m.roadmap_marker_note_pl
};

const PACK_SOURCES: Record<RoadmapPackKey, Message> = {
  pl: m.roadmap_sources_pl
};

const GOAL_TITLE: Record<RoadmapGoalKey, Message> = {
  'pl-legal-birth-certificate': m.roadmap_goal_pl_legal_birth_certificate,
  'pl-legal-which-court': m.roadmap_goal_pl_legal_which_court,
  'pl-legal-court-fee': m.roadmap_goal_pl_legal_court_fee,
  'pl-legal-opinions': m.roadmap_goal_pl_legal_opinions,
  'pl-legal-application': m.roadmap_goal_pl_legal_application,
  'pl-legal-file-it': m.roadmap_goal_pl_legal_file_it,
  'pl-legal-formal-defects': m.roadmap_goal_pl_legal_formal_defects,
  'pl-legal-remote-hearing': m.roadmap_goal_pl_legal_remote_hearing,
  'pl-legal-closed-hearing': m.roadmap_goal_pl_legal_closed_hearing,
  'pl-legal-fee-waiver': m.roadmap_goal_pl_legal_fee_waiver,
  'pl-legal-expert': m.roadmap_goal_pl_legal_expert,
  'pl-legal-written-reasons': m.roadmap_goal_pl_legal_written_reasons,
  'pl-legal-appeal': m.roadmap_goal_pl_legal_appeal,
  'pl-legal-final-copy': m.roadmap_goal_pl_legal_final_copy,
  'pl-legal-new-birth-copy': m.roadmap_goal_pl_legal_new_birth_copy,
  'pl-legal-name-usc': m.roadmap_goal_pl_legal_name_usc,
  'pl-legal-document-set': m.roadmap_goal_pl_legal_document_set
};

const GOAL_NOTE: Partial<Record<RoadmapGoalKey, Message>> = {
  'pl-legal-which-court': m.roadmap_note_pl_legal_which_court,
  'pl-legal-court-fee': m.roadmap_note_pl_legal_court_fee,
  'pl-legal-opinions': m.roadmap_note_pl_legal_opinions,
  'pl-legal-application': m.roadmap_note_pl_legal_application,
  'pl-legal-file-it': m.roadmap_note_pl_legal_file_it,
  'pl-legal-formal-defects': m.roadmap_note_pl_legal_formal_defects,
  'pl-legal-remote-hearing': m.roadmap_note_pl_legal_remote_hearing,
  'pl-legal-closed-hearing': m.roadmap_note_pl_legal_closed_hearing,
  'pl-legal-fee-waiver': m.roadmap_note_pl_legal_fee_waiver,
  'pl-legal-expert': m.roadmap_note_pl_legal_expert,
  'pl-legal-written-reasons': m.roadmap_note_pl_legal_written_reasons,
  'pl-legal-appeal': m.roadmap_note_pl_legal_appeal,
  'pl-legal-final-copy': m.roadmap_note_pl_legal_final_copy,
  'pl-legal-new-birth-copy': m.roadmap_note_pl_legal_new_birth_copy,
  'pl-legal-name-usc': m.roadmap_note_pl_legal_name_usc,
  'pl-legal-document-set': m.roadmap_note_pl_legal_document_set
};

/* A second, independent note for a goal whose first note is already at the
   two-sentence cap. Partial and keyed the same way GOAL_NOTE is.
   pl-legal-application's points at roadmap_marker_note_pl rather than
   repeating it, since its title ("the application to change the sex
   marker") is the one legal-track sentence the ticket found reading as a
   route open to every reader now that the caveat says otherwise. */
const GOAL_NOTE_SECONDARY: Partial<Record<RoadmapGoalKey, Message>> = {
  'pl-legal-application': m.roadmap_note_pl_legal_application_marker
};

/** The country a pack describes. */
export const roadmapPackName = (pack: RoadmapPackKey): string => PACK_NAME[pack]();

/** What the pack's procedure rests on, and what about it is unsettled. */
export const roadmapPackCaveat = (pack: RoadmapPackKey): string => PACK_CAVEAT[pack]();

/** What values the recorded marker this pack's procedure changes can hold. */
export const roadmapPackMarkerNote = (pack: RoadmapPackKey): string => PACK_MARKER_NOTE[pack]();

/** Where the pack's content was taken from. */
export const roadmapPackSources = (pack: RoadmapPackKey): string => PACK_SOURCES[pack]();

/** What a goal asks for. */
export const roadmapGoalTitle = (goal: RoadmapGoalKey): string => GOAL_TITLE[goal]();

/** The procedural detail behind a goal, where it has one. */
export const roadmapGoalNote = (goal: RoadmapGoalKey): string | null => GOAL_NOTE[goal]?.() ?? null;

/** A second, independent line for a goal whose first note has one. */
export const roadmapGoalNoteSecondary = (goal: RoadmapGoalKey): string | null =>
  GOAL_NOTE_SECONDARY[goal]?.() ?? null;

/* The names of the tracks functional audit ticket 34 cut, for the nameless
   categories migration 111 made out of them (roadmap.ts,
   LEGACY_ROADMAP_TRACKS). Said in the current language until somebody
   renames the category. */
const LEGACY_CATEGORY_NAME: Record<(typeof LEGACY_ROADMAP_TRACKS)[number], Message> = {
  social: m.roadmap_category_social,
  presentational: m.roadmap_category_presentational,
  medical: m.roadmap_category_medical
};

/** A category's heading: what the person named it, or a cut track's own
    name for a category migration 111 made and nobody has renamed. */
export const roadmapCategoryName = (category: RoadmapCategory): string =>
  category.name || (LEGACY_CATEGORY_NAME[category.id as keyof typeof LEGACY_CATEGORY_NAME]?.() ?? '');

/* The institutions (functional audit ticket 35). Every one has a note:
   each says who acts and on what, which is what somebody standing at that
   office needs. The notes for the ID card, passport and driving licence
   are the post-ruling steps' own, unchanged; the rest were checked against
   gov.pl, ZUS and the Ombudsman on INSTITUTIONS_REVIEWED_ON. */
const INSTITUTION_NAME: Record<RoadmapInstitutionKey, Message> = {
  'pl-legal-pesel': m.roadmap_institution_pl_legal_pesel,
  'pl-legal-id-card': m.roadmap_institution_pl_legal_id_card,
  'pl-legal-passport': m.roadmap_institution_pl_legal_passport,
  'pl-legal-driving-licence': m.roadmap_institution_pl_legal_driving_licence,
  'pl-legal-bank': m.roadmap_institution_pl_legal_bank,
  'pl-legal-zus-ceidg': m.roadmap_institution_pl_legal_zus_ceidg,
  'pl-legal-employer': m.roadmap_institution_pl_legal_employer,
  'pl-legal-diplomas': m.roadmap_institution_pl_legal_diplomas
};

const INSTITUTION_NOTE: Record<RoadmapInstitutionKey, Message> = {
  'pl-legal-pesel': m.roadmap_institution_note_pl_legal_pesel,
  'pl-legal-id-card': m.roadmap_institution_note_pl_legal_id_card,
  'pl-legal-passport': m.roadmap_institution_note_pl_legal_passport,
  'pl-legal-driving-licence': m.roadmap_institution_note_pl_legal_driving_licence,
  'pl-legal-bank': m.roadmap_institution_note_pl_legal_bank,
  'pl-legal-zus-ceidg': m.roadmap_institution_note_pl_legal_zus_ceidg,
  'pl-legal-employer': m.roadmap_institution_note_pl_legal_employer,
  'pl-legal-diplomas': m.roadmap_institution_note_pl_legal_diplomas
};

/** A built-in institution's name. */
export const roadmapInstitutionName = (key: RoadmapInstitutionKey): string => INSTITUTION_NAME[key]();

/** What a built-in institution does with the ruling, in a sentence or two. */
export const roadmapInstitutionNote = (key: RoadmapInstitutionKey): string => INSTITUTION_NOTE[key]();

/** An institution the person added, by its own name. */
export const ownInstitutionName = (institution: RoadmapInstitution): string => institution.name;

const STATUS_WORD: Record<(typeof INSTITUTION_STATUSES)[number], Message> = {
  submitted: m.roadmap_institution_status_submitted,
  waiting: m.roadmap_institution_status_waiting,
  done: m.roadmap_institution_status_done
};

/** One change's status as a word. A stored word outside the three (the
    column has no CHECK) reads as "changed", the CHECK policy's "other";
    writes and archive import both refuse one. */
export const institutionStatusWord = (status: string): string =>
  isOneOf(INSTITUTION_STATUSES, status) ? STATUS_WORD[status]() : m.roadmap_institution_status_other();

/** Where an institution stands, as the line under its name. */
export function institutionStateLine(state: { status: string | null; epochDay: number | null }, day: (epochDay: number) => string): string {
  if (state.status === null || state.epochDay === null) return m.roadmap_institution_not_started();
  const date = day(state.epochDay);
  if (state.status === 'submitted') return m.roadmap_institution_submitted_on({ date });
  if (state.status === 'waiting') return m.roadmap_institution_waiting_since({ date });
  if (state.status === 'done') return m.roadmap_institution_done_on({ date });
  return m.roadmap_institution_changed_on({ date });
}
