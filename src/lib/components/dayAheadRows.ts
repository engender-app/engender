/* What a `dayAhead` mark looks like as a row on `/day/[day]` (phase 8
   features ticket 62, ADR-0067).

   A mark is a day and a kind and nothing else - dayAhead.ts's own header
   says why: never which appointment, which milestone or which letter. So
   every row below states the kind alone and links to the screen that would
   say more, the same "icon of the screen it goes to" rule dayRows.ts holds
   itself to.

   A full `Record` over `DayAheadMarkKind`, the same reason `SECTION_ROWS` in
   dayRows.ts is one: a sixth kind added to the ADR's list is a compile error
   here until it gets a row, rather than a mark that silently draws
   nothing. */
import { m } from '$lib/paraglide/messages';
import type { DayAheadMark, DayAheadMarkKind } from '$lib/data/journal/dayAhead';
import type { DayRow } from './dayRows';

const MARK_ROWS: Record<DayAheadMarkKind, () => Pick<DayRow, 'icon' | 'title' | 'href'>> = {
  appointment: () => ({ icon: 'calendar', title: m.appointments_untitled(), href: '/health/appointments' }),
  surgery: () => ({ icon: 'flag', title: m.surgery_date_label(), href: '/health/surgery' }),
  // `sparkle` rather than the `flag` surgery takes: the two can share a day,
  // and hubRows.ts already resolved this exact pair apart for the same
  // reason - a duplicate icon reads as one row drawn twice.
  milestone: () => ({ icon: 'sparkle', title: m.ms_default_name(), href: '/transition/milestones' }),
  letterUnlock: () => ({ icon: 'book', title: m.day_ahead_letter_unlock(), href: '/transition/letters' }),
  doseSlot: () => ({ icon: 'clock', title: m.dose_amount_label(), href: '/doses' })
};

/** Every mark as a row, in the order `dayAhead` returned them - already
    earliest-day-first and, within a day, insertion order (dayAhead.ts's own
    `assembleDayAhead`). One row per mark: a single-day read never returns
    the same kind twice (dayAhead.ts's `distinctSorted` dedupes within a
    kind), so `kind` alone is a stable key. */
export function dayAheadRows(marks: readonly DayAheadMark[]): DayRow[] {
  return marks.map((mark) => ({ key: `coming-${mark.kind}`, ...MARK_ROWS[mark.kind]() }));
}
