/* The built-in vocabulary every install gets: seven gender dimensions, eight
  presets, five tag groups and eight milestone templates.

   Keys only, no display text. A built-in is the same concept on any
   device, so it is identified by a stable key and its name is looked up at
   display time (ADR-0002, and CONTEXT: Built-in). Storing "Femininity"
   would make a Polish install's archive disagree with an English one about
   what is the same dimension, and would freeze the wording at seed time.
   labels.ts holds the lookups; this file takes nothing but types, so the
   Node tier can read it without dragging in paraglide (ADR-0016).

   `as const` throughout, so each key list also produces the union type
   labels.ts has to cover exhaustively - a built-in added here without a
   message fails the typecheck rather than showing a raw key to someone. */

import type {
  GenderDimension,
  GenderPreset,
  Lean,
  MilestoneTemplate,
  RegimenTemplate,
  Tag,
  TagGroup
} from '../types.ts';

/* The seven scales an entry can carry a number on.

   Five of these are the original set, which predates this tracker and was
   never argued from a source: four of them describe the content of a
   gender (how feminine, how masculine, how binary, how strongly present)
   and the fifth describes a feeling about it. The two added last
   (`social_recognition`, `gender_stability`) come out of
   `.scratch/phase-5/gender-scale-axes-research.md`, and each fills a gap
   that research found the rest of the app could not already answer:

     social_recognition  the outside world. Four sources that do not
                         descend from one another separate being read by
                         others from both body and identity: the GCLS's
                         own "social gender role recognition" factor, the
                         KGDQ's split of alienation and role pressure from
                         body dysphoria, genderdysphoria.fyi's definition
                         of social dysphoria ("What gender do people
                         believe me to be?"), and Gender Spectrum's
                         body/identity/social model. The app records this
                         today only as flags (`g-soc-dys`, `g-soc-eu`,
                         `g-gendered-ok`, `g-misgendered`, `dt-social`)
                         and as tally counts, and a count answers "how
                         often" rather than "how much" - it reads a day
                         spent indoors as a day that went well.

     gender_stability    movement. Every other scale here records a
                         position; none of them can say that the position
                         moved. `binary_nonbinary` and `agender_gendered`
                         each collapse a day that shifted to whatever it
                         averaged out at, which is the same reading a flat
                         day gets.

   Deliberately not a certainty or doubt scale, which is the neighbouring
   idea and a different one. The GRRS measures rumination about one's own
   gender as a harm, and ADR-0037 has just removed the surface that asked
   somebody to narrate their doubt; a daily slider for how sure you are
   would put that question back on the log form. Steady and shifting are
   descriptive and neither is the better end. */
export const BUILT_IN_DIMENSIONS = [
  { key: 'euphoria_dysphoria', min: 0, max: 100 },
  { key: 'femininity', min: 0, max: 100 },
  { key: 'masculinity', min: 0, max: 100 },
  { key: 'binary_nonbinary', min: 0, max: 100 },
  { key: 'agender_gendered', min: 0, max: 100 },
  { key: 'social_recognition', min: 0, max: 100 },
  { key: 'gender_stability', min: 0, max: 100 }
] as const;

export type BuiltInDimensionKey = (typeof BUILT_IN_DIMENSIONS)[number]['key'];

/* Frozen. These eight stopped being a picker in ticket 35 and survive only
   to resolve a preset key out of an archive written before that, so each
   list has to keep saying what that key meant when it was written. A scale
   added to BUILT_IN_DIMENSIONS above never joins one of these: `p-nb` was
   all five scales that existed then, and restoring a 2026 archive must tick
   those five rather than whatever "all of them" means today. */
