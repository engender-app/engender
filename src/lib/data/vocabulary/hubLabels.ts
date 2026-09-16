/* What the More hub's rows and groups are called, and how a row's second line
   reads (phase 8 UX ticket 02).

   Here rather than in `hubRows.ts` for the reason `areaLabels.ts` gives next
   door: the wording speaks paraglide and nothing the Node tier touches may
   import that (ADR-0016). `hubRows.ts` holds the rows, what sits behind them
   and which of them read; this is where they get their words.

   Three `Record`s, each total over every key it is about: a title per row, a
   heading per group, and a line per row saying what is behind it. So a row
   added without either is a typecheck failure rather than a blank line on the
   app's largest navigation surface.

   Every row has that line, which is the spec's user story 13 - "each row to
   tell me what is behind it, so that navigating is also reading" - and a
   reading replaces it wherever the row has one. Ten rows never get a
   reading at all; the other fifteen show their line until something is
   written in them.

   The reading copy is three frames and no more, which is what keeps it
   translatable: a Polish noun dropped into a frame needs a case the English
   never asks for (docs/ui-copy.md), so none of them interpolates one, and the
   duration that does travel through them stays nominative in both languages.
   The row's title is directly above and supplies the noun already - "Body
   measurements" over "Last logged 3 days ago" says what was logged without
   the line repeating it. */

import { m } from '$lib/paraglide/messages';
import { fmtDay, fmtDuration } from '$lib/data/dates';
import { calendarDuration } from '$lib/data/epochDay';
import { hoursMinutesOf } from '$lib/data/journal/wearSessions';
import { vocabulary } from '$lib/data/vocabulary/vocabulary';
import { wearRunningCardTitle } from '$lib/data/vocabulary/wearLabels';
import type { HubGroupKey, HubLine, HubRowKey } from '$lib/data/hubRows';
import type { NextWhat, RowValue, RunningWhat } from '$lib/data/rowForward';

const ROW_TITLE: Record<HubRowKey, () => string> = {
  measurements: m.measurements_and_sizes,
  'hair-progress': m.hair_progress,
  'hair-removal': m.hair_removal,
  care: m.care_title,
  'cycle-events': m.cycle_events,
  surgery: m.surgery_journey_title,
  dilation: m.dilation,
  appointments: m.appointments_title,
  milestones: m.milestones,
  roadmap: m.roadmap_title,
  letters: m.letters_title,
  tryouts: m.tryout_title,
  doubt: m.safe_space_title,
  'voice-benchmark': m.vb_title,
  wear: m.wear_log,
  effects: m.effects_timeline,
  resources: m.resources_title,
  photos: m.progress_photos,
  voice: m.recordings_label,
  documents: m.documents_title
};

/** What every row says about what is behind it: the whole of a row that never
    reads, and the standing line of one that does until it has a reading.

    Total over the row keys, so a row added here without one does not compile.
    Each is earned by a title that does not say what the screen is
    (DIRECTION.md 3b) - "Eras", "Care", "Safe space" name
    something the app invented - and, on the reading rows, by a fresh journal
    otherwise leaving thirteen rows mute. Each is a short form of that
    screen's own intro rather than new copy, so the row and the screen behind
    it say the same thing (ADR-0024). */
const ROW_LINE: Record<HubRowKey, () => string> = {
  measurements: m.hub_sub_measurements,
  'hair-progress': m.hub_sub_hair_progress,
  'hair-removal': m.hub_sub_hair_removal,
  care: m.hub_sub_care,
  'cycle-events': m.hub_sub_cycle_events,
  surgery: m.hub_sub_surgery,
  dilation: m.hub_sub_dilation,
  appointments: m.hub_sub_appointments,
  milestones: m.hub_sub_milestones,
  roadmap: m.hub_sub_roadmap,
  letters: m.hub_sub_letters,
  tryouts: m.hub_sub_tryouts,
  doubt: m.hub_sub_doubt,
  'voice-benchmark': m.hub_sub_voice_benchmark,
  wear: m.hub_sub_wear,
  effects: m.hub_sub_effects,
  resources: m.hub_sub_resources,
  photos: m.hub_sub_photos,
  voice: m.hub_sub_voice,
  documents: m.hub_sub_documents
};

const GROUP_HEADING: Record<HubGroupKey | 'finished', () => string> = {
  body: m.hub_group_body,
  health: m.hub_group_health,
  transition: m.hub_group_transition,
  support: m.hub_group_support,
  media: m.hub_group_media,
  finished: m.hub_group_finished
};

/** What a row is called. */
export function hubRowTitle(key: HubRowKey): string {
  return ROW_TITLE[key]();
}

/** What a group's heading says. */
export function hubGroupHeading(key: HubGroupKey | 'finished'): string {
  return GROUP_HEADING[key]();
}

/** How long until a dated day, in the hub's own grammar.

    `fmtDuration` rather than a bare day count, which is the grammar the two
    backwards lines on this same row already use ("Last logged 1 year 4
    months ago"). A forward line in a different unit beside them would read
    as a different kind of measurement, and it degrades better: a letter
    sealed for three years says "1 year 4 months", not "487 days". */
function gapTo(epochDay: number, todayEpochDay: number): string {
  return fmtDuration(calendarDuration(todayEpochDay, epochDay));
}

/** A date in full, which is what both of the Care row's days are.

    Never a countdown: a run-out day is a projection off a rate, and putting
    a number of days on it would state a confidence the arithmetic does not
    have (`stockProjection.ts`). The care screen behind the row dates its own
    marks the same way. */
