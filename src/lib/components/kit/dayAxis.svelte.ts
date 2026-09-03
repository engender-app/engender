/* Which axis a day chart is being read on, as reactive state (phase 8
   features ticket 16, code review's Duplicated Code finding).

   The rule for what is on offer and what each axis keys by is pure and
   lives in $lib/charts/dayAxis.ts; the words are in dayAxisLabel.ts beside
   the components. This is the third piece: the queries, the selection and
   the fallback effect, which both screens that offer a re-keyed axis had
   copied verbatim - two reads, two derivations, a reset effect and a
   keying, about twenty-five lines each, comments included.

   The reactive half only, deliberately thin, the same split
   photoSection.svelte.ts makes from photoSection.ts: `$state` and
   `liveList` only work here, so nothing that could be a plain function is.

   Both reads are unbounded on purpose. What decides whether an axis is on
   offer is "has this journal ever completed an injection interval" and "is
   there a procedure with a date", and neither is a question about whatever
   range the screen happens to be showing. */

import { liveList } from '$lib/data/live/journal.svelte';
import { completedInjectionIntervals } from '$lib/data/intervalMoodPattern';
import { FIRST_EPOCH_DAY } from '$lib/data/epochDay';
import { CALENDAR_AXIS, availableAxes, keyingFor, type DayAxis } from '$lib/charts/dayAxis';
import type { Keying } from '$lib/data/dayKeying';
import type { AnchorOption } from './dayAxisLabel';

export interface DayAxisState {
  /** The axis in force. Assignable, so a picker's `onPick` writes it. */
  axis: DayAxis;
  /** Every axis this journal can answer, calendar first. One entry means
      the calendar alone, which is the screen's cue to draw no picker. */
  readonly axes: DayAxis[];
  /** The dated procedures an anchored axis can key to, in the order the
      options are offered, for the labels. */
  readonly anchors: AnchorOption[];
  /** What `axis` keys by, or `null` on the calendar axis - which is also
      the screen's cue that its range picker still applies. */
  readonly keying: Keying | null;
}

/** `today` arrives as a function rather than a number because the screens
    re-derive it rather than capturing it: the journal never reads the clock
    for a domain answer, so a screen left open across midnight has to see
    the new day. */
export function dayAxisState(today: () => number): DayAxisState {
  let axis = $state<DayAxis>(CALENDAR_AXIS);

  const dosesQuery = liveList((j) => j.doses.getDoses(FIRST_EPOCH_DAY, today()));
  const proceduresQuery = liveList((j) => j.procedures.getProcedures());

  const intervals = $derived(completedInjectionIntervals(dosesQuery.rows));
  const anchors = $derived(
    proceduresQuery.rows
      .filter((procedure) => procedure.surgeryEpochDay !== null)
      .map((procedure) => ({
        id: procedure.id,
        name: procedure.name,
        surgeryEpochDay: procedure.surgeryEpochDay as number
      }))
  );
  const axes = $derived(availableAxes(intervals, anchors));

  /* A procedure deleted or a dose log emptied mid-session takes its axis
     with it. Back to the calendar rather than to an axis nothing can any
     longer select or clear - the same fallback the body map's mode filter
     makes when a presentation is hidden underneath it. */
  $effect(() => {
    if (!axes.includes(axis)) axis = CALENDAR_AXIS;
  });

  const keying = $derived(keyingFor(axis, intervals, anchors, today()));

  return {
    get axis() {
      return axis;
    },
    set axis(next: DayAxis) {
      axis = next;
    },
    get axes() {
      return axes;
    },
    get anchors() {
      return anchors;
    },
    get keying() {
      return keying;
    }
  };
}
