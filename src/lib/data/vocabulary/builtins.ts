/* The built-in vocabulary every install gets: six gender dimensions, eight
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

import type { GenderDimension, GenderPreset, Tag, TagGroup } from '../types.ts';
import { BUILT_IN_DIMENSIONS } from './builtinTemplates.ts';

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

/* Built-ins a new journal seeds hidden (functional audit ticket 41), because
   each one repeats another built-in. `g-body-dys` and `g-soc-dys` are the
   physical and social dysphoria types again under the gender group, without
   the line saying what each means; the euphoria tags they sat beside stay,
   as the counterpart CONTEXT ("Euphoria capture") already pairs with a
   dysphoria type. `whole_body` is a feeling about the body as a whole, which
   is what the euphoria/dysphoria scale records on every entry.

   Seed defaults only, the same shape the appointment debrief template has:
   reconcile.ts inserts these rows hidden and never touches a row that is
   already there, so a journal that holds them visible keeps them visible,
   and an archive restores whatever flag it carries. */
export const SEEDED_HIDDEN_TAGS: ReadonlySet<string> = new Set(['g-body-dys', 'g-soc-dys']);
export const SEEDED_HIDDEN_BODY_REGIONS: ReadonlySet<string> = new Set(['whole_body']);
export type BuiltInTagKey = (typeof BUILT_IN_TAG_GROUPS)[number]['tags'][number];


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

/* The poses a progress photo is taken in that every install starts with
   (pre-release-human 12), in the order the screen offers them. A person
   renames or hides one and adds their own (progressPhotos.ts); these three
   are never deleted, so every photo an older journal or archive holds
   keeps the pose it names. */
export const BUILT_IN_PROGRESS_POSES = ['front', 'side', 'back'] as const;

/* The effect categories personal effects are grouped under (phase 5
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
   mode exists because its readers sometimes hand
   their phone to someone. Built-in only: no custom-category creation is
   asked for, so unlike a tag group there is no per-row `builtIn` flag.

   Pre-release-human 12 split genital and sexual in two, so a person can
   show one without the other; there are six now. Both new ones go last,
   where version 121 (effect-category-split-migration.ts) leaves them in a
   journal that had the old one, so a fresh journal and a migrated one list
   the categories in the same order. Cycle cessation is filed under genital:
   no non-sensitive category fits a period stopping, it is retired
   (retiredEffects.ts) so only a person who already marked it ever sees it,
   and under genital it keeps the default-off visibility it always had. */
