/* The mirrored half of ADR-0004: gender dimensions, tag groups, milestones
   and the rest of the vocabulary, held in reactive state and read
   synchronously.

   All of them are bounded at tens of rows, are never paginated, and are
   needed by nearly every component - the entry editor wants the ticked
   scales and the visible tag groups, every entry card wants tag labels,
   Home wants milestones. Querying them asynchronously would put a loading
   state on the whole app rather than on the four screens that read entry
   data.

   The mirror sits above the journal rather than inside it because the journal
   is rune-free (ADR-0017): it returns plain async results, and every piece of
   reactive state lives here.

   It is a mirror, not a second source of truth. It is filled from SQLite at
   boot and re-read from SQLite after any write that touches it, so a screen
   cannot end up showing a tag the table does not have. The refresh is one
   round trip behind the write it follows - a renamed tag is visibly stored
   before it is visibly renamed - which is the same shape the preference
   store's cache already has.

   What things are *called* is not here: a built-in stores a key and its
   wording comes from the message catalogue, which needs paraglide, which the
   layer below cannot import (ADR-0016). This module answers "which rows" and
   vocabulary.ts answers "called what". */

import { metricKey } from '../prefs/catalogue';
import { prefs } from '../prefs/store.svelte';
import type {
  Affirmation,
  BodyRegion,
  EffectCategory,
  GenderDimension,
  MeasurementType,
  Milestone,
  PersonalEffectCatalogEntry,
  Presentation,
  Tag,
  TagGroup
} from '../types';
import type { Journal } from '../journal/journal';
import { onTablesWritten } from './journal.svelte';
import type { TableName } from './writes';

const mirror = $state<{
  dimensions: GenderDimension[];
  tagGroups: TagGroup[];
  milestones: Milestone[];
  affirmations: Affirmation[];
  bodyRegions: BodyRegion[];
  measurementTypes: MeasurementType[];
  effectCategories: EffectCategory[];
  personalEffectTypes: PersonalEffectCatalogEntry[];
  presentations: Presentation[];
}>({
  dimensions: [],
  tagGroups: [],
  milestones: [],
  affirmations: [],
  bodyRegions: [],
  measurementTypes: [],
  effectCategories: [],
  personalEffectTypes: [],
  presentations: []
});

type MirrorSlice =
  | 'dimensions'
  | 'tagGroups'
  | 'milestones'
  | 'affirmations'
  | 'bodyRegions'
  | 'measurementTypes'
  | 'effectCategories'
  | 'personalEffectTypes'
  | 'presentations';

/** Which slices a written table invalidates. Photos are in here because a
    milestone carries its photo on the mirrored row, so attaching one changes
    what the timeline should draw. `entry` is here for one slice only:
    `presentations` reads most-recently-used first by joining the entry
    table's own timestamps (presentations.ts), so a save has to refresh it
    too, not only a rename or a recolour. */
const AFFECTED: Partial<Record<TableName, MirrorSlice[]>> = {
  dimension: ['dimensions'],
  tag: ['tagGroups'],
  milestone: ['milestones'],
  photo: ['milestones'],
  affirmation: ['affirmations'],
  bodyRegion: ['bodyRegions'],
  measurementType: ['measurementTypes'],
  effectCategory: ['effectCategories'],
  personalEffectType: ['personalEffectTypes'],
  presentation: ['presentations'],
  entry: ['presentations']
};

let registered = false;

/** Boot step 3, through the `loadReferenceData` hook `boot.ts` reserves for
    it: fills the mirror before the first screen renders, so nothing has to
    cope with an app whose vocabulary is briefly empty. */
