/* What screens read the vocabulary through.

   Storage holds built-ins as bare keys (builtins.ts) and the wording lives
   in the message catalogue (labels.ts); this joins the two on the way out,
   leaving custom rows - which carry the user's own words - untouched.

   It sits above the mirror rather than inside it because the layer below
   has to stay free of paraglide: ADR-0016 keeps the Node tier away from it,
   and every journal area is under Node-tier tests. So the mirror answers
   "which rows", and this answers "called what". */

import { m } from '$lib/paraglide/messages';
import { BODY_REGION_KEYS } from '../bodyMap';
import { MOOD_RANGE, type MetricRange } from '../metricRange';
import { prefs } from '../prefs/store.svelte';
import { metricKey } from '../prefs/catalogue';
import { reference } from '../live/reference.svelte';
import { milestoneTemplateRows } from './builtins';
import type { GenderDimension, GenderPreset, Milestone, MilestoneTemplate, Tag, TagGroup } from '../types';
import {
  bodyRegionName,
  dimensionHigh,
  dimensionLow,
  dimensionName,
  milestoneTemplateName,
  moodName,
  presetName,
  tagDescription,
  tagGroupName,
  tagLabel
} from './labels';

function localizeDimension(d: GenderDimension): GenderDimension {
  if (!d.builtIn) return d;
  return { ...d, name: dimensionName(d.key), low: dimensionLow(d.key), high: dimensionHigh(d.key) };
}

function localizeTag(t: Tag): Tag {
  if (!t.builtIn) return t;
  const label = tagLabel(t.id);
  const description = tagDescription(t.id);
  return description ? { ...t, label, description } : { ...t, label };
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

/** Keys only; the names come from the message catalogue below. Not stored
    rows at all - a template is a suggestion the app ships (ticket 05). */
const milestoneTemplates: MilestoneTemplate[] = milestoneTemplateRows();

export const vocabulary = {
  get dimensions(): GenderDimension[] {
    return reference.dimensions.map(localizeDimension);
  },
  get activeDimensions(): GenderDimension[] {
    return reference.activeDimensions.map(localizeDimension);
  },
  get presets(): GenderPreset[] {
    return reference.presets.map(localizePreset);
  },
  get activePreset(): GenderPreset {
    return localizePreset(reference.activePreset);
  },
  get tagGroups(): TagGroup[] {
    return reference.tagGroups.map(localizeGroup);
  },
  get visibleTagGroups(): TagGroup[] {
    return reference.visibleTagGroups.map(localizeGroup);
  },
  /** Every tag the app knows, hidden ones included, in the wording the user
      sees - which is what search matches typed text against (ADR-0005). */
  get tags(): Tag[] {
    return reference.tags.map(localizeTag);
  },
  get milestones(): Milestone[] {
    return reference.milestones;
  },
  get milestoneTemplates(): MilestoneTemplate[] {
    return milestoneTemplates.map(localizeTemplate);
  },
  /** Every body region the picker offers (ticket 09), keys only until
      named here - not a stored reference-data row, the same fixed-list
      shape as milestone templates. */
  get bodyRegions(): { key: string; name: string }[] {
    return BODY_REGION_KEYS.map((key) => ({ key, name: bodyRegionName(key) }));
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
    const found = reference.tag(id);
    return found && localizeTag(found);
  },
  /** PR-001: names the dimensions a preset turns on, in place of a scale
      count - "3 scales" said less than the identity-flavoured preset name
      already did. Shared by the Settings and onboarding preset pickers. */
  presetDimensionNames(dims: readonly string[]): string {
    const byKey = new Map(this.dimensions.map((d) => [d.key, d.name]));
    return dims.map((k) => byKey.get(k) ?? k).join(', ');
  },
  /** A few templates to offer, picked at random so the suggestions differ
      between visits and the shuffle button has something to do (PRD F6). */
  randomTemplates(n = 3): MilestoneTemplate[] {
    const pool = [...milestoneTemplates];
    const picked: MilestoneTemplate[] = [];
    while (picked.length < n && pool.length) {
      picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return picked.map(localizeTemplate);
  }
};
