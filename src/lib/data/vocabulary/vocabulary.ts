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
import { rankByLean, scaleLean } from '../lean';
import { milestoneTemplateRows, regimenTemplateRows } from './builtins';
import { resolveBuiltInWording } from './entryTemplates';
import type {
  Affirmation,
  BodyRegion,
  EffectCategory,
  EntryTemplate,
  GenderDimension,
  MeasurementType,
  Milestone,
  MilestoneTemplate,
  PersonalEffectCatalogEntry,
  Presentation,
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
  dimensionNote as builtInDimensionNote,
  effectCategoryName,
  entryTemplateName,
  entryTemplateNoteScaffold,
  measurementTypeName,
  milestoneTemplateName,
  moodName,
  personalEffectName,
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

function localizeMeasurementType(t: MeasurementType): MeasurementType {
  return t.builtIn ? { ...t, name: measurementTypeName(t.key) } : t;
}

function localizeEffectCategory(c: EffectCategory): EffectCategory {
  return { ...c, name: effectCategoryName(c.key) };
}

function localizePersonalEffectType(e: PersonalEffectCatalogEntry): PersonalEffectCatalogEntry {
  return e.builtIn ? { ...e, name: personalEffectName(e.key) } : e;
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

/** A built-in still seeded blank is resolved by key, the same "data lives
    in the mirror, wording lives in labels.ts" split every other built-in
    area uses; a custom template's name and note scaffold are the person's
    own words and pass through untouched, same as a built-in the person has
    edited (ticket 25's "editable-name question", answer 2: the edit
    wins). `resolveBuiltInWording` is where that fallback direction is
    decided and proven. */
function localizeEntryTemplate(t: EntryTemplate): EntryTemplate {
  if (!t.builtIn) return t;
  return {
    ...t,
    ...resolveBuiltInWording(
      { name: t.name, noteScaffold: t.noteScaffold },
      { name: entryTemplateName(t.id), noteScaffold: entryTemplateNoteScaffold(t.id) ?? '' }
    )
  };
}

/** Keys only; the names come from the message catalogue below. Not stored
    rows at all - a template is a suggestion the app ships (ticket 05). */
const milestoneTemplates: MilestoneTemplate[] = milestoneTemplateRows();

/** Same shape as `milestoneTemplates` above, for regimen episodes (phase 5
    ticket 42, CONTEXT: "Regimen template"). */
const regimenTemplates: RegimenTemplate[] = regimenTemplateRows();

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
  /** The line under a scale's name on the checklist that chooses which
      scales get logged (phase 5 ticket 35), saying what the slider
      measures rather than what having it says about you.

      A custom scale has no catalogue line to look up, so it gets its own
      two ends read back to it - which is the same fact in the person's own
      words, and better than a sentence the app wrote about a scale it
      knows nothing about. Undefined for a built-in this build has no line
      for, which draws the row without a subtitle rather than with a key. */
  dimensionNote(dim: GenderDimension): string | undefined {
    if (!dim.builtIn) return m.scale_custom_note({ low: dim.low, high: dim.high });
    return builtInDimensionNote(dim.key) ?? undefined;
  },
  /** The lean the ticked scales carry (phase 5 ticket 43, ADR-0030) -
      `null` when both `femininity` and `masculinity` are ticked, or neither,
      and every lean-tagged picker should render unranked. Shared by every
      picker that ranks by lean, so the derivation is computed once rather
      than at each call site.

      Read off the scales actually drawn rather than off the stored list, so
      a ticked scale this install no longer has cannot lean a picker
      (ticket 35 replaced the preset the lean used to come from). */
  get activeLean(): 'femme' | 'masc' | null {
    return scaleLean(this.activeDimensions.map((d) => d.key));
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
      defensive fallback every `lookup` in labels.ts gives a key. */
  measurementTypeName(key: string): string {
    return this.measurementTypes.find((t) => t.key === key)?.name ?? key;
  },
  /** All five (or six) effect categories, in seed order, in the wording the
      current language gives them (phase 5 ticket 41, CONTEXT: "Effect
      category") - what the effects settings screen manages. */
  get effectCategories(): EffectCategory[] {
    return reference.effectCategories.map(localizeEffectCategory);
  },
  /** Every personal-effect catalogue entry, built-in and custom, hidden
      ones and every tier included - what the effects settings screen
      manages (CONTEXT: "Hidden", "Personal effect"). */
  get personalEffectTypes(): PersonalEffectCatalogEntry[] {
    return reference.personalEffectTypes.map(localizePersonalEffectType);
  },
  /** What the "mark a change" picker and the timeline offer: a hidden
      effect or one whose category is off removed, the same "not hidden"
      filter `visibleMeasurementTypes` already applies, widened with the
      category toggle. */
  get visiblePersonalEffectTypes(): PersonalEffectCatalogEntry[] {
    return reference.visiblePersonalEffectTypes.map(localizePersonalEffectType);
  },
  /** What a personal effect is called, hidden or not - a timeline row for
      an effect since hidden still needs its name. Falls back to the key
      itself for one this install has never heard of, the same defensive
      fallback `measurementTypeName` gives. */
  personalEffectTypeName(key: string): string {
    return this.personalEffectTypes.find((e) => e.key === key)?.name ?? key;
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
  /** What Home, the calendar and stats colour by (`reference.activeMetric`):
      the stored metric, or mood when it names a scale that is not ticked.
      Screens read this rather than `metricKey(prefs)` so none of them can
      colour by a scale its own picker does not offer. */
  get activeMetric(): string {
    return reference.activeMetric;
  },
  /** What the metric is called on screen: mood, or the chosen gender
      dimension. Four screens derived this identically before. */
  get metricName(): string {
    return this.metricDimension(this.activeMetric)?.name ?? m.mood();
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
    const d = this.metricDimension(this.activeMetric);
    return d ? { low: d.low, high: d.high } : { low: moodName(1), high: moodName(5) };
  },
  tag(id: string): Tag | null {
    const found = reference.tag(id);
    return found && localizeTag(found);
  },
  /** Every presentation a person has named (phase 5 deepening ticket 17,
      ADR-0048), most-recently-used first - no built-in wording to localize,
      since every name is typed by the person. */
  get presentations(): Presentation[] {
    return reference.presentations;
  },
  get visiblePresentations(): Presentation[] {
    return reference.visiblePresentations;
  },
  presentation(id: string): Presentation | null {
    return this.presentations.find((p) => p.id === id) ?? null;
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
  /** Every entry template, built-in and authored, hidden ones included, in
      the wording the current language gives a built-in (phase 6 ticket 07)
      - what the editing screen manages. */
  get entryTemplates(): EntryTemplate[] {
    return reference.entryTemplates.map(localizeEntryTemplate);
  },
  /** What the entry editor's "use template" sheet offers: hidden templates
      removed, the same "not hidden" filter `visibleTagGroups` already
      applies to tags. */
  get visibleEntryTemplates(): EntryTemplate[] {
    return reference.visibleEntryTemplates.map(localizeEntryTemplate);
  },
  /** One rotating reflection cue for the entry-creation banner (phase 4
      features ticket 17). Picked from every visible template whose only
      content is a note scaffold - no tags, no dims, no presentation - which
      is a structural test, not a `builtIn` check: the eight folded-in
      guided prompts (phase 6 ticket 07) always have this shape, but so does
      any authored template a person builds the same way, and there is no
      reason to keep the banner from offering theirs too once it exists.
      Null once every one has been hidden, which the banner reads as
      nothing to show rather than an error - the same resting state hiding
      every built-in already gives any other picker. */
  randomPrompt(): EntryTemplate | null {
    const pool = this.visibleEntryTemplates.filter(
      (t) => t.tags.length === 0 && Object.keys(t.dims).length === 0 && t.noteScaffold !== '' && t.presentationId === null
    );
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }
};