export async function hydrateReference(journal: Journal): Promise<void> {
  const [
    dimensions,
    tagGroups,
    milestones,
    affirmations,
    bodyRegions,
    measurementTypes,
    effectCategories,
    personalEffectTypes,
    presentations
  ] = await Promise.all([
    journal.dimensions.getDimensions(),
    journal.tags.getTagGroups(),
    journal.milestones.getMilestones(),
    journal.affirmations.getAffirmations(),
    journal.bodyRegions.getBodyRegions(),
    journal.measurements.getMeasurementTypes(),
    journal.effectCategories.getEffectCategories(),
    journal.personalEffects.getEffectTypes(),
    journal.presentations.getPresentations()
  ]);
  mirror.dimensions = dimensions;
  mirror.tagGroups = tagGroups;
  mirror.milestones = milestones;
  mirror.affirmations = affirmations;
  mirror.bodyRegions = bodyRegions;
  mirror.measurementTypes = measurementTypes;
  mirror.effectCategories = effectCategories;
  mirror.personalEffectTypes = personalEffectTypes;
  mirror.presentations = presentations;

  if (registered) return;
  registered = true;
  onTablesWritten((tables) => {
    const slices = new Set(tables.flatMap((table) => AFFECTED[table] ?? []));
    if (slices.size === 0) return;
    void refresh(journal, slices);
  });
}

async function refresh(journal: Journal, slices: Set<string>): Promise<void> {
  try {
    if (slices.has('dimensions')) mirror.dimensions = await journal.dimensions.getDimensions();
    if (slices.has('tagGroups')) mirror.tagGroups = await journal.tags.getTagGroups();
    if (slices.has('milestones')) mirror.milestones = await journal.milestones.getMilestones();
    if (slices.has('affirmations')) mirror.affirmations = await journal.affirmations.getAffirmations();
    if (slices.has('bodyRegions')) mirror.bodyRegions = await journal.bodyRegions.getBodyRegions();
    if (slices.has('measurementTypes')) mirror.measurementTypes = await journal.measurements.getMeasurementTypes();
    if (slices.has('effectCategories')) mirror.effectCategories = await journal.effectCategories.getEffectCategories();
    if (slices.has('personalEffectTypes')) mirror.personalEffectTypes = await journal.personalEffects.getEffectTypes();
    if (slices.has('presentations')) mirror.presentations = await journal.presentations.getPresentations();
  } catch (error) {
    // The write itself succeeded; only the re-read failed. Keeping the stale
    // rows beats emptying the vocabulary out from under the screen.
    console.error('could not refresh mirrored reference data', error);
  }
}

/** Which rows the app has, read synchronously. Getters rather than the state
    object itself, so nothing outside this module can assign to the mirror and
    make it disagree with the table it mirrors. */
