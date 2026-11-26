/* Schema 121 splits `genital_sexual` into `genital` and `sexual`.
   Both inherit the old selection and `updated_at` to avoid an apparent
   edit on Merge. Built-ins follow the frozen catalogue mapping;
   the migration test checks it. Custom effects move to Genital and
   can be recategorized in Changes.

   A fresh journal leaves both categories for reconcile to seed off.
   `splitArchivedEffectCategories` applies the same mapping to old Archives. */

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