export const BUILT_IN_PRESETS = [
  { key: 'p-fem-masc', dims: ['euphoria_dysphoria', 'femininity', 'masculinity'] },
  { key: 'p-fluid', dims: ['euphoria_dysphoria', 'femininity', 'masculinity', 'binary_nonbinary'] },
  { key: 'p-agender', dims: ['euphoria_dysphoria', 'agender_gendered'] },
  { key: 'p-demi-fem', dims: ['euphoria_dysphoria', 'femininity', 'agender_gendered'] },
  { key: 'p-demi-masc', dims: ['euphoria_dysphoria', 'masculinity', 'agender_gendered'] },
  {
    key: 'p-nb',
    dims: ['euphoria_dysphoria', 'femininity', 'masculinity', 'binary_nonbinary', 'agender_gendered']
  },
  { key: 'p-btw', dims: ['euphoria_dysphoria', 'femininity'] },
  { key: 'p-masc', dims: ['euphoria_dysphoria', 'masculinity'] }
] as const;

/** The three tags that count as a euphoria capture (CONTEXT: "Euphoria
    capture") - general, social and body, read as equals by anything that
    asks "did this day carry a euphoria capture" (the doubt journal's
    counterevidence pool, the good-day rule). Not narrowed to g-euphoria
    alone: someone whose euphoria is mostly social or body-specific tags
    g-soc-eu/g-body-eu faithfully for months and must not find the app
    blind to it (phase 5 ticket 32). */
export const EUPHORIA_TAG_KEYS = ['g-euphoria', 'g-soc-eu', 'g-body-eu'] as const;

export const BUILT_IN_TAG_GROUPS = [
  {
    key: 'gender',
    tags: [
      'g-soc-dys',
      'g-body-dys',
      'g-soc-eu',
      'g-body-eu',
      'g-euphoria',
      'g-transphobia',
      'g-gendered-ok',
      'g-misgendered'
    ]
  },
  {
    key: 'emotions',
    tags: ['e-happy', 'e-calm', 'e-anxious', 'e-sad', 'e-hopeful', 'e-tired']
  },
  {
    key: 'activities',
    tags: ['a-work', 'a-friends', 'a-family', 'a-exercise', 'a-therapy', 'a-shopping', 'a-selfcare']
  },
  {
    // Empty until a Daylio import finds an activity no existing tag names.
    // Keeping the group key built-in makes imports from different devices
    // converge on one group rather than minting one each (PRD F28).
    key: 'imported',
    tags: []
  },
  {
    // Named types of a hard day (CONTEXT: Dysphoria type), distinct from the
    // `euphoria_dysphoria` gender dimension above - a scale, not a tag group,
    // and never the same control. Bare category names, no "dysphoria" suffix,
    // matching how the emotions/activities groups above leave their own
    // group name off each tag; the group heading supplies it. That also
    // keeps "social" here from reading as a duplicate of the existing
    // g-soc-dys tag, which is a plain "this was a hard day, socially" flag
    // rather than a named category.
    key: 'dysphoria_type',
    tags: ['dt-physical', 'dt-biochemical', 'dt-social', 'dt-societal', 'dt-sexual', 'dt-presentational', 'dt-existential']
  }
] as const;

export type BuiltInTagGroupKey = (typeof BUILT_IN_TAG_GROUPS)[number]['key'];
export type BuiltInTagKey = (typeof BUILT_IN_TAG_GROUPS)[number]['tags'][number];

/* The four measurement types every install started with (phase 4 ticket
   08), now the built-in half of an open vocabulary (phase 5 ticket 29):
   waist, hips, chest/bust and underbust. Weight and height are
   deliberately absent - the two most commonly requested, and the two
   most likely to pull a BMI calculation in behind them - a person who
   wants them adds them as custom types, same as anything else this list
   does not name. */
export const BUILT_IN_MEASUREMENT_TYPES = [{ key: 'waist' }, { key: 'hips' }, { key: 'chest' }, { key: 'underbust' }] as const;

export type BuiltInMeasurementTypeKey = (typeof BUILT_IN_MEASUREMENT_TYPES)[number]['key'];

/* The check-in's built-in affirmation pool (phase 5 ticket 15). Fourteen
   stable keys, one per line the message catalogue carries
   (messages/en.json, messages/pl.json) - the wording is looked up by key at
   display time (labels.ts), the same split every other built-in here gets. */
