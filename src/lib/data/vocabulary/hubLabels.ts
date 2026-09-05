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
   reading replaces it wherever the row has one. Thirteen rows never get a
   reading at all; the other thirteen show their line until something is
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
import type { HubGroupKey, HubLine, HubRowKey } from '$lib/data/hubRows';

const ROW_TITLE: Record<HubRowKey, () => string> = {
  measurements: m.body_measurements,
  sizes: m.size_log,
  'hair-progress': m.hair_progress,
  'hair-removal': m.hair_removal,
  care: m.care_title,
  'cycle-events': m.cycle_events,
  'side-effects': m.side_effects,
  surgery: m.surgery_journey_title,
  dilation: m.dilation,
  appointments: m.appointments_title,
  'clinician-summary': m.clinician_summary_row,
  milestones: m.milestones,
  roadmap: m.roadmap_title,
  letters: m.letters_title,
  tryouts: m.tryout_title,
  presentations: m.presentations_title,
  eras: m.eras_title,
  words: m.words_title,
  doubt: m.safe_space_title,
  'voice-benchmark': m.vb_title,
  'entry-templates': m.entry_templates_title,
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
    (DIRECTION.md 3b) - "Eras", "Words", "Modes", "Care", "Safe space" name
    something the app invented - and, on the reading rows, by a fresh journal
    otherwise leaving thirteen rows mute. Each is a short form of that
    screen's own intro rather than new copy, so the row and the screen behind
    it say the same thing (ADR-0024). */
const ROW_LINE: Record<HubRowKey, () => string> = {
  measurements: m.hub_sub_measurements,
  sizes: m.hub_sub_sizes,
  'hair-progress': m.hub_sub_hair_progress,
  'hair-removal': m.hub_sub_hair_removal,
  care: m.hub_sub_care,
  'cycle-events': m.hub_sub_cycle_events,
  'side-effects': m.hub_sub_side_effects,
  surgery: m.hub_sub_surgery,
  dilation: m.hub_sub_dilation,
  appointments: m.hub_sub_appointments,
  'clinician-summary': m.hub_sub_clinician_summary,
  milestones: m.hub_sub_milestones,
  roadmap: m.hub_sub_roadmap,
  letters: m.hub_sub_letters,
  tryouts: m.hub_sub_tryouts,
  presentations: m.hub_sub_presentations,
  eras: m.hub_sub_eras,
  words: m.hub_sub_words,
  doubt: m.hub_sub_doubt,
  'voice-benchmark': m.hub_sub_voice_benchmark,
  'entry-templates': m.hub_sub_entry_templates,
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
  practice: m.hub_group_practice,
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

/** The row's second line. Never null: every row says something.

    Four shapes. The line about what is behind the row, which is what a row
    with no reading to give shows - whether it will never have one or simply
    does not yet. A reading of when something was last written, in the
    `{gap} ago` form the injection-site map and the hair-removal screen
    already use. The same reading once a whole quiet window has passed, worded
    as an observation rather than as a prompt, since somebody who had a hard
    spring is not being asked about it here. And the day an area ended, in the
    words its own screen uses to say it (`area_finish_done_title`), so the two
    surfaces agree. */
export function hubRowLine(key: HubRowKey, line: HubLine, todayEpochDay: number): string {
  switch (line.kind) {
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
