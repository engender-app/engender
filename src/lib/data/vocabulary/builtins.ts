/* The built-in vocabulary every install gets: five gender dimensions, eight
  presets, five tag groups and eight milestone templates.

   Keys only, no display text. A built-in is the same concept on any
   device, so it is identified by a stable key and its name is looked up at
   display time (ADR-0002, and CONTEXT: Built-in). Storing "Femininity"
   would make a Polish install's archive disagree with an English one about
   what is the same dimension, and would freeze the wording at seed time.
   labels.ts holds the lookups; this file takes nothing but types, so the
   Node tier can read it without dragging in paraglide (ADR-0016).

   `as const` throughout, so each key list also produces the union type
   labels.ts has to cover exhaustively - a built-in added here without a
   message fails the typecheck rather than showing a raw key to someone. */

import type { EntryPrompt, EntryTemplate, GenderDimension, GenderPreset, MilestoneTemplate, Tag, TagGroup } from '../types.ts';

export const BUILT_IN_DIMENSIONS = [
  { key: 'euphoria_dysphoria', min: 0, max: 100 },
  { key: 'femininity', min: 0, max: 100 },
  { key: 'masculinity', min: 0, max: 100 },
  { key: 'binary_nonbinary', min: 0, max: 100 },
  { key: 'agender_gendered', min: 0, max: 100 }
] as const;

export type BuiltInDimensionKey = (typeof BUILT_IN_DIMENSIONS)[number]['key'];

export const BUILT_IN_PRESETS = [
  { key: 'p-btw', dims: ['euphoria_dysphoria', 'femininity'] },
  { key: 'p-masc', dims: ['euphoria_dysphoria', 'masculinity'] },
  { key: 'p-fem-masc', dims: ['euphoria_dysphoria', 'femininity', 'masculinity'] },
  { key: 'p-fluid', dims: ['euphoria_dysphoria', 'femininity', 'masculinity', 'binary_nonbinary'] },
  { key: 'p-agender', dims: ['euphoria_dysphoria', 'agender_gendered'] },
  { key: 'p-demi-fem', dims: ['euphoria_dysphoria', 'femininity', 'agender_gendered'] },
  { key: 'p-demi-masc', dims: ['euphoria_dysphoria', 'masculinity', 'agender_gendered'] },
  {
    key: 'p-nb',
    dims: ['euphoria_dysphoria', 'femininity', 'masculinity', 'binary_nonbinary', 'agender_gendered']
  }
] as const;

export type BuiltInPresetKey = (typeof BUILT_IN_PRESETS)[number]['key'];

export const BUILT_IN_TAG_GROUPS = [
  {
    key: 'gender',
    tags: [
      'g-soc-dys',
      'g-body-dys',
      'g-soc-eu',
      'g-body-eu',
      'g-euphoria',
      'g-transphobia',
      'g-gendered-ok',
      'g-misgendered'
    ]
  },
  {
    key: 'emotions',
    tags: ['e-happy', 'e-calm', 'e-anxious', 'e-sad', 'e-hopeful', 'e-tired']
  },
  {
    key: 'activities',
    tags: ['a-work', 'a-friends', 'a-family', 'a-exercise', 'a-therapy', 'a-shopping', 'a-selfcare']
  },
  {
    // Empty until a Daylio import finds an activity no existing tag names.
    // Keeping the group key built-in makes imports from different devices
    // converge on one group rather than minting one each (PRD F28).
    key: 'imported',
    tags: []
  },
  {
    // Named types of a hard day (CONTEXT: Dysphoria type), distinct from the
    // `euphoria_dysphoria` gender dimension above - a scale, not a tag group,
    // and never the same control. Bare category names, no "dysphoria" suffix,
    // matching how the emotions/activities groups above leave their own
    // group name off each tag; the group heading supplies it. That also
    // keeps "social" here from reading as a duplicate of the existing
    // g-soc-dys tag, which is a plain "this was a hard day, socially" flag
    // rather than a named category.
    key: 'dysphoria_type',
    tags: ['dt-physical', 'dt-biochemical', 'dt-social', 'dt-societal', 'dt-sexual', 'dt-presentational', 'dt-existential']
  }
] as const;

export type BuiltInTagGroupKey = (typeof BUILT_IN_TAG_GROUPS)[number]['key'];
export type BuiltInTagKey = (typeof BUILT_IN_TAG_GROUPS)[number]['tags'][number];

export const MILESTONE_TEMPLATE_KEYS = [
  'hrt_start',
  'transition_start',
  'coming_out',
  'first_appointment',
  'name_change',
  'marker_change',
  'surgery',
  'first_public'
] as const;

