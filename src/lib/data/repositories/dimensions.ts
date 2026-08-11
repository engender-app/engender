/* GenderDimensionRepository (PRD F3). */

import { db, save } from '../db.svelte';
import { prefs } from '../prefs/store.svelte';
import { builtInPresetRows } from '../vocabulary/builtins';
import type { GenderDimension, GenderPreset } from '../types';

export function getPresets(): GenderPreset[] {
  return [...builtInPresetRows(), ...db.customPresets];
}

export function activePreset(): GenderPreset {
  const presets = getPresets();
  return presets.find((p) => p.id === prefs.activePreset) ?? presets[0];
}

export function activeDimensions(): GenderDimension[] {
  return activePreset()
    .dims.map((k) => db.dimensions.find((d) => d.key === k))
    .filter((d): d is GenderDimension => !!d);
}

export function dimensionByKey(key: string): GenderDimension | undefined {
  return db.dimensions.find((d) => d.key === key);
}

/** Adding a custom dimension spawns a custom preset extending the active
    one. Both identities are minted here (ticket 07): the dimension's key
    and the preset's id, never in a screen. */
export function addCustomDimension(dim: Omit<GenderDimension, 'key' | 'builtIn' | 'hidden'>): GenderDimension {
  const created: GenderDimension = { ...dim, key: crypto.randomUUID(), builtIn: false, hidden: false };
  db.dimensions.push(created);
  const active = activePreset();
  const custom: GenderPreset = {
    id: crypto.randomUUID(),
    name: 'Custom',
    builtIn: false,
    dims: [...active.dims, created.key],
  };
  db.customPresets.push(custom);
  prefs.activePreset = custom.id;
  save();
  return created;
}
