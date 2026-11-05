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
/* Relative rather than `$lib`, unlike the two imports around it: this one is
   a value and the Node tier that runs this module's test has no alias to
   resolve (the reason liveTiles.ts imports the way it does). */
import { DAY_AHEAD_ROUTES } from '../data/journal/dayAheadRoutes';
import type { DayRow } from './dayRows';

/* Only the icon and the words are decided here. Where a row goes is
   `dayAheadRoutes.ts`, so a mark's screen is named once and Today's agenda
   links to the same place this row does. */
const MARK_ROWS: Record<DayAheadMarkKind, () => Pick<DayRow, 'icon' | 'title'>> = {
  appointment: () => ({ icon: 'appointment', title: m.appointments_untitled() }),
  surgery: () => ({ icon: 'clipboard', title: m.surgery_date_label() }),
  // `summit`, the hub row's mark (pre-release-human 12). It drew `sparkle`,
  // and `flag` before that, which surgery shared: the two can fall on one
  // day, and a duplicate icon reads as one row drawn twice.
  milestone: () => ({ icon: 'summit', title: m.ms_default_name() }),
  letterUnlock: () => ({ icon: 'envelope', title: m.day_ahead_letter_unlock() }),
  doseSlot: () => ({ icon: 'pill', title: m.dose_amount_label() })
};

/** The icon and the words one kind of mark is drawn with, wherever it is
    drawn: a row on `/day/[day]` below, and a row of Today's agenda (phase
    10 redesign ticket 13), so the two surfaces cannot come to call the same
    fact two different things. */
export function dayAheadMarkLabel(kind: DayAheadMarkKind): Pick<DayRow, 'icon' | 'title'> {
  return MARK_ROWS[kind]();
}

/** Every mark as a row, in the order `dayAhead` returned them - already
    earliest-day-first and, within a day, insertion order (dayAhead.ts's own
    `assembleDayAhead`). One row per mark: a single-day read never returns
    the same kind twice (dayAhead.ts's `distinctSorted` dedupes within a
    kind), so `kind` alone is a stable key. */
export function dayAheadRows(marks: readonly DayAheadMark[]): DayRow[] {
  return marks.map((mark) => ({
    key: `coming-${mark.kind}`,
    ...dayAheadMarkLabel(mark.kind),
    href: DAY_AHEAD_ROUTES[mark.kind]
  }));
}
