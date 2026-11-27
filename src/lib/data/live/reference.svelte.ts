/* Mirror bounded reference data in reactive memory for synchronous reads (ADR-0004).
   Editors, cards and Home need these few dozen rows without putting a loading state on the
   whole app. Keep the rune-free journal facade below the mirror (ADR-0017).

   Fill the mirror from SQLite at boot and refresh it one round trip after writes to its
   tables. vocabulary.ts resolves catalogue labels from keys above the Paraglide boundary. */

import { metricKey } from '../prefs/catalogue';
import { prefs } from '../prefs/store.svelte';
import type {
  BodyRegion,
  EffectCategory,
  GenderDimension,
  Milestone,
  PersonalEffectCatalogEntry,
  Presentation,
  Tag,
  TagGroup
} from '../types';
import type { Journal } from '../journal/journal';
import { journal as currentJournal, onTablesWritten } from './journal.svelte';
import { tablesReadBy } from './writes';

const mirror = $state<{
  dimensions: GenderDimension[];
  tagGroups: TagGroup[];
  milestones: Milestone[];
  bodyRegions: BodyRegion[];
  effectCategories: EffectCategory[];
  personalEffectTypes: PersonalEffectCatalogEntry[];
  presentations: Presentation[];
}>({
  dimensions: [],
  tagGroups: [],
  milestones: [],
  bodyRegions: [],
  effectCategories: [],
  personalEffectTypes: [],
  presentations: []
});

type MirrorSlice =
  | 'dimensions'
  | 'tagGroups'
  | 'milestones'
  | 'bodyRegions'
  | 'effectCategories'
  | 'personalEffectTypes'
  | 'presentations';

/** The read that fills each slice. A slice refreshes on exactly the tables
    that read declares in writes.ts - the declaration writes.sql.test.ts
    checks against the read's own SQL - rather than on a second hand-kept
    list here that nothing checks. So a milestone's photo refreshes the
    timeline because `getMilestones` joins it, and `presentations` refreshes
    on an entry save because it orders most-recently-used first by the entry
    table's own timestamps (presentations.ts). Each entry has to name the
    same read `refresh` below calls for that slice. */
const SLICE_READS: Record<MirrorSlice, [area: string, operation: string]> = {
  dimensions: ['dimensions', 'getDimensions'],
  tagGroups: ['tags', 'getTagGroups'],
  milestones: ['milestones', 'getMilestones'],
  bodyRegions: ['bodyRegions', 'getBodyRegions'],
  effectCategories: ['effectCategories', 'getEffectCategories'],
  personalEffectTypes: ['personalEffects', 'getEffectTypes'],
  presentations: ['presentations', 'getPresentations']
};

let registered = false;
let hydrated = $state(false);

/** Boot step 3, through the `loadReferenceData` hook `boot.ts` reserves for
    it. The intent was always to fill the mirror before the first screen
    renders, so nothing has to cope with an app whose vocabulary is briefly
    empty - but on a cold navigation straight to a route that reads the
    mirror (rather than one reached by tapping through an already-booted
    app), the route's own component tree mounts and paints before this
    promise settles regardless: SvelteKit hydrates the shell on its own
    schedule, not gated on `boot()`. `ready` is the signal
    a screen needs to tell "genuinely nothing here yet" apart from "still
    loading" during that window, the same distinction a `liveList` gets for
    free from its own query and this mirror does not. */
export async function hydrateReference(journal: Journal, current: () => void = () => {}): Promise<void> {
  // Re-armed on every call, not just the first: a journal re-open (access
  // mode switch) runs this again, and `ready` should describe *this* fill
  // rather than staying stuck true from a previous journal's.
  hydrated = false;
  const [
    dimensions,
    tagGroups,
    milestones,
    bodyRegions,
    effectCategories,
    personalEffectTypes,
    presentations
  ] = await Promise.all([
    journal.dimensions.getDimensions(),
    journal.tags.getTagGroups(),
    journal.milestones.getMilestones(),
    journal.bodyRegions.getBodyRegions(),
    journal.effectCategories.getEffectCategories(),
    journal.personalEffects.getEffectTypes(),
    journal.presentations.getPresentations()
  ]);
  current();
  mirror.dimensions = dimensions;
  mirror.tagGroups = tagGroups;
  mirror.milestones = milestones;
  mirror.bodyRegions = bodyRegions;
  mirror.effectCategories = effectCategories;
  mirror.personalEffectTypes = personalEffectTypes;
  mirror.presentations = presentations;
  hydrated = true;

  if (registered) return;
  registered = true;
  /* Re-read through the facade rather than the handle this first hydrate was given. The
     listener is bound once per page, and the handle is not: a web lock closes the database
     and the unlock opens a new one, so a refresh bound to the first handle re-read a closed
     journal, failed, and left the vocabulary stale. The facade is always the journal open
     now, and a refresh asked for while it is locked waits for the reopen. */
  onTablesWritten((tables) => {
    const slices = new Set(
      (Object.keys(SLICE_READS) as MirrorSlice[]).filter((slice) =>
        tablesReadBy(...SLICE_READS[slice]).some((table) => tables.includes(table))
      )
    );
    if (slices.size === 0) return;
    void refresh(currentJournal, slices);
  });
}

/** The lock's half: tag and milestone
    names are journal content, and a locked web journal keeps none of it in
    the page. Nothing reads the mirror behind the lock - every screen that
    does is unmounted - and the unlock hydrates it again before the app
    comes back. */
export function forgetReference(): void {
  hydrated = false;
  for (const slice of Object.keys(SLICE_READS) as MirrorSlice[]) mirror[slice] = [];
}

async function refresh(journal: Journal, slices: Set<string>): Promise<void> {
  try {
    if (slices.has('dimensions')) mirror.dimensions = await journal.dimensions.getDimensions();
    if (slices.has('tagGroups')) mirror.tagGroups = await journal.tags.getTagGroups();
    if (slices.has('milestones')) mirror.milestones = await journal.milestones.getMilestones();
    if (slices.has('bodyRegions')) mirror.bodyRegions = await journal.bodyRegions.getBodyRegions();
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
  /** Whether `hydrateReference` has filled the mirror at least once. A
      screen that reads an empty slice as "genuinely nothing here" (rather
      than putting it behind its own `liveList`) needs this to tell that
      state apart from "not hydrated yet" on a cold navigation straight to
      it. */
  get ready(): boolean {
    return hydrated;
  },

  get dimensions(): GenderDimension[] {
    return mirror.dimensions;
  },
  get tagGroups(): TagGroup[] {
    return mirror.tagGroups;
  },
  get milestones(): Milestone[] {
    return mirror.milestones;
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

  /** All five (or six) effect categories, in seed order - what the effects settings screen
      manages. */
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

  /** The milestone the journey anchor preference points at, or null when no anchor is set or it names a milestone this install
      no longer has. Unset is a legitimate resting state here, not a gap to
      paper over - the same answer `activeDimensions` gives an empty tick
      list. */
  get journeyAnchor(): Milestone | null {
    return mirror.milestones.find((mi) => mi.id === prefs.journeyAnchorMilestoneId) ?? null;
  },

  /** The scales the entry screen offers: the ticked ones, in catalogue order, skipping keys no dimension carries.

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

  /** Use the stored metric when its scale is active. Fall back to mood on read
      when that scale is unticked. Keep the preference so reticking it restores
      the same metric to Home, calendar and Look back. */
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
