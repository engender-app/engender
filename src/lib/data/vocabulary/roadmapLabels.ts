/* Wording for the transition roadmap (phase 4 ticket 23): a track name, a
   pack name, and a title plus an optional note per goal. roadmap.ts holds
   the keys and takes no paraglide, the same split builtins.ts and this
   file's neighbour labels.ts keep (ADR-0002, ADR-0016).

   The title map is a full Record over every bundled goal key, so a goal
   added to a pack without wording is a typecheck failure rather than a raw
   key on screen. Notes are Partial on purpose: a social step like telling
   one person has nothing procedural to add, and a forced note there would
   be filler.

   The Polish pack's legal and procedural wording was checked against
   tranzycja.pl (the step-by-step guides on medical transition, the court
   case and the USC name change), the Supreme Court's own announcement of
   resolution III CZP 6/24 of 4 March 2025, the Ombudsman's guide to
   ustalenie plci proceedings, and the relevant gov.pl pages, on the date
   POLISH_PACK.reviewedOn records. Two things that check turned up are said
   out loud in roadmap_caveat_pl rather than hidden: there is still no
   gender recognition statute, and whether identity alone grounds a change
   is pending before the Supreme Court as III CZP 20/26.

   Every item describes procedure. None of them tells anyone what to do
   about their own case, which is the ticket's out-of-scope line and the
   reason the notes carry deadlines and fees rather than recommendations. */

import { m } from '$lib/paraglide/messages';
import type { RoadmapGoalKey, RoadmapPackKey, RoadmapTrack } from '../roadmap';

type Message = (inputs?: {}, options?: { locale?: 'en' | 'pl' }) => string;

const TRACK_NAME: Record<RoadmapTrack, Message> = {
  social: m.roadmap_track_social,
  legal: m.roadmap_track_legal,
  presentational: m.roadmap_track_presentational,
  medical: m.roadmap_track_medical
};

const PACK_NAME: Record<RoadmapPackKey, Message> = {
  pl: m.roadmap_pack_pl
};

/* What a reader has to know before reading a pack: what the procedure
   rests on and what about it is unsettled. Per pack, because the next
   country's answer will be a different one. */
const PACK_CAVEAT: Record<RoadmapPackKey, Message> = {
  pl: m.roadmap_caveat_pl
};

const PACK_SOURCES: Record<RoadmapPackKey, Message> = {
  pl: m.roadmap_sources_pl
};

const GOAL_TITLE: Record<RoadmapGoalKey, Message> = {
  'pl-social-tell-one-person': m.roadmap_goal_pl_social_tell_one_person,
  'pl-social-close-people': m.roadmap_goal_pl_social_close_people,
  'pl-social-name-at-work': m.roadmap_goal_pl_social_name_at_work,
  'pl-social-community': m.roadmap_goal_pl_social_community,
  'pl-presentational-clothes': m.roadmap_goal_pl_presentational_clothes,
  'pl-presentational-voice': m.roadmap_goal_pl_presentational_voice,
  'pl-presentational-hair': m.roadmap_goal_pl_presentational_hair,
  'pl-presentational-photo': m.roadmap_goal_pl_presentational_photo,
  'pl-medical-two-specialists': m.roadmap_goal_pl_medical_two_specialists,
  'pl-medical-psychologist': m.roadmap_goal_pl_medical_psychologist,
  'pl-medical-psych-opinion': m.roadmap_goal_pl_medical_psych_opinion,
  'pl-medical-doctor-opinion': m.roadmap_goal_pl_medical_doctor_opinion,
  'pl-medical-diagnosis-code': m.roadmap_goal_pl_medical_diagnosis_code,
  'pl-medical-bloodwork': m.roadmap_goal_pl_medical_bloodwork,
  'pl-medical-keep-opinions': m.roadmap_goal_pl_medical_keep_opinions,
  'pl-legal-birth-certificate': m.roadmap_goal_pl_legal_birth_certificate,
  'pl-legal-which-court': m.roadmap_goal_pl_legal_which_court,
  'pl-legal-court-fee': m.roadmap_goal_pl_legal_court_fee,
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
  'pl-legal-pesel': m.roadmap_goal_pl_legal_pesel,
  'pl-legal-new-birth-copy': m.roadmap_goal_pl_legal_new_birth_copy,
  'pl-legal-name-usc': m.roadmap_goal_pl_legal_name_usc,
  'pl-legal-id-card': m.roadmap_goal_pl_legal_id_card,
  'pl-legal-passport': m.roadmap_goal_pl_legal_passport,
  'pl-legal-driving-licence': m.roadmap_goal_pl_legal_driving_licence,
  'pl-legal-zus-ceidg': m.roadmap_goal_pl_legal_zus_ceidg,
  'pl-legal-diplomas': m.roadmap_goal_pl_legal_diplomas,
  'pl-legal-institutions': m.roadmap_goal_pl_legal_institutions,
  'pl-legal-document-set': m.roadmap_goal_pl_legal_document_set
};