export type MilestoneTemplateKey = (typeof MILESTONE_TEMPLATE_KEYS)[number];

/* Entry templates (phase 4 features ticket 17): each names the tags and
   dimension values it pre-fills, the same "data lives here, wording lives
   in labels.ts" split BUILT_IN_PRESETS uses for its own `dims`. Values sit
   on the euphoria_dysphoria scale, the one dimension every built-in preset
   includes (BUILT_IN_PRESETS above), so a template's dial reading makes
   sense under any preset a person has chosen. */
export const ENTRY_TEMPLATES = [
  { key: 'euphoria_day', tags: ['g-euphoria', 'g-body-eu', 'g-soc-eu'], dims: { euphoria_dysphoria: 85 } },
  { key: 'dysphoria_day', tags: ['g-body-dys', 'g-soc-dys'], dims: { euphoria_dysphoria: 20 } },
  { key: 'gendered_correctly', tags: ['g-gendered-ok'], dims: {} },
  { key: 'misgendered', tags: ['g-misgendered'], dims: {} },
  { key: 'good_day', tags: ['e-happy', 'e-calm'], dims: { euphoria_dysphoria: 75 } },
  { key: 'hard_day', tags: ['e-sad', 'e-anxious'], dims: { euphoria_dysphoria: 30 } }
] as const;

export type EntryTemplateKey = (typeof ENTRY_TEMPLATES)[number]['key'];

/* Guided prompts (phase 4 features ticket 17): keys only, like milestone
   templates - the reflection text itself is wording, so it lives in
   labels.ts, not here. */
export const ENTRY_PROMPT_KEYS = [
  'euphoria_moment',
  'dysphoria_moment',
  'body_feeling',
  'seen_moment',
  'self_care',
  'presentation_feeling',
  'name_pronouns_feeling',
  'proud_moment'
] as const;

export type EntryPromptKey = (typeof ENTRY_PROMPT_KEYS)[number];

/* Presets and milestone templates are not stored rows in Phase 1 - the
   journal holds only what the user added - so these hand back the built-in
   ones in the shape the rest of the code already expects, names left for
   vocabulary.ts to fill in. */

export function builtInPresetRows(): GenderPreset[] {
  return BUILT_IN_PRESETS.map((p) => ({ id: p.key, name: '', builtIn: true, dims: [...p.dims] }));
}

export function milestoneTemplateRows(): MilestoneTemplate[] {
  return MILESTONE_TEMPLATE_KEYS.map((key) => ({ key, name: '' }));
}

export function entryTemplateRows(): EntryTemplate[] {
  return ENTRY_TEMPLATES.map((t) => ({ key: t.key, name: '', tags: [...t.tags], dims: { ...t.dims } }));
}

export function entryPromptRows(): EntryPrompt[] {
  return ENTRY_PROMPT_KEYS.map((key) => ({ key, text: '' }));
}

/* Reconciling, not seeding-if-empty. Both functions add what is missing by
   key and touch nothing else, so they are safe to run on every boot and
   again before an import applies - which is the point, because a Replace
   import must not be able to leave the journal short of a built-in.
   Ticket 07 moves the same shape onto SQLite rows, and adds presets and
   milestone templates, which are not stored rows yet. */

function builtInDimension(key: string, min: number, max: number): GenderDimension {
  return { key, name: '', low: '', high: '', min, max, builtIn: true, hidden: false };
}

export function withBuiltInDimensions(existing: GenderDimension[]): GenderDimension[] {
  const present = new Set(existing.map((d) => d.key));
  const missing = BUILT_IN_DIMENSIONS.filter((d) => !present.has(d.key)).map((d) =>
    builtInDimension(d.key, d.min, d.max)
  );
  return [...existing, ...missing];
}

function builtInTag(id: string): Tag {
  return { id, label: '', builtIn: true, hidden: false };
}

export function withBuiltInTagGroups(existing: TagGroup[]): TagGroup[] {
  const byKey = new Map(existing.map((g) => [g.key, g]));

  const reconciled = BUILT_IN_TAG_GROUPS.map((builtIn) => {
    const group = byKey.get(builtIn.key);
    if (!group) {
      return {
        key: builtIn.key,
        name: '',
        enabled: true,
        builtIn: true,
        tags: builtIn.tags.map(builtInTag)
      };
    }
    const present = new Set(group.tags.map((t) => t.id));
    return { ...group, tags: [...group.tags, ...builtIn.tags.filter((id) => !present.has(id)).map(builtInTag)] };
  });

  const builtInKeys = new Set<string>(BUILT_IN_TAG_GROUPS.map((g) => g.key));
  return [...reconciled, ...existing.filter((g) => !builtInKeys.has(g.key))];
}
