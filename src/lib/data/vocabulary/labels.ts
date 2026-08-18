/* Display names for the built-in vocabulary, looked up by key at display
   time (F25, and CONTEXT: Built-in). builtins.ts stores no text at all, so
   this is where a built-in gets its wording - and where it changes when the
   language does.

   Each map is typed against the key union builtins.ts derives from its own
   `as const` list, so adding a built-in without adding its message is a
   typecheck failure rather than a raw key on screen.

   This file imports paraglide, so nothing the Node tier touches may import
   it (ADR-0016). The seam is exact: builtins.ts is the data, this is the
   wording, and vocabulary.ts joins them for the screens. */

import { m } from '$lib/paraglide/messages';
import type { BodyRegionKey } from '../bodyMap';
import type {
  BuiltInDimensionKey,
  BuiltInPresetKey,
  BuiltInTagGroupKey,
  BuiltInTagKey,
  MilestoneTemplateKey
} from './builtins';
import type { Measurement, NorwoodHamiltonStage, PersonalEffectType } from '../types';

type Message = (inputs?: {}, options?: { locale?: 'en' | 'pl' }) => string;

const DIMENSION_NAME: Record<BuiltInDimensionKey, Message> = {
  euphoria_dysphoria: m.dim_euphoria_dysphoria,
  femininity: m.dim_femininity,
  masculinity: m.dim_masculinity,
  binary_nonbinary: m.dim_binary_nonbinary,
  agender_gendered: m.dim_agender_gendered
};

const DIMENSION_LOW: Record<BuiltInDimensionKey, Message> = {
  euphoria_dysphoria: m.dim_euphoria_dysphoria_low,
  femininity: m.dim_femininity_low,
  masculinity: m.dim_masculinity_low,
  binary_nonbinary: m.dim_binary_nonbinary_low,
  agender_gendered: m.dim_agender_gendered_low
};

const DIMENSION_HIGH: Record<BuiltInDimensionKey, Message> = {
  euphoria_dysphoria: m.dim_euphoria_dysphoria_high,
  femininity: m.dim_femininity_high,
  masculinity: m.dim_masculinity_high,
  binary_nonbinary: m.dim_binary_nonbinary_high,
  agender_gendered: m.dim_agender_gendered_high
};

/* Mood is not a built-in row - it is a column on the entry - but its five
   names are vocabulary all the same, and three places needed them: the
   picker, the entry card's label, and the heat-map legend, which is the
   one metric whose legend does read worst to best (ADR-0012). They were
   hardcoded English in two of those before. */
const MOOD_NAME: Message[] = [m.mood_1, m.mood_2, m.mood_3, m.mood_4, m.mood_5];

/** The name of a mood, 1 to 5. */
export const moodName = (value: number): string => MOOD_NAME[value - 1]?.() ?? String(value);

/* A measurement's type (phase 4 ticket 08) is a fixed set of four, not a
   built-in row - there is nothing to seed and nothing to hide - but the
   name is still wording that changes with the language, so it lives here
   like severity's does. */
const MEASUREMENT_TYPE_NAME: Record<Measurement['type'], Message> = {
  waist: m.measurement_type_waist,
  hips: m.measurement_type_hips,
  chest: m.measurement_type_chest,
  underbust: m.measurement_type_underbust
};

/** The name of a measurement type. */
export const measurementTypeName = (type: Measurement['type']): string => MEASUREMENT_TYPE_NAME[type]();

/* The four personal effect markers (phase 4 ticket 07) are a fixed set,
   not a built-in row, the same reasoning MEASUREMENT_TYPE_NAME gives. */
const PERSONAL_EFFECT_NAME: Record<PersonalEffectType, Message> = {
  breast_development: m.effect_breast_development,
  fat_redistribution: m.effect_fat_redistribution,
  skin_softening: m.effect_skin_softening,
  hair_changes: m.effect_hair_changes
};

/** The name of a personal effect marker. */
export const personalEffectName = (effect: PersonalEffectType): string => PERSONAL_EFFECT_NAME[effect]();

/* The published Norwood-Hamilton scale's twelve stage labels (phase 4
   ticket 09) are a fixed set, not a built-in row, the same reasoning
   MEASUREMENT_TYPE_NAME gives - what changes with the language is the
   surrounding word ("Stage 3a"), not the stage code itself. */
const HAIR_STAGE_NAME: Record<NorwoodHamiltonStage, Message> = {
  '1': m.hair_stage_1,
  '2': m.hair_stage_2,
  '2a': m.hair_stage_2a,
  '3': m.hair_stage_3,
  '3v': m.hair_stage_3v,
  '3a': m.hair_stage_3a,
  '4': m.hair_stage_4,
  '4a': m.hair_stage_4a,
  '5': m.hair_stage_5,
  '5a': m.hair_stage_5a,
  '6': m.hair_stage_6,
  '7': m.hair_stage_7
};

/** The name of a Norwood-Hamilton stage. */
export const hairStageName = (stage: NorwoodHamiltonStage): string => HAIR_STAGE_NAME[stage]();

/* A side effect's severity (phase 4 ticket 06, CONTEXT: "Side effect") is a
   1-5 ordered scale like mood, and its five names are vocabulary the same
   way: purely descriptive wording, never a recommendation or a warning. */
const SEVERITY_NAME: Message[] = [m.severity_1, m.severity_2, m.severity_3, m.severity_4, m.severity_5];

/** The name of a severity, 1 to 5. */
export const severityName = (value: number): string => SEVERITY_NAME[value - 1]?.() ?? String(value);