function fullDay(epochDay: number): string {
  return fmtDay(epochDay, { day: 'numeric', month: 'long' });
}

/** What is running now.

    The wear line counts up from the session's start the way the tile on
    Today does, which is the whole reason `nowMs` travels this far: the
    duration is a reading of the clock, not of the day. The two surfaces
    take their `nowMs` from the same ticking value, so a pinned wear row and
    the wear tile above it never disagree by a minute. */
function runningLine(what: RunningWhat, nowMs: number): string {
  switch (what.area) {
    case 'wear': {
      const elapsed = hoursMinutesOf(nowMs - what.startTimestamp);
      return m.hub_line_running_wear({
        what: wearRunningCardTitle(what.wearKind),
        duration: m.wear_session_duration_hm({ hours: String(elapsed.hours), minutes: String(elapsed.minutes) })
      });
    }
    case 'tryout':
      return m.hub_line_running_tryout({ label: what.label, day: String(what.dayCount) });
    case 'postOp':
      /* Sentence case and its own key rather than `surgery_post_op_day`,
         which is the badge on the surgery screen and title-cased for it.
         The Polish is the same sentence in both places. */
      return m.hub_line_post_op({ days: String(what.days) });
  }
}

/** What is next.

    Every branch has a `today` twin, because "in 0 days" is not what somebody
    means by a hearing this morning - the same split `milestoneStatus.ts`
    gives `today` its own case for. */
function nextLine(what: NextWhat, epochDay: number, todayEpochDay: number): string {
  const today = epochDay === todayEpochDay;
  const gap = gapTo(epochDay, todayEpochDay);

  switch (what.area) {
    case 'milestone':
      return today ? m.hub_line_next_milestone_today({ name: what.name }) : m.hub_line_next_milestone({ name: what.name, gap });
    case 'letter':
      if (what.several) return today ? m.hub_line_next_letter_today_several() : m.hub_line_next_letter_several({ gap });
      return today ? m.hub_line_next_letter_today() : m.hub_line_next_letter({ gap });
    case 'appointment': {
      /* The kind is the person's own word for it, so it is interpolated
         rather than looked up; an appointment they never named falls back
         to the generic line rather than to an empty slot in the middle of a
         sentence. */
      const kind = what.appointmentKind?.trim();
      if (!kind) return today ? m.hub_line_next_visit_today() : m.hub_line_next_visit({ gap });
      return today ? m.hub_line_next_appointment_today({ kind }) : m.hub_line_next_appointment({ kind, gap });
    }
    case 'consult':
      return today ? m.hub_line_next_consult_today() : m.hub_line_next_consult({ gap });
    case 'surgery':
      return today ? m.hub_line_next_surgery_today() : m.hub_line_next_surgery({ gap });
    case 'dose':
      return what.runOutEpochDay === null
        ? m.care_other_next_dose({ when: fullDay(epochDay) })
        : m.hub_line_care_dose_and_stock({ when: fullDay(epochDay), date: fullDay(what.runOutEpochDay) });
    case 'runOut':
      return m.hub_line_run_out({ date: fullDay(epochDay) });
  }
}

/** The last value, and how long ago it was taken.

    The type's name comes off the vocabulary mirror rather than the label
    table, so a measurement type somebody made themselves reads as the name
    they gave it rather than as its uuid - the same join `dayRows.ts` makes
    for the same three fields. */
function valueLine(line: RowValue, todayEpochDay: number): string {
  const what = `${vocabulary.measurementTypeName(line.type)} ${line.value} ${line.unit}`;
  return line.epochDay === todayEpochDay
    ? m.hub_line_value_today({ what })
    : m.hub_line_value({ what, gap: gapTo(line.epochDay, todayEpochDay) });
}

/** The row's second line. Never null: every row says something.

    Seven shapes. Three are phase 11 all-four-doors ticket 02's and come
    first on any row that has one - what is running, what is next, and the
    one row that states a value instead. Which of them a row carries is
    `rowForward.ts`'s decision and that it beats the four below is
    `rowLine`'s; the three helpers above only put them into words.

    Then the four this file started with. The line about what is behind the row, which is what a row
    with no reading to give shows - whether it will never have one or simply
    does not yet. A reading of when something was last written, in the
    `{gap} ago` form the injection-site map and the hair-removal screen
    already use. The same reading once a whole quiet window has passed, worded
    as an observation rather than as a prompt, since somebody who had a hard
    spring is not being asked about it here. And the day an area ended, in the
    words its own screen uses to say it (`area_finish_done_title`), so the two
    surfaces agree. */
export function hubRowLine(key: HubRowKey, line: HubLine, todayEpochDay: number, nowMs: number): string {
  switch (line.kind) {
    case 'running':
      return runningLine(line.what, nowMs);
    case 'next':
      return nextLine(line.what, line.epochDay, todayEpochDay);
    case 'value':
      return valueLine(line, todayEpochDay);
    case 'no-stream':
    case 'not-yet':
      return ROW_LINE[key]();
    case 'last':
      return line.daysAgo === 0
        ? m.hub_line_today()
        : m.hub_line_last({ gap: fmtDuration(calendarDuration(line.epochDay, todayEpochDay)) });
    case 'quiet':
      return m.hub_line_quiet({ gap: fmtDuration(calendarDuration(line.epochDay, todayEpochDay)) });
    case 'finished':
      return m.area_finish_done_title({
        date: fmtDay(line.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })
      });
    case 'suspended':
      return m.area_suspend_done_title({
        date: fmtDay(line.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })
      });
  }
}
