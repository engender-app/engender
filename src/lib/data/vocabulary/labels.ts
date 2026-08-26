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
import type {
  BuiltInAffirmationKey,
  BuiltInBodyRegionKey,
  BuiltInDimensionKey,
  BuiltInEffectCategoryKey,
  BuiltInMeasurementTypeKey,
  BuiltInPersonalEffectKey,
  BuiltInTagGroupKey,
  BuiltInTagKey,
  EntryPromptKey,
  EntryTemplateKey,
  MilestoneTemplateKey
} from './builtins';
import type { CycleEventKind, HairRemovalMethod, TryoutKind } from '../types';
import type { HairScale, NorwoodHamiltonStage, SinclairGrade } from '../hairStageScales';
import type { HairRemovalAreaKey } from '../hairRemovalAreas';
import type { GarmentCategoryKey } from '../garmentCategories';

type Message = (inputs?: {}, options?: { locale?: 'en' | 'pl' }) => string;

/* Two shapes of name, and which one a scale gets follows from its
   endpoints rather than from taste:

     poles      a scale running between two named ends is called "low <->
                high" - "Dysphoria <-> euphoria", "Binary <-> nonbinary",
                "Agender <-> gendered", "Unseen <-> recognised", "Steady
                <-> shifting". The name is the two words a person is
                choosing between, so the slider needs no gloss to be read.
     an amount  a scale running "not at all" to "very" is called after the
                thing being measured - "Femininity", "Masculinity". An
                arrow name here would say "Not at all <-> very", which
                names the ends and not the subject.

   `euphoria_dysphoria` was "Gender feeling" until this rule was written
   down. That name was the only one that said neither its poles nor its
   subject, and once there were seven scales it also over-claimed: all
   seven are gender feelings, so the vague one read as the general case.
   The key keeps its original spelling; only the display name moved. */
const DIMENSION_NAME: Record<BuiltInDimensionKey, Message> = {
  euphoria_dysphoria: m.dim_euphoria_dysphoria,
  femininity: m.dim_femininity,
  masculinity: m.dim_masculinity,
  binary_nonbinary: m.dim_binary_nonbinary,
  agender_gendered: m.dim_agender_gendered,
  social_recognition: m.dim_social_recognition,
  gender_stability: m.dim_gender_stability
};

const DIMENSION_LOW: Record<BuiltInDimensionKey, Message> = {
  euphoria_dysphoria: m.dim_euphoria_dysphoria_low,
  femininity: m.dim_femininity_low,
  masculinity: m.dim_masculinity_low,
  binary_nonbinary: m.dim_binary_nonbinary_low,
  agender_gendered: m.dim_agender_gendered_low,
  social_recognition: m.dim_social_recognition_low,
  gender_stability: m.dim_gender_stability_low
};

const DIMENSION_HIGH: Record<BuiltInDimensionKey, Message> = {
  euphoria_dysphoria: m.dim_euphoria_dysphoria_high,
  femininity: m.dim_femininity_high,
  masculinity: m.dim_masculinity_high,
  binary_nonbinary: m.dim_binary_nonbinary_high,
  agender_gendered: m.dim_agender_gendered_high,
  social_recognition: m.dim_social_recognition_high,
  gender_stability: m.dim_gender_stability_high
};

/* One line per built-in scale saying what it measures (phase 5 ticket 35),
   for the checklist that replaced the eight presets. "Binary <-> nonbinary"
   is not self-explanatory to somebody twenty minutes into this app, and the
   list is the second screen they ever see.

   Its lookup returns null rather than falling back to the key the way the
   three above do. A name has to render as something and a key is better
   than a blank row; a note is a subtitle, and a row with no subtitle is a
   shape this list already draws. */
