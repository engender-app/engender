/* How tags are picked when an emotion family or finer word is tapped. */

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

/** Older entries can carry a finer word without carrying its family. */
export function familyPicked(selected: readonly string[], family: string): boolean {
  return selected.includes(family) || finerOf(family).some((id) => selected.includes(id));
}

export interface FamilyState {
  selected: string[];
  /** The one family whose finer words show, or null. */
  open: string | null;
}

/** An unpicked family is picked and opened; a picked one that is not open
    opens; a picked, open one is unpicked with its finer words and closes. */
export function tapFamily({ selected, open }: FamilyState, family: string): FamilyState {
  if (!familyPicked(selected, family)) return { selected: [...selected, family], open: family };
  if (open !== family) return { selected, open: family };
  const gone = new Set([family, ...finerOf(family)]);
  return { selected: selected.filter((id) => !gone.has(id)), open: null };
}

/** In an open family, picking a finer word picks its family too. */
export function toggleTag(selected: string[], id: string, inFamily = true): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  const family = inFamily ? familyOf(id) : undefined;
  return family && !selected.includes(family) ? [...selected, id, family] : [...selected, id];
}
