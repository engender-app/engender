import type { BuiltInPersonalEffectKey } from './builtins';

/* Keep retired built-in keys seeded for existing markers and older archives.
   offeredEffectTypes omits them from new picks. Keep this list separate from
   builtins.ts so the picker does not pull the catalogue into its bundle.
   The list drops duplicates, unsupported stereotypes and cycle cessation,
   which the cycle log already records. */
export const RETIRED_PERSONAL_EFFECT_KEYS: ReadonlySet<string> = new Set<BuiltInPersonalEffectKey>([
  'fewer_erections_feminizing',
  'testicular_atrophy_feminizing',
  'reduced_confidence_feminizing',
  'increased_confidence_masculinizing',
  'improved_color_perception_feminizing',
  'improved_spatial_awareness_feminizing',
  'cycle_cessation'
]);
