/* GenderDimensionRepository (PRD F3). */

import { db, save } from '../db.svelte';
import { builtInPresets } from '../demo/seed';
import type { GenderDimension, GenderPreset } from '../types';

export function getPresets(): GenderPreset[] {
  return [...builtInPresets, ...db.customPresets];
}

export function activePreset(): GenderPreset {
  const presets = getPresets();
  return presets.find((p) => p.id === db.prefs.activePreset) ?? presets[0];
}

export function activeDimensions(): GenderDimension[] {
  return activePreset()
    .dims.map((k) => db.dimensions.find((d) => d.key === k))
    .filter((d): d is GenderDimension => !!d);
}

export function dimensionByKey(key: string): GenderDimension | undefined {
  return db.dimensions.find((d) => d.key === key);
}

/** Adding a custom dimension spawns a custom preset extending the active one. */
export function addCustomDimension(dim: Omit<GenderDimension, 'builtIn'>) {
  db.dimensions.push({ ...dim, builtIn: false });
  const active = activePreset();
  const custom: GenderPreset = {
    id: 'p-custom-' + Date.now(),
    name: 'Custom',
    builtIn: false,
    dims: [...active.dims, dim.key],
  };
  db.customPresets.push(custom);
  db.prefs.activePreset = custom.id;
  save();
}