const DIMENSION_NOTE: Record<BuiltInDimensionKey, Message> = {
  euphoria_dysphoria: m.dim_euphoria_dysphoria_note,
  femininity: m.dim_femininity_note,
  masculinity: m.dim_masculinity_note,
  binary_nonbinary: m.dim_binary_nonbinary_note,
  agender_gendered: m.dim_agender_gendered_note,
  social_recognition: m.dim_social_recognition_note,
  gender_stability: m.dim_gender_stability_note
};

/* Mood is not a built-in row - it is a column on the entry - but its five
   names are vocabulary all the same, and three places needed them: the
   picker, the entry card's label, and the heat-map legend, which is the
   one metric whose legend does read worst to best (ADR-0012). They were
   hardcoded English in two of those before. */
const MOOD_NAME: Message[] = [m.mood_1, m.mood_2, m.mood_3, m.mood_4, m.mood_5];

/** The name of a mood, 1 to 5. */
export const moodName = (value: number): string => MOOD_NAME[value - 1]?.() ?? String(value);

/* A measurement type's four built-ins (phase 4 ticket 08, opened to a
   custom one in phase 5 ticket 29) - keys only, the same "data lives in
   builtins.ts, wording lives here" split every other built-in gets. A
   custom type's name is never looked up here; it is the stored row's own
   name, the same split GenderDimension's name gets (vocabulary.ts). */
const MEASUREMENT_TYPE_NAME: Record<BuiltInMeasurementTypeKey, Message> = {
  waist: m.measurement_type_waist,
  hips: m.measurement_type_hips,
  chest: m.measurement_type_chest,
  underbust: m.measurement_type_underbust
};

/* The personal-effects catalogue (phase 4 ticket 07, widened well past its
   original eight by phase 5 ticket 41) is a built-in reference-data area
   now, the same split MEASUREMENT_TYPE_NAME gives: a custom effect's name
   is never looked up here, it is the stored row's own name
   (vocabulary.ts). Never called for a custom effect - falls back to the
   raw key via `lookup` only for a built-in key a newer build seeded that
   this one does not know the wording of, the same forward-compat reason
   `measurementTypeName` falls back. */
