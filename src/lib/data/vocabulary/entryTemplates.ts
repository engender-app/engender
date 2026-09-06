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

/** Most built-ins seed visible; the appointment debrief is the one
    exception (builtins.ts's own comment says why) - read as a type guard
    rather than widening every other `ENTRY_TEMPLATES` entry with
    `hidden: false` just to satisfy one that needs `true`. Shared by the
    pure rule below and reconcile.ts's SQL insert (ticket 25), so the two
    can't drift the way they did before this ticket. */
export function builtInTemplateHidden(t: (typeof ENTRY_TEMPLATES)[number]): boolean {
  return 'hidden' in t ? t.hidden : false;
}

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

/** What a built-in template shows once wording is joined in (ticket 25,
    "the editable-name question", answer 2): the person's own words once
    they have typed any, the resolved label only for what reconcile still
    left seeded blank. Kept here, pure, so the fallback direction is
    provable without vocabulary.ts's paraglide dependency in the loop; that
    module calls this after doing its own key-to-label lookup. Name and
    note scaffold take the same rule, since they are edited on the same
    sheet and it would be strange for one to stick and not the other. */
export function resolveBuiltInWording(
  stored: { name: string; noteScaffold: string },
  label: { name: string; noteScaffold: string }
): { name: string; noteScaffold: string } {
  return {
    name: stored.name !== '' ? stored.name : label.name,
    noteScaffold: stored.noteScaffold !== '' ? stored.noteScaffold : label.noteScaffold
  };
}

/* withBuiltInEntryTemplates stays exported only for its own test (AU-09
   test-only review). */
export function withBuiltInEntryTemplates(existing: EntryTemplate[]): EntryTemplate[] {
  const present = new Set(existing.map((t) => t.id));
  const missing = ENTRY_TEMPLATES.filter((t) => !present.has(t.key)).map((t) =>
    builtInEntryTemplate(t.key, t.tags, t.dims, builtInTemplateHidden(t))
  );
  return [...existing, ...missing];
}

/** The entry draft's own shape, narrowed to what a template can seed - kept
    local rather than importing `EntryDraft` so this stays free of every
    other field the real draft carries (photos, mood, and so on). */
interface TemplateableDraft {
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

/** What the offer predicate below needs to know (ticket 58, ADR-0066): the
    most recent past appointment (appointments.ts's
    `mostRecentPastAppointment`), the standing prep list's own state read
    off the standalone checklist (checklists.ts), scoped to that same
    appointment. */
/* DebriefOfferState stays exported only for its own test (AU-09 test-only
   review). */
export interface DebriefOfferState {
  /** The most recent past appointment's id, or null when there is none -
      "strictly past" is already baked in by the selector that produced
      this, so the predicate below has no clock of its own to consult. */
  appointmentId: string | null;
  /** How many prep questions are on the list - an appointment with none
      produces no offer, the ticket's own line. */
  itemCount: number;
  /** Whether the offer for `appointmentId` was dismissed
      (`getDebriefState`, checklists.ts) - already resolved against this
      exact id, so a dismissal recorded for a since-superseded appointment
      reads as not-dismissed here. */
  dismissed: boolean;
  /** The entry that debriefs `appointmentId`, or null - same id-scoped
      resolution as `dismissed`. */
  debriefEntryId: number | null;
}

/** Whether Home should offer the debrief template right now: there is a
    most recent past appointment, there was something to prepare for, and
    this specific appointment has not already been resolved one way or the
    other. Once, whether taken or dismissed (What to Build #1): the offer
    never reappears for the same appointment, and a newer past appointment
    is what re-arms it (ticket 58) - `appointmentId` moving on is itself
    the re-arm, there is no date to change or column to clear. */
export function debriefOfferVisible(state: DebriefOfferState): boolean {
  if (state.appointmentId == null) return false;
  if (state.itemCount === 0) return false;
  if (state.dismissed) return false;
  if (state.debriefEntryId !== null) return false;
  return true;
}