export const BUILT_IN_EFFECT_CATEGORIES = [
  { key: 'body_shape', defaultEnabled: true },
  { key: 'skin_hair', defaultEnabled: true },
  { key: 'cognitive_emotional', defaultEnabled: false },
  { key: 'sensory', defaultEnabled: false },
  { key: 'genital', defaultEnabled: false },
  { key: 'sexual', defaultEnabled: false }
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
   than duplicated as a second row for the same change.

   Functional audit ticket 22 re-sourced every band to WPATH SOC8 Appendix
   C Table 1, which moved two keys across the tier line without moving
   their rows here (row order is the catalogue's sort order):
   `male_pattern_baldness_ceasing` is tier 2 now (SOC8: variable / variable)
   and `scalp_hair_loss_masculinizing` is tier 1 (SOC8: 6-12 months, more
   than five years). */
export const BUILT_IN_PERSONAL_EFFECT_TYPES = [
  // Feminizing, tier 1: the original four (phase 4 ticket 07) plus ticket
  // 41's five-effect widening.
  { key: 'breast_development', category: 'body_shape', direction: 'feminizing' },
  { key: 'fat_redistribution', category: 'body_shape', direction: 'feminizing' },
  { key: 'skin_softening', category: 'skin_hair', direction: 'feminizing' },
  { key: 'hair_changes', category: 'skin_hair', direction: 'feminizing' },
  { key: 'decreased_muscle_mass_strength', category: 'body_shape', direction: 'feminizing' },
  { key: 'decreased_libido', category: 'sexual', direction: 'feminizing' },
  { key: 'decreased_spontaneous_erections', category: 'sexual', direction: 'feminizing' },
  { key: 'decreased_testicular_volume', category: 'genital', direction: 'feminizing' },
  // Tier 2 since ticket 22 (see the header above).
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
  { key: 'genital_sensitivity_increase_feminizing', category: 'genital', direction: 'feminizing' },
  { key: 'genital_moisture_odor_feminizing', category: 'genital', direction: 'feminizing' },
  { key: 'genital_skin_texture_change_feminizing', category: 'genital', direction: 'feminizing' },
  { key: 'fewer_erections_feminizing', category: 'sexual', direction: 'feminizing' },
  { key: 'ejaculate_change_feminizing', category: 'sexual', direction: 'feminizing' },
  { key: 'testicular_atrophy_feminizing', category: 'genital', direction: 'feminizing' },
  { key: 'heightened_erogenous_zones_feminizing', category: 'sexual', direction: 'feminizing' },
  { key: 'orgasm_change_feminizing', category: 'sexual', direction: 'feminizing' },
  { key: 'attraction_change_feminizing', category: 'sexual', direction: 'feminizing' },

  // Masculinizing, tier 1: the original four (phase 5 ticket 02) plus
  // ticket 41's four-effect widening.
  { key: 'voice_drop', category: 'body_shape', direction: 'masculinizing' },
  { key: 'facial_body_hair', category: 'skin_hair', direction: 'masculinizing' },
  { key: 'masculinizing_fat_redistribution', category: 'body_shape', direction: 'masculinizing' },
  { key: 'cycle_cessation', category: 'genital', direction: 'masculinizing' },
  { key: 'skin_oiliness_acne_masculinizing', category: 'skin_hair', direction: 'masculinizing' },
  { key: 'increased_muscle_mass_strength_masculinizing', category: 'body_shape', direction: 'masculinizing' },
  { key: 'clitoral_enlargement_masculinizing', category: 'genital', direction: 'masculinizing' },
  { key: 'vaginal_atrophy_masculinizing', category: 'genital', direction: 'masculinizing' },

  // Masculinizing, tier 2: named by genderdysphoria.fyi, no usable
  // literature figure. Scalp hair loss is the exception, tier 1 since
  // ticket 22 (see the header above).
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
  { key: 'decreased_lubrication_masculinizing', category: 'genital', direction: 'masculinizing' },
  { key: 'increased_ejaculate_emissions_masculinizing', category: 'sexual', direction: 'masculinizing' },
  { key: 'genital_sensitivity_change_masculinizing', category: 'genital', direction: 'masculinizing' },
  { key: 'increased_libido_masculinizing', category: 'sexual', direction: 'masculinizing' },
  { key: 'orgasm_change_masculinizing', category: 'sexual', direction: 'masculinizing' },
  { key: 'attraction_change_masculinizing', category: 'sexual', direction: 'masculinizing' },
  { key: 'epidermis_thickening_masculinizing', category: 'skin_hair', direction: 'masculinizing' },
  { key: 'vein_prominence_masculinizing', category: 'skin_hair', direction: 'masculinizing' }
] as const;

export type BuiltInPersonalEffectKey = (typeof BUILT_IN_PERSONAL_EFFECT_TYPES)[number]['key'];

/* The dimension keys, the milestone, regimen and entry templates and the
   euphoria tag keys live in builtinTemplates.ts (ux-carpet ticket 223): they
   are what the boot-time vocabulary, Today and the first run's scales step
   read, and kept in this file they carried the whole catalogue below into
   every first load. Re-exported so nothing that reads the catalogue has to
   know. */
export {
  BUILT_IN_DIMENSIONS,
  EUPHORIA_TAG_KEYS,
  MILESTONE_TEMPLATE_KEYS,
  REGIMEN_TEMPLATE_KEYS,
  REGIMEN_TEMPLATE_LEAN,
  ENTRY_TEMPLATES,
  milestoneTemplateRows,
  regimenTemplateRows,
  type BuiltInDimensionKey,
  type MilestoneTemplateKey,
  type RegimenTemplateKey,
  type EntryTemplateKey
} from './builtinTemplates.ts';

/* Presets and milestone templates are not stored rows in Phase 1 - the
   journal holds only what the user added - so these hand back the built-in
   ones in the shape the rest of the code already expects, names left for
   vocabulary.ts to fill in. */

function builtInPresetRows(): GenderPreset[] {
  return BUILT_IN_PRESETS.map((p) => ({ id: p.key, name: '', builtIn: true, dims: [...p.dims] }));
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

/* withBuiltInDimensions stays exported only for its own test (AU-09 test-only
   review). */
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

/* withBuiltInTagGroups stays exported only for its own test (AU-09 test-only
   review). */
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
