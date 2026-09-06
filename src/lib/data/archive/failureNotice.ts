/* Whether a scheduled backup that failed says so on the phone (phase 6
   ticket 04). The notice has fired since phase 4 with no settings home at
   all; it has one now, `exportFailureNoticeEnabled`, and with it the two
   cross-class rules the registry applies to every producer.

   Quiet hours are the awkward one here, and this module exists for that.
   Reminders shift their own alarm out of the window and the two
   retrospective checks re-run every fifteen minutes, so both hold a
   notification without needing to remember anything. A backup failure is a
   single moment on a weekly schedule: skipping it would be a drop, not a
   hold. So a failure inside the window sets `heldExportFailureNotice`, and
   the auto-export scheduler's next check outside the window posts it.

   One function for both halves - the failure moment and the flush on a later
   tick - because they are the same decision with `failedNow` and `held`
   swapped, and two functions would be two places for the "off means off"
   rule to disagree. */

import { mayFireAt, type QuietHours } from '../../unprompted/quietHours';

interface FailureNoticeStep {
  /** Post the notice now. */
  post: boolean;
  /** What `heldExportFailureNotice` should be after this step. */
  held: boolean;
}

export function exportFailureNoticeStep(input: {
  /** A scheduled backup just failed. */
  failedNow: boolean;
  /** A previous failure is still waiting for the window to end. */
  held: boolean;
  /** `exportFailureNoticeEnabled`. */
  enabled: boolean;
  quiet: QuietHours;
  at: Date;
}): FailureNoticeStep {
  /* Off is final rather than a snooze, and it drops what is already held
     too: a person who turns the notice off between the failure and the end
     of quiet hours has said they do not want it, and posting it anyway an
     hour later would be the switch failing to mean anything. */
  if (!input.enabled) return { post: false, held: false };

  if (!input.failedNow && !input.held) return { post: false, held: false };
  if (!mayFireAt(input.at, input.quiet)) return { post: false, held: true };
  return { post: true, held: false };
}