export const BUILT_IN_AFFIRMATION_KEYS = [
  'affirmation_1',
  'affirmation_2',
  'affirmation_3',
  'affirmation_4',
  'affirmation_5',
  'affirmation_6',
  'affirmation_7',
  'affirmation_8',
  'affirmation_9',
  'affirmation_10',
  'affirmation_11',
  'affirmation_12',
  'affirmation_13',
  'affirmation_14'
] as const;

export type BuiltInAffirmationKey = (typeof BUILT_IN_AFFIRMATION_KEYS)[number];

/* The body regions every install starts with (phase 5 ticket 30, CONTEXT:
   "Reference data" - amended): the original eight (bodyMap.ts's header
   carries their own history) plus shoulders and whole body, seeded as
   ordinary reference-data rows rather than the closed BODY_REGION_KEYS
   list this replaces. Keys only, wording in labels.ts, the same split
   every other built-in list here draws. */
export const BUILT_IN_BODY_REGIONS = [
  'face_jaw',
  'voice_throat',
  'chest',
  'body_facial_hair',
  'hands_feet',
  'hips_waist',
  'genitals',
  'hairline',
  'shoulders',
  'whole_body'
] as const;

export type BuiltInBodyRegionKey = (typeof BUILT_IN_BODY_REGIONS)[number];

/* The five effect categories personal effects are grouped under (phase 5
   ticket 41, CONTEXT: "Effect category"), taken from genderdysphoria.fyi's
   own grouping across its two second-puberty pages. Body shape and
   composition, and skin and hair, are on by default - together they hold
   every one of the eight effects that shipped before this ticket, so an
   existing journal loses no visible effect and a new journal meets a
   screen no longer than today's. Genital and sexual, cognitive and
   emotional, and sensory ship off by default: as much a privacy and
   comfort decision as a length one. Genital and sexual in particular names
   ejaculate changes, orgasm changes and genital odour - intimate in a way
   the rest of the catalogue is not, on a screen in an app whose disguise
   mode and decoy home screen exist because its readers sometimes hand
   their phone to someone. Built-in only: no custom-category creation is
   asked for, so unlike a tag group there is no per-row `builtIn` flag. */
export const BUILT_IN_EFFECT_CATEGORIES = [
  { key: 'body_shape', defaultEnabled: true },
  { key: 'skin_hair', defaultEnabled: true },
  { key: 'genital_sexual', defaultEnabled: false },
  { key: 'cognitive_emotional', defaultEnabled: false },
  { key: 'sensory', defaultEnabled: false }
] as const;

export type BuiltInEffectCategoryKey = (typeof BUILT_IN_EFFECT_CATEGORIES)[number]['key'];

/* The full personal-effects catalogue (phase 5 ticket 41, the third
   revisit of this list's closure - it stops closing it): the eight keys
   that shipped before this ticket, unchanged, plus a wider set
   transcribed from genderdysphoria.fyi's two second-puberty pages
   ("Estrogenic Second Puberty 101", "Androgenic Second Puberty 101",
   fetched 2026-08-19) and cross-checked against GenderGP's HRT timeline
   tables (gendergp.com/blog/hrt-timelines-hormones-effects/, also fetched
   2026-08-19, citing WPATH Standards of Care v7). Each row names a
   category and a direction; whether an effect is tier 1 is derived from
   whether personalEffectWindow.ts's literature-window map lists its key,
   not stored here a second time (personalEffectWindow.ts's `effectTier`
   joins the two).

   Excluded, recorded here rather than only in the implementation note:
   genderdysphoria.fyi's "Cyclical Period-like Symptoms" section (a
   recurring monthly state, not a dated first-noticed change - out of
   scope for the reason ongoing states generally are) and its "Changes to
   Pap Test" section (a medical finding, not a body change a person
   notices, also out of scope). "Reduced Body Hair" and "Changes to Scalp
   Hair" (feminizing) and "Body Hair, Everywhere" (masculinizing) are
   folded into the existing `hair_changes`/`facial_body_hair` keys rather
   than duplicated as a second row for the same change. Masculinising
   scalp hair loss is catalogued at tier 2 despite coming from GenderGP's
   table: its completion figure is "variable", no range, the same carve-out
   this ticket's own tier rule gives "male sexual dysfunction" and
   "decreased sperm production". */
