/* What the More hub's rows and groups are called, and how a row's second line
   reads (phase 8 UX ticket 02).

   Here rather than in `hubRows.ts` for the reason `areaLabels.ts` gives next
   door: the wording speaks paraglide and nothing the Node tier touches may
   import that (ADR-0016). `hubRows.ts` holds the rows, what sits behind them
   and which of them read; this is where they get their words.

   Three `Record`s, each total over the keys it is about: every row's title,
   every group's heading, and a written line for exactly the rows that carry
   one. So a row added without a title, or declared as stating what is behind
   it and then given nothing to state, is a typecheck failure rather than a
   blank line on the app's largest navigation surface.

   The line copy is three shapes and no more, which is what keeps this
   translatable: a Polish noun dropped into a frame needs a case the English
   never asks for (docs/ui-copy.md), so none of these interpolates one. The
   row's title is directly above the line and supplies the noun already -
   "Body measurements" over "Last logged 3 days ago" says what was logged
   without the line repeating it. */

import { m } from '$lib/paraglide/messages';
import { fmtDay, fmtDuration } from '$lib/data/dates';
import { calendarDuration } from '$lib/data/epochDay';
import type { HubGroupKey, HubLine, HubRowKey, WrittenRowKey } from '$lib/data/hubRows';

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
  'appointment-prep': m.appointment_prep_title,
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
  voice: m.recordings_label
};

/** What the thirteen written rows say, keyed by exactly those rows: a row
    declared `written` in `hubRows.ts` and left out here does not compile, and
    a row that reports a reading cannot be given a line to contradict it.

    Each of these is earned by a title that does not say what the screen is
    (DIRECTION.md 3b). "Eras", "Words", "Modes", "Care" and "Safe space" name
    something the app invented; a person who has not opened them cannot tell
    from the word alone. */
const ROW_LINE: Record<WrittenRowKey, () => string> = {
  care: m.hub_sub_care,
  'appointment-prep': m.hub_sub_appointment_prep,
  'clinician-summary': m.hub_sub_clinician_summary,
  roadmap: m.hub_sub_roadmap,
  letters: m.hub_sub_letters,
  presentations: m.hub_sub_presentations,
  eras: m.hub_sub_eras,
  words: m.hub_sub_words,
  doubt: m.hub_sub_doubt,
  'entry-templates': m.hub_sub_entry_templates,
  resources: m.hub_sub_resources,
  photos: m.hub_sub_photos,
  voice: m.hub_sub_voice
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

/** The row's second line, or `null` where the row has nothing to say yet.

    Four shapes. A reading of when something was last written, in the
    `{gap} ago` form the injection-site map and the hair-removal screen
    already use; the same reading once a whole quiet window has passed, worded
    as an observation rather than as a prompt, since somebody who had a hard
    spring is not being asked about it here; the day an area ended, in the
    words its own screen used to say it (`area_finish_done_title`), so the two
    surfaces agree; and a written line for a row that reports nothing.

    Null for a row whose areas have never been written to. A fresh journal
    gets titles alone rather than thirteen rows each saying "nothing yet",
    which is the hub filling in as somebody uses the app rather than starting
    full of blanks. */
export function hubRowLine(key: HubRowKey, line: HubLine, todayEpochDay: number): string | null {
  switch (line.kind) {
    case 'silent':
      return null;
    case 'written': {
      /* The cast is `rowLine`'s own invariant restated: it answers `written`
         for exactly the rows declared `written`, which is `WrittenRowKey`.
         Guarded anyway rather than called blind, so a row list and a label
         record that ever disagree lose a line instead of throwing on the
         app's largest navigation surface. */
      const written = ROW_LINE[key as WrittenRowKey];
      return written ? written() : null;
    }
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
  }
}
