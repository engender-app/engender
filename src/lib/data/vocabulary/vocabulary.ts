/* What screens read the vocabulary through.

   Storage holds built-ins as bare keys (builtins.ts) and the wording lives
   in the message catalogue (labels.ts); this joins the two on the way out,
   leaving custom rows - which carry the user's own words - untouched.

   It sits above the mirror rather than inside it because the layer below
   has to stay free of paraglide: ADR-0016 keeps the Node tier away from it,
   and every journal area is under Node-tier tests. So the mirror answers
   "which rows", and this answers "called what". */

import { m } from '$lib/paraglide/messages';
import { MOOD_RANGE, type MetricRange } from '../metricRange';
import { prefs } from '../prefs/store.svelte';
import { metricKey } from '../prefs/catalogue';
import { reference } from '../live/reference.svelte';
import { presetLean, rankByLean } from '../lean';
import { entryPromptRows, entryTemplateRows, milestoneTemplateRows, regimenTemplateRows } from './builtins';
import type {
  Affirmation,
  BodyRegion,
  EntryPrompt,
  EntryTemplate,
  GenderDimension,
  GenderPreset,
  MeasurementType,
  Milestone,
  MilestoneTemplate,
  RegimenTemplate,
  Tag,
  TagGroup
} from '../types';
import {
  affirmationText,
  bodyRegionName,
  dimensionHigh,
  dimensionLow,
  dimensionName,
  entryPromptText,
  entryTemplateName,
  measurementTypeName,
  milestoneTemplateName,
  moodName,
  presetName,
  tagDescription,
  tagGroupName,
  tagLabel
} from './labels';
import { regimenTemplateDrug, regimenTemplateEster, regimenTemplateName, regimenTemplateRoute } from './doseLabels';

function localizeDimension(d: GenderDimension): GenderDimension {
  if (!d.builtIn) return d;
  return { ...d, name: dimensionName(d.key), low: dimensionLow(d.key), high: dimensionHigh(d.key) };
}

function localizeAffirmation(a: Affirmation): Affirmation {
  return a.builtIn ? { ...a, text: affirmationText(a.id) } : a;
}