export const BUILT_IN_PERSONAL_EFFECT_TYPES = [
  // Feminizing, tier 1: the original four (phase 4 ticket 07) plus ticket
  // 41's five-effect widening.
  { key: 'breast_development', category: 'body_shape', direction: 'feminizing' },
  { key: 'fat_redistribution', category: 'body_shape', direction: 'feminizing' },
  { key: 'skin_softening', category: 'skin_hair', direction: 'feminizing' },
  { key: 'hair_changes', category: 'skin_hair', direction: 'feminizing' },
  { key: 'decreased_muscle_mass_strength', category: 'body_shape', direction: 'feminizing' },
  { key: 'decreased_libido', category: 'genital_sexual', direction: 'feminizing' },
  { key: 'decreased_spontaneous_erections', category: 'genital_sexual', direction: 'feminizing' },
  { key: 'decreased_testicular_volume', category: 'genital_sexual', direction: 'feminizing' },
  { key: 'male_pattern_baldness_ceasing', category: 'skin_hair', direction: 'feminizing' },

  // Feminizing, tier 2: named by genderdysphoria.fyi, no usable literature
  // figure.
  { key: 'increased_flexibility_feminizing', category: 'body_shape', direction: 'feminizing' },
  { key: 'slimmer_hands_feet_feminizing', category: 'body_shape', direction: 'feminizing' },
  { key: 'softer_fingernails_feminizing', category: 'skin_hair', direction: 'feminizing' },
  { key: 'temperature_sensitivity_feminizing', category: 'sensory', direction: 'feminizing' },
  { key: 'perspiration_pattern_feminizing', category: 'body_shape', direction: 'feminizing' },
  { key: 'body_odor_feminizing', category: 'skin_hair', direction: 'feminizing' },
  { key: 'facial_feature_changes_feminizing', category: 'body_shape', direction: 'feminizing' },
  { key: 'pelvic_tilt_feminizing', category: 'body_shape', direction: 'feminizing' },
  { key: 'reduced_substance_tolerance_feminizing', category: 'cognitive_emotional', direction: 'feminizing' },
  { key: 'mental_clarity_feminizing', category: 'cognitive_emotional', direction: 'feminizing' },
  { key: 'adhd_symptom_change_feminizing', category: 'cognitive_emotional', direction: 'feminizing' },
  { key: 'emotional_expansion_feminizing', category: 'cognitive_emotional', direction: 'feminizing' },
  { key: 'mood_swings_feminizing', category: 'cognitive_emotional', direction: 'feminizing' },
  { key: 'appetite_change_feminizing', category: 'cognitive_emotional', direction: 'feminizing' },
  { key: 'sleep_change_feminizing', category: 'cognitive_emotional', direction: 'feminizing' },
  { key: 'increased_extroversion_feminizing', category: 'cognitive_emotional', direction: 'feminizing' },
  { key: 'improved_smell_feminizing', category: 'sensory', direction: 'feminizing' },
  { key: 'improved_color_perception_feminizing', category: 'sensory', direction: 'feminizing' },
  { key: 'improved_spatial_awareness_feminizing', category: 'sensory', direction: 'feminizing' },
  { key: 'taste_perception_change_feminizing', category: 'sensory', direction: 'feminizing' },
  { key: 'reduced_confidence_feminizing', category: 'cognitive_emotional', direction: 'feminizing' },
  { key: 'genital_sensitivity_increase_feminizing', category: 'genital_sexual', direction: 'feminizing' },
  { key: 'genital_moisture_odor_feminizing', category: 'genital_sexual', direction: 'feminizing' },
  { key: 'genital_skin_texture_change_feminizing', category: 'genital_sexual', direction: 'feminizing' },
  { key: 'fewer_erections_feminizing', category: 'genital_sexual', direction: 'feminizing' },
  { key: 'ejaculate_change_feminizing', category: 'genital_sexual', direction: 'feminizing' },
  { key: 'testicular_atrophy_feminizing', category: 'genital_sexual', direction: 'feminizing' },
  { key: 'heightened_erogenous_zones_feminizing', category: 'genital_sexual', direction: 'feminizing' },
  { key: 'orgasm_change_feminizing', category: 'genital_sexual', direction: 'feminizing' },
  { key: 'attraction_change_feminizing', category: 'genital_sexual', direction: 'feminizing' },

  // Masculinizing, tier 1: the original four (phase 5 ticket 02) plus
  // ticket 41's four-effect widening.
  { key: 'voice_drop', category: 'body_shape', direction: 'masculinizing' },
  { key: 'facial_body_hair', category: 'skin_hair', direction: 'masculinizing' },
  { key: 'masculinizing_fat_redistribution', category: 'body_shape', direction: 'masculinizing' },
  { key: 'cycle_cessation', category: 'genital_sexual', direction: 'masculinizing' },
  { key: 'skin_oiliness_acne_masculinizing', category: 'skin_hair', direction: 'masculinizing' },
  { key: 'increased_muscle_mass_strength_masculinizing', category: 'body_shape', direction: 'masculinizing' },
  { key: 'clitoral_enlargement_masculinizing', category: 'genital_sexual', direction: 'masculinizing' },
  { key: 'vaginal_atrophy_masculinizing', category: 'genital_sexual', direction: 'masculinizing' },

  // Masculinizing, tier 2: named by genderdysphoria.fyi (scalp hair loss by
  // GenderGP too, see the header above), no usable literature figure.
  { key: 'scalp_hair_loss_masculinizing', category: 'skin_hair', direction: 'masculinizing' },
  { key: 'larger_hands_feet_masculinizing', category: 'body_shape', direction: 'masculinizing' },
  { key: 'thicker_stronger_nails_masculinizing', category: 'skin_hair', direction: 'masculinizing' },
  { key: 'facial_feature_changes_masculinizing', category: 'body_shape', direction: 'masculinizing' },
  { key: 'increased_substance_tolerance_masculinizing', category: 'cognitive_emotional', direction: 'masculinizing' },
  { key: 'adhd_symptom_change_masculinizing', category: 'cognitive_emotional', direction: 'masculinizing' },
  { key: 'mental_clarity_masculinizing', category: 'cognitive_emotional', direction: 'masculinizing' },
  { key: 'increased_appetite_masculinizing', category: 'cognitive_emotional', direction: 'masculinizing' },
  { key: 'sleep_change_masculinizing', category: 'cognitive_emotional', direction: 'masculinizing' },
  { key: 'increased_confidence_masculinizing', category: 'cognitive_emotional', direction: 'masculinizing' },
  { key: 'increased_extroversion_masculinizing', category: 'cognitive_emotional', direction: 'masculinizing' },
  { key: 'temperature_sensitivity_masculinizing', category: 'sensory', direction: 'masculinizing' },
  { key: 'perspiration_pattern_masculinizing', category: 'body_shape', direction: 'masculinizing' },
  { key: 'body_odor_masculinizing', category: 'skin_hair', direction: 'masculinizing' },
  { key: 'decreased_lubrication_masculinizing', category: 'genital_sexual', direction: 'masculinizing' },
  { key: 'increased_ejaculate_emissions_masculinizing', category: 'genital_sexual', direction: 'masculinizing' },
  { key: 'genital_sensitivity_change_masculinizing', category: 'genital_sexual', direction: 'masculinizing' },
  { key: 'increased_libido_masculinizing', category: 'genital_sexual', direction: 'masculinizing' },
  { key: 'orgasm_change_masculinizing', category: 'genital_sexual', direction: 'masculinizing' },
  { key: 'attraction_change_masculinizing', category: 'genital_sexual', direction: 'masculinizing' },
  { key: 'epidermis_thickening_masculinizing', category: 'skin_hair', direction: 'masculinizing' },
  { key: 'vein_prominence_masculinizing', category: 'skin_hair', direction: 'masculinizing' }
] as const;

