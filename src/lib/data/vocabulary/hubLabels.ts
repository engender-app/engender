/* Localize hub titles, group headings and row descriptions here.
   hubRows.ts stays independent of Paraglide for Node tests (ADR-0016).
   Exhaustive Records require wording for every row and group.

   A reading replaces a row's description once there is data. Ten rows
   always use their description. The three reading templates interpolate
   no noun because Polish case would depend on the frame. The interpolated
   duration stays nominative in both languages, and the title supplies
   the noun. */

import { m } from '$lib/paraglide/messages';
import { fmtDay, fmtDuration } from '$lib/data/dates';
import { calendarDuration } from '$lib/data/epochDay';
import { hoursMinutesOf } from '$lib/data/journal/wearSessions';
import { wearRunningCardTitle } from '$lib/data/vocabulary/wearLabels';
import type { HubGroupKey, HubLine, HubRowKey } from '$lib/data/hubRows';
import type { NextWhat, RunningWhat } from '$lib/data/rowForward';

const ROW_TITLE: Record<HubRowKey, () => string> = {
  'hair-removal': m.hair_removal,
  care: m.care_title,
  'cycle-events': m.cycle_events,
  surgery: m.surgery_journey_title,
  dilation: m.dilation,
  appointments: m.appointments_title,
  milestones: m.milestones,
  'progress-photos': m.pph_title,
  roadmap: m.roadmap_title,
  letters: m.letters_title,
  tryouts: m.tryout_title,
  doubt: m.safe_space_title,
  /* `vb_screen_title` ("Voice") rather than `vb_title` ("Voice benchmark"): folded the
     memos row's screen into this one as a fourth tab, so the row and the screen it opens
     say the same name now. `vb_title` stays what it was for the two callers still
     specifically about the benchmark - the search hit and the area label. */
  'voice-benchmark': m.vb_screen_title,
  wear: m.wear_log,
  effects: m.effects_timeline,
  resources: m.resources_title,
  photos: m.photos_label,
  recordings: m.vb_tab_recordings,
  documents: m.documents_title
};

/** What every row says about what is behind it: the whole of a row that never
    reads, and the standing line of one that does until it has a reading.

    Total over the row keys, so a row added here without one does not compile.
    A row whose title already says what is behind it holds null and draws no
    line.
    Each is earned by a title that does not say what the screen is
    on its own. "Eras", "Care" and "Safe space" name
    something the app invented - and, on the reading rows, by a fresh journal
    otherwise leaving thirteen rows mute. Each is a short form of that
    screen's own intro rather than new copy, so the row and the screen behind
    it say the same thing (ADR-0024). */
const ROW_LINE: Record<HubRowKey, (() => string) | null> = {
  'hair-removal': m.hub_sub_hair_removal,
  care: m.hub_sub_care,
  'cycle-events': m.hub_sub_cycle_events,
  surgery: m.hub_sub_surgery,
  dilation: m.hub_sub_dilation,
  appointments: m.hub_sub_appointments,
  milestones: m.hub_sub_milestones,
  'progress-photos': m.hub_sub_progress_photos,
  roadmap: m.hub_sub_roadmap,
  letters: m.hub_sub_letters,
  tryouts: m.hub_sub_tryouts,
  doubt: m.hub_sub_doubt,
  'voice-benchmark': m.hub_sub_voice_benchmark,
  wear: m.hub_sub_wear,
  effects: m.hub_sub_effects,
  resources: null,
  photos: m.hub_sub_photos,
  recordings: m.hub_sub_recordings,
  documents: m.hub_sub_documents
};

const GROUP_HEADING: Record<HubGroupKey | 'finished', () => string> = {
  health: m.hub_group_health,
  body: m.hub_group_body,
  transition: m.hub_group_transition,
  support: m.hub_group_support,
  media: m.hub_group_media,
  finished: m.hub_group_finished
};

/** What a row is called. */
export function hubRowTitle(key: HubRowKey): string {
  return ROW_TITLE[key]();
}

export function hubRowDescription(key: HubRowKey): string {
  return ROW_LINE[key]?.() ?? '';
}

/** What a group's heading says. */
export function hubGroupHeading(key: HubGroupKey | 'finished'): string {
  return GROUP_HEADING[key]();
}

/** How long until a dated day, in the hub's own grammar.

    `fmtDuration` rather than a bare day count, which is the grammar the two backwards lines
    on this same row already use ("Last logged 1 year 4 months ago"). A forward line in a
    different unit beside them would read as a different kind of measurement, and it
    degrades better: a letter sealed for three years says "1 year 4 months", not "487 days".

    Exported because a gap is no longer only a row's to state: ADR-0067's amendment lets an
    area's own screen say one too, and the visit screen saying "in 12 days" under a hub row
    saying "Endocrinologist in 12 days" has to be the same arithmetic in the same words. One
    function rather than two that agree today. */
export function gapTo(epochDay: number, todayEpochDay: number): string {
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
        ? m.care_next_dose({ when: fullDay(epochDay) })
        : m.hub_line_care_dose_and_stock({ when: fullDay(epochDay), date: fullDay(what.runOutEpochDay) });
    case 'runOut':
      return m.hub_line_run_out({ date: fullDay(epochDay) });
  }
}

/**
 * Every hub row gets a second line. Running, next and value facts from
 * rowForward.ts take priority. Otherwise show the default description,
 * time since the last write, an observation after the quiet window, or
 * the area's finish date. Use area_finish_done_title for the last case
 * so the row and its screen agree.
 */
export function hubRowLine(key: HubRowKey, line: HubLine, todayEpochDay: number, nowMs: number): string {
  switch (line.kind) {
    case 'running':
      return runningLine(line.what, nowMs);
    case 'next':
      return nextLine(line.what, line.epochDay, todayEpochDay);
    case 'no-stream':
    case 'not-yet':
      return hubRowDescription(key);
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
