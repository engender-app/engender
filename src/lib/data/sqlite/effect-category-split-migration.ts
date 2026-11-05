/* Version 121 (pre-release-human 12): the 'genital_sexual' effect category
   splits into 'genital' and 'sexual', so a person can show one without the
   other (Alicja, 2026-11-05).

   Both new categories start in the state the old one was in, with its
   `updated_at`, so a Merge reads the split as no edit of anybody's. Each
   built-in effect moves to the category the catalogue now gives it
   (builtins.ts; the lists below are frozen with this migration, and the
   migration test holds the two to the same answer). A custom effect a
   person filed under the old category goes to 'genital': the catalogue is
   one of body changes a person notices, and a custom row added beside
   "Clitoral enlargement" and "Vaginal dryness" is more often one of those
   than a change in desire. It stays editable from the Changes screen.

   On a journal that never had 'genital_sexual' (a fresh one, before the
   reconcile seeds it) every statement here matches nothing, and the
   reconcile seeds both new categories off.

   An archive written before the split still names 'genital_sexual'; restore
   reads it through `splitArchivedEffectCategories` below, which maps it the
   same way. The version number lives here and nowhere else in the chain. */

export const EFFECT_CATEGORY_SPLIT_VERSION = 121;

export const SPLIT_GENITAL_EFFECTS = [
  'decreased_testicular_volume',
  'testicular_atrophy_feminizing',
  'genital_sensitivity_increase_feminizing',
  'genital_moisture_odor_feminizing',
  'genital_skin_texture_change_feminizing',
  'clitoral_enlargement_masculinizing',
  'vaginal_atrophy_masculinizing',
  'decreased_lubrication_masculinizing',
  'genital_sensitivity_change_masculinizing',
  'cycle_cessation'
] as const;

export const SPLIT_SEXUAL_EFFECTS = [
  'decreased_libido',
  'increased_libido_masculinizing',
  'decreased_spontaneous_erections',
  'fewer_erections_feminizing',
  'ejaculate_change_feminizing',
  'increased_ejaculate_emissions_masculinizing',
  'heightened_erogenous_zones_feminizing',
  'orgasm_change_feminizing',
  'orgasm_change_masculinizing',
  'attraction_change_feminizing',
  'attraction_change_masculinizing'
] as const;

const OLD = 'genital_sexual';
const GENITAL = 'genital';
const SEXUAL = 'sexual';
const quoted = (keys: readonly string[]) => keys.map((key) => `'${key}'`).join(', ');

export const EFFECT_CATEGORY_SPLIT = `
INSERT OR IGNORE INTO effect_category (key, name, enabled, updated_at)
  SELECT '${GENITAL}', '', enabled, updated_at FROM effect_category WHERE key = '${OLD}';
INSERT OR IGNORE INTO effect_category (key, name, enabled, updated_at)
  SELECT '${SEXUAL}', '', enabled, updated_at FROM effect_category WHERE key = '${OLD}';
UPDATE personal_effect_type SET category_key = '${SEXUAL}'
  WHERE category_key = '${OLD}' AND key IN (${quoted(SPLIT_SEXUAL_EFFECTS)});
UPDATE personal_effect_type SET category_key = '${GENITAL}' WHERE category_key = '${OLD}';
DELETE FROM effect_category WHERE key = '${OLD}';
`;

interface ArchivedCategory { key: string }
interface ArchivedEffectType { key: string; categoryKey: string | null }

/** An archive's effect categories and effect types with 'genital_sexual'
    read the way the migration reads it. An archive written after the split
    passes through unchanged. */
export function splitArchivedEffectCategories<C extends ArchivedCategory, T extends ArchivedEffectType>(
  categories: C[],
  types: T[]
): { categories: C[]; types: T[] } {
  const old = categories.find((category) => category.key === OLD);
  if (!old && !types.some((type) => type.categoryKey === OLD)) return { categories, types };
  const present = new Set(categories.map((category) => category.key));
  const added = old ? ([GENITAL, SEXUAL] as const).filter((key) => !present.has(key)).map((key) => ({ ...old, key })) : [];
  const sexual = new Set<string>(SPLIT_SEXUAL_EFFECTS);
  return {
    categories: [...categories.filter((category) => category.key !== OLD), ...added],
    types: types.map((type) =>
      type.categoryKey !== OLD
        ? type
        : { ...type, categoryKey: sexual.has(type.key) ? SEXUAL : GENITAL }
    )
  };
}
