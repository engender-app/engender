/* The debrief offer's descriptive list (phase 8 features ticket 19, What to
   Build #2): labs and side effects since the last appointment, merged into
   one chronological list of plain facts - no severity word, no post-dose
   timing context, nothing beyond what the range's own two reads already
   produce (readLabResultsInRange in clinicianSummary.ts, sideEffects.ts's
   own getSideEffectsInRange - the same pair the appointment prep screen
   already reads for its "since last time" cards). A descriptive list, not
   an interpretation (ticket 19, Out of Scope), so a severity stays the raw
   number out of 5 rather than a word like "moderate".

   Node-tier safe: no paraglide (ADR-0016). The date on each line and the
   line-joining happen in EntryEditor.svelte, which is where the wording
   and the locale-aware formatting already live for everything else this
   module's caller writes into a note. */

import type { LabResult, SideEffect } from '../types';

export interface DebriefListItem {
  epochDay: number;
  text: string;
}

/** Merges and sorts, earliest first. `Array.prototype.sort` is a stable
    sort, so two items on the same day keep the order they arrived in -
    labs before side effects here, since that is the order the two reads
    are passed in. */
export function debriefListItems(labs: LabResult[], sideEffects: SideEffect[]): DebriefListItem[] {
  const items: DebriefListItem[] = [
    ...labs.map((lab) => ({ epochDay: lab.epochDay, text: `${lab.analyte} ${lab.value} ${lab.unit}`.trim() })),
    ...sideEffects.map((effect) => ({ epochDay: effect.epochDay, text: `${effect.name} (${effect.severity}/5)` }))
  ];
  return items.sort((a, b) => a.epochDay - b.epochDay);
}