export const reference = {
  get dimensions(): GenderDimension[] {
    return mirror.dimensions;
  },
  get tagGroups(): TagGroup[] {
    return mirror.tagGroups;
  },
  get milestones(): Milestone[] {
    return mirror.milestones;
  },

  /** Every affirmation line, hidden built-ins included - what the settings
      screen manages (CONTEXT: "Hidden"). */
  get affirmations(): Affirmation[] {
    return mirror.affirmations;
  },

  /** The lines the check-in's pool may draw from: hidden ones removed, the
      same "not hidden" filter `visibleTagGroups` already applies to tags.
      Language is not filtered here - that needs the active locale, and this
      module stays free of paraglide (ADR-0016) - vocabulary.ts narrows it
      further. */
  get visibleAffirmations(): Affirmation[] {
    return mirror.affirmations.filter((a) => !a.hidden);
  },

  /** Every body region an entry can log an intensity against, hidden ones
      included - what an entry card or the trend chart resolves a logged
      region's key against, so a region hidden after being logged still
      shows and charts (CONTEXT: "Hidden"). */
  get bodyRegions(): BodyRegion[] {
    return mirror.bodyRegions;
  },

  /** What the entry editor and the body-map picker offer: hidden regions
      removed, the same "not hidden" filter `visibleTagGroups` already
      applies to tags. */
  get visibleBodyRegions(): BodyRegion[] {
    return mirror.bodyRegions.filter((r) => !r.hidden);
  },

  /** Every measurement type, hidden ones included - what the measurements
      settings screen manages (phase 5 ticket 29, CONTEXT: "Hidden"). */
  get measurementTypes(): MeasurementType[] {
    return mirror.measurementTypes;
  },

  /** All five (or six) effect categories, in seed order (phase 5 ticket 41,
      CONTEXT: "Effect category") - what the effects settings screen manages. */
  get effectCategories(): EffectCategory[] {
    return mirror.effectCategories;
  },

  /** Every personal-effect catalogue entry, hidden ones and every tier
      included - what the effects settings screen manages
      (CONTEXT: "Hidden", "Personal effect"). */
  get personalEffectTypes(): PersonalEffectCatalogEntry[] {
    return mirror.personalEffectTypes;
  },

  /** What the "mark a change" picker and the timeline offer: hidden effects
      removed, and effects whose category is disabled removed too - the same
      "not hidden" filter `visibleTagGroups`/`visibleBodyRegions` apply,
      widened with the category toggle this catalogue adds. A custom effect
      with no category survives the category filter; nothing hides it but
      its own `hidden` flag. */
  get visiblePersonalEffectTypes(): PersonalEffectCatalogEntry[] {
    const disabledCategories = new Set(mirror.effectCategories.filter((c) => !c.enabled).map((c) => c.key));
    return mirror.personalEffectTypes.filter(
      (e) => !e.hidden && !(e.categoryKey !== null && disabledCategories.has(e.categoryKey))
    );
  },

  /** The milestone the journey anchor preference points at (phase 5 ticket
      25), or null when no anchor is set or it names a milestone this install
      no longer has. Unset is a legitimate resting state here, not a gap to
      paper over - the same answer `activeDimensions` gives an empty tick
      list. */
  get journeyAnchor(): Milestone | null {
    return mirror.milestones.find((mi) => mi.id === prefs.journeyAnchorMilestoneId) ?? null;
  },

  /** The scales the entry screen offers: the ticked ones (phase 5 ticket
      35), in catalogue order, skipping keys no dimension carries.

      Filtered from the catalogue rather than mapped over the stored list, so
      the order sliders appear in is the order the scales are defined in and
      not the order somebody happened to tick their boxes. Every built-in
      preset already listed its dimensions in catalogue order, so no install
      that upgrades finds its sliders rearranged.

      Nothing ticked gives nothing back, and that is a state rather than a
      fault: a mood, tags, a note and a photo are still an entry. The preset
      this replaced could not express it, so it fell back to the first preset
      whenever the stored key named nothing; there is no key to fail to
      resolve any more. */
  get activeDimensions(): GenderDimension[] {
    const ticked = new Set(prefs.activeScales);
    return mirror.dimensions.filter((d) => ticked.has(d.key));
  },

  /** What Home, the calendar and the stats screen colour by: the stored
      metric, or mood when it names a scale that is not ticked.

      Resolved on the way out rather than corrected on the way in, which is
      `journeyAnchor`'s rule directly above and for the same reason: a
      preference naming something this install does not offer is answered
      with the resting state, not rewritten. Unticking the scale Home was
      coloured by therefore drops Home back to mood, and ticking it again
      brings the choice back rather than having quietly spent it.

      Without this the metric could name a scale its own picker did not
      list, since every picker offers `activeDimensions` and only this read
      knew otherwise. A narrower version of that predates ticket 35 -
      switching to a preset that dropped your metric did it too - but
      unticking every scale makes it certain rather than possible, and
      "it must not read as broken" is that ticket's floor. */
  get activeMetric(): string {
    const key = metricKey(prefs);
    return this.activeDimensions.some((d) => d.key === key) ? key : 'mood';
  },

  /** Groups a user picks tags from: enabled groups, hidden tags removed, and
      groups left with nothing dropped (PRD F4/F17). */
  get visibleTagGroups(): TagGroup[] {
    return mirror.tagGroups
      .filter((g) => g.enabled)
      .map((g) => ({ ...g, tags: g.tags.filter((t) => !t.hidden) }))
      .filter((g) => g.tags.length > 0);
  },

  /** Every tag, group membership flattened away - what a search matches
      labels against (ADR-0005) and what an entry card resolves its ids
      through. Hidden tags included: an entry that carries one still has to
      render it. */
  get tags(): Tag[] {
    return mirror.tagGroups.flatMap((g) => g.tags);
  },

  tag(id: string): Tag | null {
    return this.tags.find((t) => t.id === id) ?? null;
  },

  /** Every presentation, most-recently-used first (presentations.ts),
      hidden ones included - what the management screen under /more offers
      (CONTEXT: "Hidden"). */
  get presentations(): Presentation[] {
    return mirror.presentations;
  },

  /** What the entry editor's chip offers: hidden presentations removed, the
      same "not hidden" filter `visibleTagGroups` already applies to tags. */
  get visiblePresentations(): Presentation[] {
    return mirror.presentations.filter((p) => !p.hidden);
  }
};
