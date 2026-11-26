/* A new entry's steps.

   A new entry walks these steps in this order, each with one purpose, so
   each can be answered at a glance without scrolling: the quick answer
   (mood and the scales), what marked the day (mode and tags), the body and
   the cards the day offers, and last what is written and attached. Marking
   comes before writing (Alicja, 2026-11-10). Two steps became four on
   2026-11-25, when every step was asked to fit the screen.

   A step with nothing to show is not drawn: no modes and no tags means no
   marks step, no body regions and no cards means no body step. The first
   and the last always have something. The step a person is standing on
   stays in the walk even if what it held goes away under them, so the walk
   never jumps from under the person.

   Rune-free, so it is tested under the Node tier; the words are the
   component's. */

import type { EntrySection } from './entrySections';

export const ENTRY_STEPS = ['today', 'marks', 'body', 'writing'] as const;
export type EntryStep = (typeof ENTRY_STEPS)[number];

/** Whether the two steps that can be empty have anything to show. */
export type StepContent = { marks: boolean; body: boolean };

const SECTION_STEP: Record<EntrySection, EntryStep> = {
  tags: 'marks',
  body: 'body',
  photos: 'writing',
  video: 'writing',
  voice: 'writing'
};

/** The folded sections a step holds, in the order they are drawn. */
const STEP_SECTIONS: Record<EntryStep, readonly EntrySection[]> = {
  today: [],
  marks: ['tags'],
  body: ['body'],
  writing: ['photos', 'video', 'voice']
};

export function stepsShown(content: StepContent, current?: EntryStep): EntryStep[] {
  return ENTRY_STEPS.filter(
    (step) => step === current || (step === 'marks' ? content.marks : step === 'body' ? content.body : true)
  );
}

export function nextStep(shown: readonly EntryStep[], from: EntryStep): EntryStep | null {
  const at = shown.indexOf(from);
  return at >= 0 && at < shown.length - 1 ? shown[at + 1] : null;
}

export function previousStep(shown: readonly EntryStep[], from: EntryStep): EntryStep | null {
  const at = shown.indexOf(from);
  return at > 0 ? shown[at - 1] : null;
}

export function stepOfSection(section: EntrySection): EntryStep {
  return SECTION_STEP[section];
}

export function sectionsOn(step: EntryStep): readonly EntrySection[] {
  return STEP_SECTIONS[step];
}

/** Where a new entry opens: the first step, or for an address that names a
    section (`?open=photos`), that section's step - or the next one shown
    when it is not, which is never past the last. */
export function arrivalStep(open: EntrySection | undefined, shown: readonly EntryStep[]): EntryStep {
  if (!open) return shown[0];
  const wanted = ENTRY_STEPS.indexOf(stepOfSection(open));
  return shown.find((step) => ENTRY_STEPS.indexOf(step) >= wanted) ?? shown[shown.length - 1];
}