const GOAL_NOTE: Partial<Record<RoadmapGoalKey, Message>> = {
  'pl-social-name-at-work': m.roadmap_note_pl_social_name_at_work,
  'pl-presentational-voice': m.roadmap_note_pl_presentational_voice,
  'pl-presentational-hair': m.roadmap_note_pl_presentational_hair,
  'pl-presentational-photo': m.roadmap_note_pl_presentational_photo,
  'pl-medical-two-specialists': m.roadmap_note_pl_medical_two_specialists,
  'pl-medical-psychologist': m.roadmap_note_pl_medical_psychologist,
  'pl-medical-psych-opinion': m.roadmap_note_pl_medical_psych_opinion,
  'pl-medical-doctor-opinion': m.roadmap_note_pl_medical_doctor_opinion,
  'pl-medical-diagnosis-code': m.roadmap_note_pl_medical_diagnosis_code,
  'pl-medical-bloodwork': m.roadmap_note_pl_medical_bloodwork,
  'pl-medical-keep-opinions': m.roadmap_note_pl_medical_keep_opinions,
  'pl-legal-which-court': m.roadmap_note_pl_legal_which_court,
  'pl-legal-court-fee': m.roadmap_note_pl_legal_court_fee,
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
  'pl-legal-pesel': m.roadmap_note_pl_legal_pesel,
  'pl-legal-new-birth-copy': m.roadmap_note_pl_legal_new_birth_copy,
  'pl-legal-name-usc': m.roadmap_note_pl_legal_name_usc,
  'pl-legal-id-card': m.roadmap_note_pl_legal_id_card,
  'pl-legal-passport': m.roadmap_note_pl_legal_passport,
  'pl-legal-driving-licence': m.roadmap_note_pl_legal_driving_licence,
  'pl-legal-zus-ceidg': m.roadmap_note_pl_legal_zus_ceidg,
  'pl-legal-diplomas': m.roadmap_note_pl_legal_diplomas,
  'pl-legal-institutions': m.roadmap_note_pl_legal_institutions,
  'pl-legal-document-set': m.roadmap_note_pl_legal_document_set
};

/** The name of a track: social, legal, presentational or medical. */
export const roadmapTrackName = (track: RoadmapTrack): string => TRACK_NAME[track]();

/** The country a pack describes. */
export const roadmapPackName = (pack: RoadmapPackKey): string => PACK_NAME[pack]();

/** What the pack's procedure rests on, and what about it is unsettled. */
export const roadmapPackCaveat = (pack: RoadmapPackKey): string => PACK_CAVEAT[pack]();

/** Where the pack's content was taken from. */
export const roadmapPackSources = (pack: RoadmapPackKey): string => PACK_SOURCES[pack]();

/** What a goal asks for. */
export const roadmapGoalTitle = (goal: RoadmapGoalKey): string => GOAL_TITLE[goal]();

/** The procedural detail behind a goal, where it has one. */
export const roadmapGoalNote = (goal: RoadmapGoalKey): string | null => GOAL_NOTE[goal]?.() ?? null;