export type BuiltInPersonalEffectKey = (typeof BUILT_IN_PERSONAL_EFFECT_TYPES)[number]['key'];

export const MILESTONE_TEMPLATE_KEYS = [
  'hrt_start',
  'transition_start',
  'coming_out',
  'first_appointment',
  'name_change',
  'marker_change',
  'surgery',
  'first_public'
] as const;

export type MilestoneTemplateKey = (typeof MILESTONE_TEMPLATE_KEYS)[number];

/** CONTEXT: "Lean" (phase 5 ticket 43). All eight are neutral: a milestone
    type (starting HRT, coming out, a name change, surgery) names a kind of
    event, not a direction - the same eight apply whichever way a person is
    transitioning. */
export const MILESTONE_TEMPLATE_LEAN: Record<MilestoneTemplateKey, Lean> = {
  hrt_start: 'neutral',
  transition_start: 'neutral',
  coming_out: 'neutral',
  first_appointment: 'neutral',
  name_change: 'neutral',
  marker_change: 'neutral',
  surgery: 'neutral',
  first_public: 'neutral'
};

/* Five starting points across both estradiol and testosterone and more than
   one route (phase 5 ticket 42, CONTEXT: "Regimen template"), the same
   "keys only" shape MILESTONE_TEMPLATE_KEYS gives above - drug, ester and
   route wording lives in doseLabels.ts, which is where the rest of a
   regimen episode's own closed vocabulary already lives. No dose or
   interval key exists to carry either one by accident. */
