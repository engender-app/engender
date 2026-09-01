/* Quiet hours: the one cross-class rule in the unprompted registry (phase 6
   ticket 04), not a field per producer. Before this, every one of the four
   schedulers picked its own time and nothing coordinated them, so there was
   no answer to "do not wake me" at all.

   A notification due inside the window is **held until the window ends,
   never dropped**, and each producer holds it in the way its own path
   allows:

   - reminders, the check-in and a wear session's elapsed prompt are native
     alarms, so the alarm itself is scheduled at the end of the window
     instead (QuietHours.java, which reimplements the arithmetic below for
     the same reason ReminderPlanner reimplements reminderRule.ts: the alarm
     is set before any WebView exists);
   - wrapped and on-this-day run off a fifteen-minute foreground check, so
     skipping one check is already a hold - the next one outside the window
     fires, because neither writes its dedup key until it actually notifies;
   - the auto-export failure notice happens once, outside any schedule, so it
     sets `heldExportFailureNotice` and the scheduler's next check outside
     the window posts it.

   Kept relative-import-free and rune-free so registry.test.ts's tier can
   read it (ADR-0017), and pure so the shared fixture can pin it against the
   Java side (ADR-0028).

   No "hold until" arithmetic here, deliberately: nothing on this side needs
   it. The two foreground checks ask only whether now is quiet, and the one
   place that needs an actual held instant is native, where the answer has to
   be a wall-clock time on a real date rather than a count of minutes - 07:00
   on the morning summer time ends is 07:00, not 07:00 plus an hour. */

export interface QuietHours {
  enabled: boolean;
  /** Wall-clock `HH:MM`, inclusive. */
  start: string;
  /** Wall-clock `HH:MM`, exclusive. */
  end: string;
}

/** Minutes since local midnight for an `HH:MM` preference, or 0 for one that
    cannot be read - the same fallback ReminderPlanner.parseTime makes, and
    for the same reason: a malformed preference must not take a scheduler
    down with it. */
export function minuteOfDay(hhmm: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return 0;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return 0;
  return hour * 60 + minute;
}

/** Whether a notification due at `minute` (minutes since local midnight)
    falls inside quiet hours.

    Half-open on purpose: the minute the window opens is quiet and the minute
    it closes is not, so a notification held until the end of the window
    cannot arrive at an instant that is itself still quiet. Equal ends read as
    an empty window rather than a silent whole day - both readings are
    defensible and only one of them fails safe, since two equal times
    somebody scrolled past would otherwise hold every notification the app
    has, permanently, with nothing on screen saying so. */
export function isQuiet(minute: number, quiet: QuietHours): boolean {
  if (!quiet.enabled) return false;
  const start = minuteOfDay(quiet.start);
  const end = minuteOfDay(quiet.end);
  if (start === end) return false;
  if (start < end) return minute >= start && minute < end;
  // Wrapping past midnight, which the default window does.
  return minute >= start || minute < end;
}

/** Whether a notification may be posted at `at`, reading the window against
    that moment's own local wall clock. The one entry point the JS-side
    producers call; `isQuiet` above is the arithmetic the fixture pins. */
export function mayFireAt(at: Date, quiet: QuietHours): boolean {
  return !isQuiet(at.getHours() * 60 + at.getMinutes(), quiet);
}
