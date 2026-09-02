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

function builtInEntryTemplate(
  key: string,
  tags: readonly string[],
  dims: Readonly<Record<string, number>>,
  hidden: boolean
): EntryTemplate {
  return {
    id: key,
    name: '',
    tags: [...tags],
    dims: { ...dims },
    noteScaffold: '',
    presentationId: null,
    builtIn: true,
    hidden
  };
}

export function withBuiltInEntryTemplates(existing: EntryTemplate[]): EntryTemplate[] {
  const present = new Set(existing.map((t) => t.id));
  const missing = ENTRY_TEMPLATES.filter((t) => !present.has(t.key)).map((t) =>
    // Most built-ins seed visible; the appointment debrief is the one
    // exception (builtins.ts's own comment says why) - read as a type
    // guard rather than widening every other entry with `hidden: false`
    // just to satisfy one that needs `true`.
    builtInEntryTemplate(t.key, t.tags, t.dims, 'hidden' in t ? t.hidden : false)
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

/** What the offer predicate below needs to know, read off the standalone
    checklist (checklists.ts) and the clock (phase 6 ticket 08). */
export interface DebriefOfferState {
  /** The standalone checklist's own appointment date, or null when none is
      set. */
  appointmentEpochDay: number | null;
  /** How many prep questions are on the list - an appointment with none
      produces no offer, the ticket's own line. */
  itemCount: number;
  todayEpochDay: number;
  /** `getDebriefDismissedEpochDay()` - only ever meaningful against the
      appointment it was recorded for, since `setAppointmentDate` clears it
      the moment the date changes (checklists.ts). */
  dismissedEpochDay: number | null;
  /** `getDebriefEntryId()` - non-null once the offer has been taken, the
      same reset-on-date-change guarantee as `dismissedEpochDay`. */
  debriefEntryId: number | null;
}

/** Whether Home should offer the debrief template right now: a date is on
    record, it has actually passed (not today - the appointment could still
    be later today), there was something to prepare for, and this specific
    occurrence has not already been resolved one way or the other. Once,
    whether taken or dismissed (What to Build #1): the offer never
    reappears for the same appointment, and a new appointment date is what
    re-arms it, not a fresh dismissal window. */
export function debriefOfferVisible(state: DebriefOfferState): boolean {
  if (state.appointmentEpochDay == null) return false;
  if (state.itemCount === 0) return false;
  if (state.appointmentEpochDay >= state.todayEpochDay) return false;
  if (state.dismissedEpochDay === state.appointmentEpochDay) return false;
  if (state.debriefEntryId !== null) return false;
  return true;
}
