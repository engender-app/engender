/* Entry templates as data (phase 6 ticket 07, ADR-0002): the reconcile-by-
   key rule and the pure template-to-draft merge, kept in their own module
   because ticket 08's debrief offer reads from the same seam.

   `withBuiltInEntryTemplates` mirrors `withBuiltInDimensions` (builtins.ts):
   pure, reconciling rather than seed-if-empty, safe to run on every boot and
   again before an import applies. It is not called by the SQL reconcile
   path (reconcile.ts hand-writes its own insert loop against the driver,
   the same relationship gender_dimension's reconcile already has with
   `withBuiltInDimensions`) - it exists as the seam this rule is proven
   against before the SQL is trusted to match it. */

import { ENTRY_TEMPLATES } from './builtins';
import type { EntryTemplate } from '../types';

function builtInEntryTemplate(key: string, tags: readonly string[], dims: Readonly<Record<string, number>>): EntryTemplate {
  return {
    id: key,
    name: '',
    tags: [...tags],
    dims: { ...dims },
    noteScaffold: '',
    presentationId: null,
    builtIn: true,
    hidden: false
  };
}

export function withBuiltInEntryTemplates(existing: EntryTemplate[]): EntryTemplate[] {
  const present = new Set(existing.map((t) => t.id));
  const missing = ENTRY_TEMPLATES.filter((t) => !present.has(t.key)).map((t) =>
    builtInEntryTemplate(t.key, t.tags, t.dims)
  );
  return [...existing, ...missing];
}

/** The entry draft's own shape, narrowed to what a template can seed - kept
    local rather than importing `EntryDraft` so this stays free of every
    other field the real draft carries (photos, mood, and so on). */
export interface TemplateableDraft {
  tags: string[];
  dims: Record<string, number>;
  note: string;
  presentationId: string | null;
}

/** Merges a template's pre-fill into a draft (ticket 17, extended by ticket
    07 for the note scaffold and presentation): tags join the selection
    already there rather than replacing it, so applying the same template
    twice cannot flip a tag back off; dims overwrite by key, the way
    `setDim` does. A note scaffold only ever fills an empty note - the entry
    stays free-write, so it never overwrites what the person has already
    typed, which is what let the folded-in guided prompts keep the one rule
    they always had. A template's presentation, when it has one, replaces
    the draft's; one with none leaves the draft's presentation alone rather
    than clearing it, so applying a plain template after picking a mode does
    not silently drop it. */
export function applyEntryTemplateToDraft(draft: TemplateableDraft, template: EntryTemplate): TemplateableDraft {
  const tags = [...draft.tags];
  for (const tag of template.tags) {
    if (!tags.includes(tag)) tags.push(tag);
  }
  return {
    tags,
    dims: { ...draft.dims, ...template.dims },
    note: draft.note === '' && template.noteScaffold !== '' ? template.noteScaffold : draft.note,
    presentationId: template.presentationId ?? draft.presentationId
  };
}