export const REGIMEN_TEMPLATE_KEYS = [
  'estradiol_valerate_im',
  'estradiol_oral',
  'estradiol_gel',
  'testosterone_cypionate_im',
  'testosterone_gel'
] as const;

export type RegimenTemplateKey = (typeof REGIMEN_TEMPLATE_KEYS)[number];

/** CONTEXT: "Lean" (phase 5 ticket 43). This is where lean does its real
    work: the estradiol templates are feminizing HRT, the testosterone ones
    masculinizing, so the split is the drug each one starts, not a judgment
    call. */
export const REGIMEN_TEMPLATE_LEAN: Record<RegimenTemplateKey, Lean> = {
  estradiol_valerate_im: 'femme',
  estradiol_oral: 'femme',
  estradiol_gel: 'femme',
  testosterone_cypionate_im: 'masc',
  testosterone_gel: 'masc'
};

/* Entry templates (phase 4 features ticket 17): each names the tags and
   dimension values it pre-fills, the same "data lives here, wording lives
   in labels.ts" split BUILT_IN_PRESETS uses for its own `dims`. Values sit
   on the euphoria_dysphoria scale, the one dimension every built-in preset
   includes (BUILT_IN_PRESETS above), so a template's dial reading makes
   sense under any preset a person has chosen.

   The last eight were guided prompts (phase 4 features ticket 17) until
   phase 6 ticket 07 folded the two concepts into one: a prompt is a
   template with empty tags and empty dims, its note scaffold the whole of
   its content, the same wording it always had (labels.ts's
   `entryTemplateNoteScaffold`) but now editable, hideable and reachable
   from the "use template" sheet like any other. */