const PERSONAL_EFFECT_NAME: Record<BuiltInPersonalEffectKey, Message> = {
  // Feminizing, tier 1.
  breast_development: m.effect_breast_development,
  fat_redistribution: m.effect_fat_redistribution,
  skin_softening: m.effect_skin_softening,
  hair_changes: m.effect_hair_changes,
  decreased_muscle_mass_strength: m.effect_decreased_muscle_mass_strength,
  decreased_libido: m.effect_decreased_libido,
  decreased_spontaneous_erections: m.effect_decreased_spontaneous_erections,
  decreased_testicular_volume: m.effect_decreased_testicular_volume,
  male_pattern_baldness_ceasing: m.effect_male_pattern_baldness_ceasing,
  // Feminizing, tier 2.
  increased_flexibility_feminizing: m.effect_increased_flexibility_feminizing,
  slimmer_hands_feet_feminizing: m.effect_slimmer_hands_feet_feminizing,
  softer_fingernails_feminizing: m.effect_softer_fingernails_feminizing,
  temperature_sensitivity_feminizing: m.effect_temperature_sensitivity_feminizing,
  perspiration_pattern_feminizing: m.effect_perspiration_pattern_feminizing,
  body_odor_feminizing: m.effect_body_odor_feminizing,
  facial_feature_changes_feminizing: m.effect_facial_feature_changes_feminizing,
  pelvic_tilt_feminizing: m.effect_pelvic_tilt_feminizing,
  reduced_substance_tolerance_feminizing: m.effect_reduced_substance_tolerance_feminizing,
  mental_clarity_feminizing: m.effect_mental_clarity_feminizing,
  adhd_symptom_change_feminizing: m.effect_adhd_symptom_change_feminizing,
  emotional_expansion_feminizing: m.effect_emotional_expansion_feminizing,
  mood_swings_feminizing: m.effect_mood_swings_feminizing,
  appetite_change_feminizing: m.effect_appetite_change_feminizing,
  sleep_change_feminizing: m.effect_sleep_change_feminizing,
  increased_extroversion_feminizing: m.effect_increased_extroversion_feminizing,
  improved_smell_feminizing: m.effect_improved_smell_feminizing,
  improved_color_perception_feminizing: m.effect_improved_color_perception_feminizing,
  improved_spatial_awareness_feminizing: m.effect_improved_spatial_awareness_feminizing,
  taste_perception_change_feminizing: m.effect_taste_perception_change_feminizing,
  reduced_confidence_feminizing: m.effect_reduced_confidence_feminizing,
  genital_sensitivity_increase_feminizing: m.effect_genital_sensitivity_increase_feminizing,
  genital_moisture_odor_feminizing: m.effect_genital_moisture_odor_feminizing,
  genital_skin_texture_change_feminizing: m.effect_genital_skin_texture_change_feminizing,
  fewer_erections_feminizing: m.effect_fewer_erections_feminizing,
  ejaculate_change_feminizing: m.effect_ejaculate_change_feminizing,
  testicular_atrophy_feminizing: m.effect_testicular_atrophy_feminizing,
  heightened_erogenous_zones_feminizing: m.effect_heightened_erogenous_zones_feminizing,
  orgasm_change_feminizing: m.effect_orgasm_change_feminizing,
  attraction_change_feminizing: m.effect_attraction_change_feminizing,
  // Masculinizing, tier 1.
  voice_drop: m.effect_voice_drop,
  facial_body_hair: m.effect_facial_body_hair,
  masculinizing_fat_redistribution: m.effect_masculinizing_fat_redistribution,
  cycle_cessation: m.effect_cycle_cessation,
  skin_oiliness_acne_masculinizing: m.effect_skin_oiliness_acne_masculinizing,
  increased_muscle_mass_strength_masculinizing: m.effect_increased_muscle_mass_strength_masculinizing,
  clitoral_enlargement_masculinizing: m.effect_clitoral_enlargement_masculinizing,
  vaginal_atrophy_masculinizing: m.effect_vaginal_atrophy_masculinizing,
  // Masculinizing, tier 2.
  scalp_hair_loss_masculinizing: m.effect_scalp_hair_loss_masculinizing,
  larger_hands_feet_masculinizing: m.effect_larger_hands_feet_masculinizing,
  thicker_stronger_nails_masculinizing: m.effect_thicker_stronger_nails_masculinizing,
  facial_feature_changes_masculinizing: m.effect_facial_feature_changes_masculinizing,
  increased_substance_tolerance_masculinizing: m.effect_increased_substance_tolerance_masculinizing,
  adhd_symptom_change_masculinizing: m.effect_adhd_symptom_change_masculinizing,
  mental_clarity_masculinizing: m.effect_mental_clarity_masculinizing,
  increased_appetite_masculinizing: m.effect_increased_appetite_masculinizing,
  sleep_change_masculinizing: m.effect_sleep_change_masculinizing,
  increased_confidence_masculinizing: m.effect_increased_confidence_masculinizing,
  increased_extroversion_masculinizing: m.effect_increased_extroversion_masculinizing,
  temperature_sensitivity_masculinizing: m.effect_temperature_sensitivity_masculinizing,
  perspiration_pattern_masculinizing: m.effect_perspiration_pattern_masculinizing,
  body_odor_masculinizing: m.effect_body_odor_masculinizing,
  decreased_lubrication_masculinizing: m.effect_decreased_lubrication_masculinizing,
  increased_ejaculate_emissions_masculinizing: m.effect_increased_ejaculate_emissions_masculinizing,
  genital_sensitivity_change_masculinizing: m.effect_genital_sensitivity_change_masculinizing,
  increased_libido_masculinizing: m.effect_increased_libido_masculinizing,
  orgasm_change_masculinizing: m.effect_orgasm_change_masculinizing,
  attraction_change_masculinizing: m.effect_attraction_change_masculinizing,
  epidermis_thickening_masculinizing: m.effect_epidermis_thickening_masculinizing,
  vein_prominence_masculinizing: m.effect_vein_prominence_masculinizing
};

