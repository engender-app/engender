/* What a tap does on the marks step's emotion families (pre-release-human
   22). Pure, so the picker and its tests share one rule. */

import { EMOTION_FAMILIES } from './builtins.ts';

const FAMILY_OF: ReadonlyMap<string, string> = new Map(
  EMOTION_FAMILIES.flatMap((family) => family.finer.map((finer) => [finer, family.key] as const))
);
const FINER_OF: ReadonlyMap<string, readonly string[]> = new Map(
  EMOTION_FAMILIES.map((family) => [family.key, family.finer] as const)
);

/** The family a finer emotion is filed under; undefined for a family itself
    and for every other tag. */
export const familyOf = (id: string): string | undefined => FAMILY_OF.get(id);

/** The finer words filed under a family, or none. */
export const finerOf = (id: string): readonly string[] => FINER_OF.get(id) ?? [];

export interface FamilyState {
  selected: string[];
  /** The one family whose finer words show, or null. */
  open: string | null;
}

/** An unpicked family is picked and opened; a picked one that is not open
    opens; a picked, open one is unpicked with its finer words and closes. */
export function tapFamily({ selected, open }: FamilyState, family: string): FamilyState {
  if (!selected.includes(family)) return { selected: [...selected, family], open: family };
  if (open !== family) return { selected, open: family };
  const gone = new Set([family, ...finerOf(family)]);
  return { selected: selected.filter((id) => !gone.has(id)), open: null };
}

/** A plain toggle, except that picking a finer word picks its family too. */
export function toggleTag(selected: string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  const family = familyOf(id);
  return family && !selected.includes(family) ? [...selected, id, family] : [...selected, id];
}
