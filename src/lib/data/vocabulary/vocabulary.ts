/* What screens read the vocabulary through.

   Storage holds built-ins as bare keys (builtins.ts) and the wording lives
   in the message catalogue (labels.ts); this joins the two on the way out,
   leaving custom rows - which carry the user's own words - untouched.

   It sits above the repositories rather than inside them because the
   repositories have to stay free of paraglide: ADR-0016 keeps the Node
   tier away from it, and ticket 07 puts all six areas under Node-tier
   tests. So a repository answers "which rows", and this answers "called
   what". */

import { db } from '../db.svelte';
import { m } from '$lib/paraglide/messages';
import { prefs } from '../prefs/store.svelte';
import { metricKey } from '../prefs/catalogue';
import { activeDimensions, activePreset, getPresets } from '../repositories/dimensions';
import { randomTemplates, milestoneTemplates } from '../repositories/milestones';
import { tagById, visibleTagGroups } from '../repositories/tags';
import type { GenderDimension, GenderPreset, MilestoneTemplate, Tag, TagGroup } from '../types';
import {
  dimensionHigh,
  dimensionLow,
  dimensionName,
  milestoneTemplateName,
  presetName,
  tagGroupName,
  tagLabel
} from './labels';

function localizeDimension(d: GenderDimension): GenderDimension {
  if (!d.builtIn) return d;
  return { ...d, name: dimensionName(d.key), low: dimensionLow(d.key), high: dimensionHigh(d.key) };
}

function localizeTag(t: Tag): Tag {
  return t.builtIn ? { ...t, label: tagLabel(t.id) } : t;
}

function localizeGroup(g: TagGroup): TagGroup {
  return { ...g, name: g.builtIn ? tagGroupName(g.key) : g.name, tags: g.tags.map(localizeTag) };
}

function localizePreset(p: GenderPreset): GenderPreset {
  return p.builtIn ? { ...p, name: presetName(p.id) } : p;
}

function localizeTemplate(t: MilestoneTemplate): MilestoneTemplate {
  return { ...t, name: milestoneTemplateName(t.key) };
}

export const vocabulary = {
  get dimensions(): GenderDimension[] {
    return db.dimensions.map(localizeDimension);
  },
  get activeDimensions(): GenderDimension[] {
    return activeDimensions().map(localizeDimension);
  },
  get presets(): GenderPreset[] {
    return getPresets().map(localizePreset);
  },
  get activePreset(): GenderPreset {
    return localizePreset(activePreset());
  },
  get tagGroups(): TagGroup[] {
    return db.tagGroups.map(localizeGroup);
  },
  get visibleTagGroups(): TagGroup[] {
    return visibleTagGroups().map(localizeGroup);
  },
  get milestoneTemplates(): MilestoneTemplate[] {
    return milestoneTemplates.map(localizeTemplate);
  },
  /** What the metric is called on screen: mood, or the chosen gender
      dimension. Four screens derived this identically before. */
  get metricName(): string {
    if (prefs.metricKind === 'mood') return m.mood();
    return this.dimensions.find((d) => d.key === metricKey(prefs))?.name ?? m.mood();
  },
  tag(id: string): Tag | null {
    const found = tagById(id);
    return found && localizeTag(found);
  },
  randomTemplates(n?: number): MilestoneTemplate[] {
    return randomTemplates(n).map(localizeTemplate);
  }
};