const PRESET_NAME: Record<BuiltInPresetKey, Message> = {
  'p-btw': m.preset_p_btw,
  'p-masc': m.preset_p_masc,
  'p-fem-masc': m.preset_p_fem_masc,
  'p-fluid': m.preset_p_fluid,
  'p-agender': m.preset_p_agender,
  'p-demi-fem': m.preset_p_demi_fem,
  'p-demi-masc': m.preset_p_demi_masc,
  'p-nb': m.preset_p_nb
};

const TAG_GROUP_NAME: Record<BuiltInTagGroupKey, Message> = {
  gender: m.taggroup_gender,
  emotions: m.taggroup_emotions,
  activities: m.taggroup_activities,
  imported: m.taggroup_imported,
  dysphoria_type: m.taggroup_dysphoria_type
};

const TAG_LABEL: Record<BuiltInTagKey, Message> = {
  'g-soc-dys': m.tag_g_soc_dys,
  'g-body-dys': m.tag_g_body_dys,
  'g-soc-eu': m.tag_g_soc_eu,
  'g-body-eu': m.tag_g_body_eu,
  'g-euphoria': m.tag_g_euphoria,
  'g-transphobia': m.tag_g_transphobia,
  'g-gendered-ok': m.tag_g_gendered_ok,
  'g-misgendered': m.tag_g_misgendered,
  'e-happy': m.tag_e_happy,
  'e-calm': m.tag_e_calm,
  'e-anxious': m.tag_e_anxious,
  'e-sad': m.tag_e_sad,
  'e-hopeful': m.tag_e_hopeful,
  'e-tired': m.tag_e_tired,
  'a-work': m.tag_a_work,
  'a-friends': m.tag_a_friends,
  'a-family': m.tag_a_family,
  'a-exercise': m.tag_a_exercise,
  'a-therapy': m.tag_a_therapy,
  'a-shopping': m.tag_a_shopping,
  'a-selfcare': m.tag_a_selfcare,
  'dt-physical': m.tag_dt_physical,
  'dt-biochemical': m.tag_dt_biochemical,
  'dt-social': m.tag_dt_social,
  'dt-societal': m.tag_dt_societal,
  'dt-sexual': m.tag_dt_sexual,
  'dt-presentational': m.tag_dt_presentational,
  'dt-existential': m.tag_dt_existential
};

/* Dysphoria types only: the seven category names are not self-explanatory
   on their own (CONTEXT: Dysphoria type - "societal" vs "social"), so each
   carries a longer description an info affordance surfaces on demand.
   Nothing else has one, so this is a partial map rather than a Record over
   the full tag key union, and tagDescription() returns null rather than
   falling back to the key the way tagLabel() does. */
const TAG_DESCRIPTION: Partial<Record<BuiltInTagKey, Message>> = {
  'dt-physical': m.tagdesc_dt_physical,
  'dt-biochemical': m.tagdesc_dt_biochemical,
  'dt-social': m.tagdesc_dt_social,
  'dt-societal': m.tagdesc_dt_societal,
  'dt-sexual': m.tagdesc_dt_sexual,
  'dt-presentational': m.tagdesc_dt_presentational,
  'dt-existential': m.tagdesc_dt_existential
};

const BODY_REGION_NAME: Record<BodyRegionKey, Message> = {
  face_jaw: m.region_face_jaw,
  voice_throat: m.region_voice_throat,
  chest: m.region_chest,
  body_facial_hair: m.region_body_facial_hair,
  hands_feet: m.region_hands_feet,
  hips_waist: m.region_hips_waist,
  genitals: m.region_genitals,
  hairline: m.region_hairline
};

const TEMPLATE_NAME: Record<MilestoneTemplateKey, Message> = {
  hrt_start: m.tpl_hrt_start,
  transition_start: m.tpl_transition_start,
  coming_out: m.tpl_coming_out,
  first_appointment: m.tpl_first_appointment,
  name_change: m.tpl_name_change,
  marker_change: m.tpl_marker_change,
  surgery: m.tpl_surgery,
  first_public: m.tpl_first_public
};

/* Each lookup falls back to the key itself. A key with no message means a
   built-in was seeded by a build that knew it and is being read by one that
   doesn't - an archive from a newer version, or a downgrade. Showing the
   key is ugly; dropping the row would lose an entry's tag. */
function lookup<K extends string>(map: Record<K, Message>, key: string): string {
  return (map as Record<string, Message | undefined>)[key]?.() ?? key;
}

export const dimensionName = (key: string) => lookup(DIMENSION_NAME, key);
export const dimensionLow = (key: string) => lookup(DIMENSION_LOW, key);
export const dimensionHigh = (key: string) => lookup(DIMENSION_HIGH, key);
export const presetName = (key: string) => lookup(PRESET_NAME, key);
export const tagGroupName = (key: string) => lookup(TAG_GROUP_NAME, key);
export const tagLabel = (key: string) => lookup(TAG_LABEL, key);
/** The longer explanation a dysphoria type tag carries, or null for every
    other tag - built-in or custom - which has none. */
export const tagDescription = (key: string): string | null => {
  const message = (TAG_DESCRIPTION as Record<string, Message | undefined>)[key];
  return message ? message() : null;
};
/** All supported wordings of a built-in tag, so a Daylio export matches
    the stored key whichever app language is active during import. */
export const tagLabels = (key: string): string[] => {
  const message = (TAG_LABEL as Record<string, Message | undefined>)[key];
  return message ? [message({}, { locale: 'en' }), message({}, { locale: 'pl' })] : [key];
};
export const milestoneTemplateName = (key: string) => lookup(TEMPLATE_NAME, key);
export const bodyRegionName = (key: string) => lookup(BODY_REGION_NAME, key);
