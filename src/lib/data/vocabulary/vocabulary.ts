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
import { MOOD_RANGE, type MetricRange } from '../metricRange';
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
  moodName,
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
  /** The gender dimension a metric key names, or null when the metric is
      mood. Also null for a key no dimension carries, which is how the name,
      the range and the legend below stay in agreement: a preference left
      pointing at a dimension this install does not have reads as mood in
      all three places rather than as a dimension in one and mood in the
      others. */
  metricDimension(metric: string): GenderDimension | null {
    return this.dimensions.find((d) => d.key === metric) ?? null;
  },
  /** What the metric is called on screen: mood, or the chosen gender
      dimension. Four screens derived this identically before. */
  get metricName(): string {
    return this.metricDimension(metricKey(prefs))?.name ?? m.mood();
  },
  /** A metric's own range, for turning a native value into colour
      intensity (metricRange.ts). Mood's range is not a stored row. */
  rangeOf(metric: string): MetricRange {
    const d = this.metricDimension(metric);
    return d ? { min: d.min, max: d.max } : MOOD_RANGE;
  },
  /** What the two ends of the heat map are called. A gender
      dimension reads its own endpoint labels, because neither end of
      binary↔nonbinary or agender↔gendered is the better one and colour
      must not say otherwise (ADR-0012, F15). Mood is the one metric with a
      worst-to-best legend, and it uses the mood names rather than 1 and 5. */
  get metricLegend(): { low: string; high: string } {
    const d = this.metricDimension(metricKey(prefs));
    return d ? { low: d.low, high: d.high } : { low: moodName(1), high: moodName(5) };
  },
  tag(id: string): Tag | null {
    const found = tagById(id);
    return found && localizeTag(found);
  },
  randomTemplates(n?: number): MilestoneTemplate[] {
    return randomTemplates(n).map(localizeTemplate);
  }
};
