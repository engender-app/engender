/* The mirrored half of ADR-0004: gender dimensions, presets, tag groups and
   milestones, held in reactive state and read synchronously.

   All four are bounded at tens of rows, are never paginated, and are needed
   by nearly every component - the entry editor wants the active preset's
   dimensions and the visible tag groups, every entry card wants tag labels,
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

import { prefs } from '../prefs/store.svelte';
import type { GenderDimension, GenderPreset, Milestone, Tag, TagGroup } from '../types';
import type { Journal } from '../journal/journal';
import { onTablesWritten } from './journal.svelte';
import type { TableName } from './writes';

const mirror = $state<{
  dimensions: GenderDimension[];
  presets: GenderPreset[];
  tagGroups: TagGroup[];
  milestones: Milestone[];
}>({ dimensions: [], presets: [], tagGroups: [], milestones: [] });

/** Which slices a written table invalidates. Photos are in here because a
    milestone carries its photo on the mirrored row, so attaching one changes
    what the timeline should draw. */
const AFFECTED: Partial<Record<TableName, ('dimensions' | 'presets' | 'tagGroups' | 'milestones')[]>> = {
  dimension: ['dimensions', 'presets'],
  preset: ['presets'],
  tag: ['tagGroups'],
  milestone: ['milestones'],
  photo: ['milestones']
};

let registered = false;

/** Boot step 3, through the `loadReferenceData` hook `boot.ts` reserves for
    it: fills the mirror before the first screen renders, so nothing has to
    cope with an app whose vocabulary is briefly empty. */
export async function hydrateReference(journal: Journal): Promise<void> {
  const [dimensions, presets, tagGroups, milestones] = await Promise.all([
    journal.dimensions.getDimensions(),
    journal.dimensions.getPresets(),
    journal.tags.getTagGroups(),
    journal.milestones.getMilestones()
  ]);
  mirror.dimensions = dimensions;
  mirror.presets = presets;
  mirror.tagGroups = tagGroups;
  mirror.milestones = milestones;

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
    if (slices.has('presets')) mirror.presets = await journal.dimensions.getPresets();
    if (slices.has('tagGroups')) mirror.tagGroups = await journal.tags.getTagGroups();
    if (slices.has('milestones')) mirror.milestones = await journal.milestones.getMilestones();
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
  get presets(): GenderPreset[] {
    return mirror.presets;
  },
  get tagGroups(): TagGroup[] {
    return mirror.tagGroups;
  },
  get milestones(): Milestone[] {
    return mirror.milestones;
  },

  /** The preset the preferences point at, falling back to the first one: a
      preference naming a preset this install does not have must not leave the
      editor with no scales at all. */
  get activePreset(): GenderPreset {
    return mirror.presets.find((p) => p.id === prefs.activePreset) ?? mirror.presets[0] ?? EMPTY_PRESET;
  },

  /** The active preset's dimensions, in the preset's order, skipping keys no
      dimension carries. */
  get activeDimensions(): GenderDimension[] {
    return this.activePreset.dims
      .map((key) => mirror.dimensions.find((d) => d.key === key))
      .filter((d): d is GenderDimension => !!d);
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
  }
};

/* Only ever reached before the mirror is filled - the built-ins reconcile on
   every boot, so a real install always has presets. It exists so the editor's
   `preset.name` is a string rather than a crash during that window. */
const EMPTY_PRESET: GenderPreset = { id: '', name: '', builtIn: false, dims: [] };