function localizeBodyRegion(r: BodyRegion): BodyRegion {
  return r.builtIn ? { ...r, name: bodyRegionName(r.id) } : r;
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

function localizeMeasurementType(t: MeasurementType): MeasurementType {
  return t.builtIn ? { ...t, name: measurementTypeName(t.key) } : t;
}

function localizeTemplate(t: MilestoneTemplate): MilestoneTemplate {
  return { ...t, name: milestoneTemplateName(t.key) };
}

function localizeRegimenTemplate(t: RegimenTemplate): RegimenTemplate {
  return {
    ...t,
    name: regimenTemplateName(t.key),
    drug: regimenTemplateDrug(t.key),
    ester: regimenTemplateEster(t.key),
    route: regimenTemplateRoute(t.key)
  };
}

function localizeEntryTemplate(t: EntryTemplate): EntryTemplate {
  return { ...t, name: entryTemplateName(t.key) };
}

function localizeEntryPrompt(p: EntryPrompt): EntryPrompt {
  return { ...p, text: entryPromptText(p.key) };
}

/** Keys only; the names come from the message catalogue below. Not stored
    rows at all - a template is a suggestion the app ships (ticket 05). */
const milestoneTemplates: MilestoneTemplate[] = milestoneTemplateRows();

/** Same shape as `milestoneTemplates` above, for regimen episodes (phase 5
    ticket 42, CONTEXT: "Regimen template"). */
const regimenTemplates: RegimenTemplate[] = regimenTemplateRows();

/** Same shape as `milestoneTemplates` above, for entries rather than
    milestones (phase 4 features ticket 17). */
const entryTemplates: EntryTemplate[] = entryTemplateRows();

/** The built-in rotating reflection prompts (phase 4 features ticket 17),
    keyed the same way. */
const entryPrompts: EntryPrompt[] = entryPromptRows();

export const vocabulary = {
  get dimensions(): GenderDimension[] {
    return reference.dimensions.map(localizeDimension);
  },
  get activeDimensions(): GenderDimension[] {
    return reference.activeDimensions.map(localizeDimension);
  },
  /** Every dimension that has not been hidden (CONTEXT: "Hidden") - what a
      template's pre-fill (ticket 17) may set, the same "not hidden" filter
      `visibleTagGroups` already applies to tags. */
  get visibleDimensions(): GenderDimension[] {
    return this.dimensions.filter((d) => !d.hidden);
  },
  get presets(): GenderPreset[] {
    return reference.presets.map(localizePreset);
  },
  get activePreset(): GenderPreset {
    return localizePreset(reference.activePreset);
  },
  /** The active preset's own lean (phase 5 ticket 43, ADR-0030) - `null`
      when it has both `femininity` and `masculinity`, or neither, and every
      lean-tagged picker should render unranked. Shared by every picker that
      ranks by lean, so the derivation is computed once rather than at each
      call site. */
  get activeLean(): 'femme' | 'masc' | null {
    return presetLean(this.activePreset.dims);
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
  /** Every measurement type, built-in and custom, hidden ones included -
      what the measurements settings screen manages (phase 5 ticket 29). */
  get measurementTypes(): MeasurementType[] {
    return reference.measurementTypes.map(localizeMeasurementType);
  },
  /** What the type picker on the measurements screen offers - hiding a
      type removes it from here without touching what it has logged
      (CONTEXT: "Hidden"), the same "not hidden" filter `visibleDimensions`
      already applies. */
  get visibleMeasurementTypes(): MeasurementType[] {
    return this.measurementTypes.filter((t) => !t.hidden);
  },
  /** What a measurement type is called, hidden or not - a chart or a row
      for a type since hidden still needs its name. Falls back to the key
      itself for a type this install has never heard of, the same
      defensive fallback `presetDimensionNames` gives a dimension key. */
  measurementTypeName(key: string): string {
    return this.measurementTypes.find((t) => t.key === key)?.name ?? key;
  },
  get milestones(): Milestone[] {
    return reference.milestones;
  },
  get journeyAnchor(): Milestone | null {
    return reference.journeyAnchor;
  },
  /** Every affirmation line, hidden built-ins included, in the wording the
      current language gives a built-in - what the settings screen manages. */
  get affirmations(): Affirmation[] {
    return reference.affirmations.map(localizeAffirmation);
  },
  /** One language's custom lines, in the order they were added - never
      localized, since a custom line is never translated (CONTEXT: "Custom"). */
  customAffirmations(language: 'en' | 'pl'): Affirmation[] {
    return reference.affirmations.filter((a) => !a.builtIn && a.language === language);
  },
  get milestoneTemplates(): MilestoneTemplate[] {
    return milestoneTemplates.map(localizeTemplate);
  },
  /** The built-in regimen episode suggestions (phase 5 ticket 42, CONTEXT:
      "Regimen template"), in the wording the current language gives them -
      what the regimen editor's "add new" picker offers above manual entry.
      Ranked by the active preset's lean (phase 5 ticket 43, ADR-0030):
      matching templates first, the rest after in their existing order -
      every template still shown, just reordered. */
  get regimenTemplates(): RegimenTemplate[] {
    return rankByLean(regimenTemplates.map(localizeRegimenTemplate), this.activeLean);
  },
  /** Every body region, hidden built-ins and custom ones included, in the
      wording the user sees (ticket 09, reference-data area since ticket
      30) - what an entry card or the trend chart resolves a logged
      region's key against. */
  get bodyRegions(): BodyRegion[] {
    return reference.bodyRegions.map(localizeBodyRegion);
  },
  /** What the entry editor and the body-map picker offer: hidden regions
      removed (CONTEXT: "Hidden"), the same "not hidden" filter
      `visibleTagGroups` already applies to tags. */
  get visibleBodyRegions(): BodyRegion[] {
    return reference.visibleBodyRegions.map(localizeBodyRegion);
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
      between visits and the shuffle button has something to do (PRD F6).
      Which `n` get picked stays random - lean only orders the ones that
      land in the draw (phase 5 ticket 43, ADR-0030), matching the active
      preset first. */
  randomTemplates(n = 3): MilestoneTemplate[] {
    const pool = [...milestoneTemplates];
    const picked: MilestoneTemplate[] = [];
    while (picked.length < n && pool.length) {
      picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return rankByLean(picked.map(localizeTemplate), this.activeLean);
  },
  /** The built-in templates the entry-creation flow can offer (phase 4
      features ticket 17), in the wording the current language gives them. */
  get entryTemplates(): EntryTemplate[] {
    return entryTemplates.map(localizeEntryTemplate);
  },
  /** One rotating reflection prompt, picked at random so the cue differs
      between visits (phase 4 features ticket 17) - the same reasoning
      `randomTemplates` above gives the milestone shuffle button. */
  randomPrompt(): EntryPrompt {
    return localizeEntryPrompt(entryPrompts[Math.floor(Math.random() * entryPrompts.length)]);
  }
};