/** The five effect categories (phase 5 ticket 41, CONTEXT: "Effect
    category") are a fixed set, not a built-in row, the same reasoning
    MEASUREMENT_TYPE_NAME gives. */
const EFFECT_CATEGORY_NAME: Record<BuiltInEffectCategoryKey, Message> = {
  body_shape: m.effect_category_body_shape,
  skin_hair: m.effect_category_skin_hair,
  genital_sexual: m.effect_category_genital_sexual,
  cognitive_emotional: m.effect_category_cognitive_emotional,
  sensory: m.effect_category_sensory
};

/* The published Norwood-Hamilton scale's twelve stage labels (phase 4
   ticket 09) are a fixed set, not a built-in row, the same reasoning
   MEASUREMENT_TYPE_NAME gives - what changes with the language is the
   surrounding word ("Stage 3a"), not the stage code itself. */
const NORWOOD_HAMILTON_STAGE_NAME: Record<NorwoodHamiltonStage, Message> = {
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

/* Sinclair's five grades (phase 5 ticket 33), keyed separately from
   Norwood-Hamilton's rather than folded into one map: '1' through '5' are
   codes on both scales and mean different things on each, so one lookup
   over both would silently hand back the wrong scale's wording. */
const SINCLAIR_GRADE_NAME: Record<SinclairGrade, Message> = {
  '1': m.hair_sinclair_1,
  '2': m.hair_sinclair_2,
  '3': m.hair_sinclair_3,
  '4': m.hair_sinclair_4,
  '5': m.hair_sinclair_5
};

/* Keyed by scale rather than reached by a ternary, so a scale can only ever
   be read against its own wording: a lookup that fell back to one scale's
   map would hand back the wrong classification's label, which is the exact
   confusion this file exists to prevent. 'other' publishes no grades, so its
   map is empty by construction rather than by convention. */
const HAIR_GRADE_NAME: Record<HairScale, Record<string, Message>> = {
  norwood_hamilton: NORWOOD_HAMILTON_STAGE_NAME,
  sinclair: SINCLAIR_GRADE_NAME,
  other: {}
};

/** The name of a staging's grade, under the scale it belongs to, or the raw
    grade for a pair this build's vocabulary does not list. Empty for a scale
    that publishes no grades - a staging under that one shows the person's
    own words instead (isGradedScale, hairStageScales.ts). */
export const hairStageName = (scale: string, stage: string): string =>
  lookup(HAIR_GRADE_NAME[scale as HairScale] ?? {}, stage);

const HAIR_SCALE_NAME: Record<HairScale, Message> = {
  norwood_hamilton: m.hair_scale_norwood_hamilton,
  sinclair: m.hair_scale_sinclair,
  other: m.hair_scale_other
};

/** The name of a published scale, or of the option for a pattern neither
    of them describes. */
export const hairScaleName = (scale: string): string => lookup(HAIR_SCALE_NAME, scale);

/* One descriptive line per scale, so a person can tell which one describes
   what they see without leaving the screen to look either up. What each
   scale is read off, and how many grades it has - never what a grade
   means, and never a word about what follows from one. */
const HAIR_SCALE_SUB: Record<HairScale, Message> = {
  norwood_hamilton: m.hair_scale_norwood_hamilton_sub,
  sinclair: m.hair_scale_sinclair_sub,
  other: m.hair_scale_other_sub
};

/** What a scale is read off, in a line. */
export const hairScaleSub = (scale: string): string => lookup(HAIR_SCALE_SUB, scale);

/* A side effect's severity (phase 4 ticket 06, CONTEXT: "Side effect") is a
   1-5 ordered scale like mood, and its five names are vocabulary the same
   way: purely descriptive wording, never a recommendation or a warning. */
const SEVERITY_NAME: Message[] = [m.severity_1, m.severity_2, m.severity_3, m.severity_4, m.severity_5];

/** The name of a severity, 1 to 5. */
export const severityName = (value: number): string => SEVERITY_NAME[value - 1]?.() ?? String(value);

/* Hair-removal treatment areas (phase 5 ticket 08) are a fixed set, not a
   built-in row, the same reasoning MEASUREMENT_TYPE_NAME gives - and their
   own vocabulary, deliberately not BODY_REGION_NAME below. */
const HAIR_REMOVAL_AREA_NAME: Record<HairRemovalAreaKey, Message> = {
  upper_lip: m.hair_removal_area_upper_lip,
  chin: m.hair_removal_area_chin,
  neck: m.hair_removal_area_neck,
  underarms: m.hair_removal_area_underarms,
  chest: m.hair_removal_area_chest,
  abdomen: m.hair_removal_area_abdomen,
  back: m.hair_removal_area_back,
  arms: m.hair_removal_area_arms,
  legs: m.hair_removal_area_legs,
  bikini_line: m.hair_removal_area_bikini_line
};

/** The name of a hair-removal treatment area, or the raw key for one an
    import carries that this build's vocabulary no longer lists. */
export const hairRemovalAreaName = (area: string): string => lookup(HAIR_REMOVAL_AREA_NAME, area);

const HAIR_REMOVAL_METHOD_NAME: Record<HairRemovalMethod, Message> = {
  laser: m.hair_removal_method_laser,
  electrolysis: m.hair_removal_method_electrolysis,
  other: m.hair_removal_method_other
};

/** The name of a hair-removal method. */
export const hairRemovalMethodName = (method: HairRemovalMethod): string => HAIR_REMOVAL_METHOD_NAME[method]();

/* Garment categories (phase 5 ticket 23) are a fixed set, not a built-in
   row, the same reasoning MEASUREMENT_TYPE_NAME gives - and their own
   vocabulary, since a size record's category is unrelated to any other
   closed list in the app. */
const GARMENT_CATEGORY_NAME: Record<GarmentCategoryKey, Message> = {
  shirts: m.size_log_category_shirts,
  pants: m.size_log_category_pants,
  dresses: m.size_log_category_dresses,
  skirts: m.size_log_category_skirts,
  bras: m.size_log_category_bras,
  underwear: m.size_log_category_underwear,
  shoes: m.size_log_category_shoes,
  outerwear: m.size_log_category_outerwear
};

/** The name of a garment category, or the raw key for one an import carries
    that this build's vocabulary no longer lists. */
export const garmentCategoryName = (category: string): string => lookup(GARMENT_CATEGORY_NAME, category);

/* A tryout's kind (phase 4 ticket 16, widened by phase 5 ticket 13) is a
   fixed set, not a built-in row, the same reasoning HAIR_REMOVAL_METHOD_NAME
   gives. */
const TRYOUT_KIND_NAME: Record<TryoutKind, Message> = {
  name: m.tryout_kind_name,
  pronouns: m.tryout_kind_pronouns,
  style: m.tryout_kind_style,
  garment: m.tryout_kind_garment,
  makeup: m.tryout_kind_makeup,
  presentation_step: m.tryout_kind_presentation_step
};

/** The name of a tryout's kind. */
export const tryoutKindName = (kind: TryoutKind): string => TRYOUT_KIND_NAME[kind]();

/* A cycle event's three kinds (phase 5 ticket 03, CONTEXT: "Cycle event")
   are a fixed set, not a built-in row, the same reasoning
   MEASUREMENT_TYPE_NAME gives. */
const CYCLE_EVENT_KIND_NAME: Record<CycleEventKind, Message> = {
  period_occurred: m.cycle_event_kind_period_occurred,
  spotting: m.cycle_event_kind_spotting,
  nothing_this_month: m.cycle_event_kind_nothing_this_month
};

/** The name of a cycle event kind. */
export const cycleEventKindName = (kind: CycleEventKind): string => CYCLE_EVENT_KIND_NAME[kind]();


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

const AFFIRMATION_TEXT: Record<BuiltInAffirmationKey, Message> = {
  affirmation_1: m.affirmation_1,
  affirmation_2: m.affirmation_2,
  affirmation_3: m.affirmation_3,
  affirmation_4: m.affirmation_4,
  affirmation_5: m.affirmation_5,
  affirmation_6: m.affirmation_6,
  affirmation_7: m.affirmation_7,
  affirmation_8: m.affirmation_8,
  affirmation_9: m.affirmation_9,
  affirmation_10: m.affirmation_10,
  affirmation_11: m.affirmation_11,
  affirmation_12: m.affirmation_12,
  affirmation_13: m.affirmation_13,
  affirmation_14: m.affirmation_14
};

/** The wording of a built-in affirmation line. */
export const affirmationText = (key: string) => lookup(AFFIRMATION_TEXT, key);

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

const BODY_REGION_NAME: Record<BuiltInBodyRegionKey, Message> = {
  face_jaw: m.region_face_jaw,
  voice_throat: m.region_voice_throat,
  chest: m.region_chest,
  body_facial_hair: m.region_body_facial_hair,
  hands_feet: m.region_hands_feet,
  hips_waist: m.region_hips_waist,
  genitals: m.region_genitals,
  hairline: m.region_hairline,
  shoulders: m.region_shoulders,
  whole_body: m.region_whole_body
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

const ENTRY_TEMPLATE_NAME: Record<EntryTemplateKey, Message> = {
  euphoria_day: m.tpl_entry_euphoria_day,
  dysphoria_day: m.tpl_entry_dysphoria_day,
  gendered_correctly: m.tpl_entry_gendered_correctly,
  misgendered: m.tpl_entry_misgendered,
  good_day: m.tpl_entry_good_day,
  hard_day: m.tpl_entry_hard_day
};

const ENTRY_PROMPT_TEXT: Record<EntryPromptKey, Message> = {
  euphoria_moment: m.prompt_euphoria_moment,
  dysphoria_moment: m.prompt_dysphoria_moment,
  body_feeling: m.prompt_body_feeling,
  seen_moment: m.prompt_seen_moment,
  self_care: m.prompt_self_care,
  presentation_feeling: m.prompt_presentation_feeling,
  name_pronouns_feeling: m.prompt_name_pronouns_feeling,
  proud_moment: m.prompt_proud_moment
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
export const dimensionNote = (key: string): string | null =>
  (DIMENSION_NOTE as Record<string, Message | undefined>)[key]?.() ?? null;
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
/** The name of a built-in measurement type. Never called for a custom
    one - vocabulary.ts reads a custom's name from its own stored row -
    but falls back to the key like dimensionName does, for a built-in
    key a newer build seeded that this one does not know the wording of. */
export const measurementTypeName = (key: string) => lookup(MEASUREMENT_TYPE_NAME, key);
/** The name of a built-in personal effect, or the raw key for one a newer
    build seeded that this one does not know the wording of. */
export const personalEffectName = (key: string): string => lookup(PERSONAL_EFFECT_NAME, key);
/** The name of an effect category. */
export const effectCategoryName = (key: string): string => lookup(EFFECT_CATEGORY_NAME, key);
export const milestoneTemplateName = (key: string) => lookup(TEMPLATE_NAME, key);
export const bodyRegionName = (key: string) => lookup(BODY_REGION_NAME, key);
export const entryTemplateName = (key: string) => lookup(ENTRY_TEMPLATE_NAME, key);
export const entryPromptText = (key: string) => lookup(ENTRY_PROMPT_TEXT, key);
