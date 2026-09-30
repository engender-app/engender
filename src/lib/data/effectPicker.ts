/* What the entry editor's noticed-effects sheet lists (phase 12 ux-carpet
   ticket 289). Pure, above the journal seam and free of paraglide (ADR-0016):
   the words arrive as arguments.

   The direction filter is read off the regimen and stored nowhere - types.ts
   says the app has no gender or direction field and this does not become the
   first one. A drug that resolves to estradiol leaves feminizing effects on
   offer, testosterone leaves masculinizing ones, both leave both. Effects a
   person wrote for themselves carry no direction and are never filtered. When
   no active drug resolves (a blocker, progesterone, a free-typed name) there
   is nothing to filter by, so nothing is hidden. */

import { foldText } from './fold';
import { resolveCurveDrug } from './hormoneDrug';
import type { PersonalEffectCatalogEntry } from './types';

export interface EffectPickerGroup {
  /** The category key, `'custom'` for a person's own effects, or null for a
      flat search result, which has no heading. */
  key: string | null;
  heading: string | null;
  effects: PersonalEffectCatalogEntry[];
}

export interface EffectPicker {
  groups: EffectPickerGroup[];
  /** How many effects the direction filter left out; the "show all" row
      exists only when this is above zero. */
  hiddenCount: number;
}

interface EffectPickerInput {
  effects: PersonalEffectCatalogEntry[];
  /** Category keys in the order the screen shows them. */
  categoryOrder: string[];
  categoryName: (key: string) => string;
  customHeading: string;
  /** The drug names of the episodes active on the entry's day. */
  drugs: string[];
  showAll: boolean;
  query: string;
}

export function buildEffectPicker(input: EffectPickerInput): EffectPicker {
  const hormones = new Set(input.drugs.map(resolveCurveDrug).filter((d) => d !== null));
  const wanted = new Set<string>();
  if (hormones.has('estradiol')) wanted.add('feminizing');
  if (hormones.has('testosterone')) wanted.add('masculinizing');

  const filtering = wanted.size > 0 && !input.showAll;
  const offered = input.effects.filter((e) => !filtering || e.direction === null || wanted.has(e.direction));
  const hiddenCount = input.effects.length - offered.length;

  const needle = foldText(input.query.trim());
  if (needle) {
    const hits = offered.filter((e) => foldText(e.name).includes(needle));
    return { groups: hits.length ? [{ key: null, heading: null, effects: hits }] : [], hiddenCount };
  }

  /* Feminizing first inside a category when both hormones are on offer. */
  const directionOrder = (e: PersonalEffectCatalogEntry) => (e.direction === 'masculinizing' ? 1 : 0);
  const groups: EffectPickerGroup[] = [];
  for (const key of input.categoryOrder) {
    const inCategory = offered.filter((e) => e.builtIn && e.categoryKey === key);
    if (inCategory.length) {
      groups.push({ key, heading: input.categoryName(key), effects: [...inCategory].sort((a, b) => directionOrder(a) - directionOrder(b)) });
    }
  }
  const own = offered.filter((e) => !e.builtIn || !e.categoryKey || !input.categoryOrder.includes(e.categoryKey));
  if (own.length) groups.push({ key: 'custom', heading: input.customHeading, effects: own });
  return { groups, hiddenCount };
}