export const ENTRY_TEMPLATES = [
  { key: 'euphoria_day', tags: ['g-euphoria', 'g-body-eu', 'g-soc-eu'], dims: { euphoria_dysphoria: 85 } },
  { key: 'dysphoria_day', tags: ['g-body-dys', 'g-soc-dys'], dims: { euphoria_dysphoria: 20 } },
  { key: 'gendered_correctly', tags: ['g-gendered-ok'], dims: {} },
  { key: 'misgendered', tags: ['g-misgendered'], dims: {} },
  { key: 'good_day', tags: ['e-happy', 'e-calm'], dims: { euphoria_dysphoria: 75 } },
  { key: 'hard_day', tags: ['e-sad', 'e-anxious'], dims: { euphoria_dysphoria: 30 } },
  { key: 'euphoria_moment', tags: [], dims: {} },
  { key: 'dysphoria_moment', tags: [], dims: {} },
  { key: 'body_feeling', tags: [], dims: {} },
  { key: 'seen_moment', tags: [], dims: {} },
  { key: 'self_care', tags: [], dims: {} },
  { key: 'presentation_feeling', tags: [], dims: {} },
  { key: 'name_pronouns_feeling', tags: [], dims: {} },
  { key: 'proud_moment', tags: [], dims: {} },
  /* The appointment debrief (phase 6 ticket 08, CONTEXT: "Checklist"):
     reachable by default only through the debrief offer, never through the
     "use template" sheet or the entry-creation banner's random pool - both
     of those read the visible list, and this seeds hidden. Editable and
     un-hideable like any other built-in (What to Build #4) if someone
     wants it in their own rotation; the offer applies it directly by key
     regardless of its hidden flag. */
  { key: 'appointment_debrief', tags: [], dims: {}, hidden: true }
] as const;

export type EntryTemplateKey = (typeof ENTRY_TEMPLATES)[number]['key'];

/* Presets and milestone templates are not stored rows in Phase 1 - the
   journal holds only what the user added - so these hand back the built-in
   ones in the shape the rest of the code already expects, names left for
   vocabulary.ts to fill in. */

export function builtInPresetRows(): GenderPreset[] {
  return BUILT_IN_PRESETS.map((p) => ({ id: p.key, name: '', builtIn: true, dims: [...p.dims] }));
}

export function milestoneTemplateRows(): MilestoneTemplate[] {
  return MILESTONE_TEMPLATE_KEYS.map((key) => ({ key, name: '', lean: MILESTONE_TEMPLATE_LEAN[key] }));
}

export function regimenTemplateRows(): RegimenTemplate[] {
  return REGIMEN_TEMPLATE_KEYS.map((key) => ({
    key,
    name: '',
    drug: '',
    ester: null,
    route: '',
    lean: REGIMEN_TEMPLATE_LEAN[key]
  }));
}

/* Reconciling, not seeding-if-empty. Both functions add what is missing by
   key and touch nothing else, so they are safe to run on every boot and
   again before an import applies - which is the point, because a Replace
   import must not be able to leave the journal short of a built-in.
   Ticket 07 moves the same shape onto SQLite rows, and adds presets and
   milestone templates, which are not stored rows yet. */

function builtInDimension(key: string, min: number, max: number): GenderDimension {
  return { key, name: '', low: '', high: '', min, max, builtIn: true, hidden: false };
}

export function withBuiltInDimensions(existing: GenderDimension[]): GenderDimension[] {
  const present = new Set(existing.map((d) => d.key));
  const missing = BUILT_IN_DIMENSIONS.filter((d) => !present.has(d.key)).map((d) =>
    builtInDimension(d.key, d.min, d.max)
  );
  return [...existing, ...missing];
}

function builtInTag(id: string): Tag {
  return { id, label: '', builtIn: true, hidden: false };
}

export function withBuiltInTagGroups(existing: TagGroup[]): TagGroup[] {
  const byKey = new Map(existing.map((g) => [g.key, g]));

  const reconciled = BUILT_IN_TAG_GROUPS.map((builtIn) => {
    const group = byKey.get(builtIn.key);
    if (!group) {
      return {
        key: builtIn.key,
        name: '',
        enabled: true,
        builtIn: true,
        tags: builtIn.tags.map(builtInTag)
      };
    }
    const present = new Set(group.tags.map((t) => t.id));
    return { ...group, tags: [...group.tags, ...builtIn.tags.filter((id) => !present.has(id)).map(builtInTag)] };
  });

  const builtInKeys = new Set<string>(BUILT_IN_TAG_GROUPS.map((g) => g.key));
  return [...reconciled, ...existing.filter((g) => !builtInKeys.has(g.key))];
}
