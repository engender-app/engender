/* Quiet hours for scheduled reminders and backup failure notices. Native reminders shift
   alarms to the end of the window; backup failures wait for the next foreground check.

   Kept relative-import-free and rune-free so registry.test.ts's tier can read it, and pure
   so the shared fixture can pin it against the Java side.

   No "hold until" arithmetic here, deliberately: the foreground check asks only whether now
   is quiet, and the one place that needs an actual held instant is native, where the answer
   has to be a wall-clock time on a real date rather than a count of minutes - 07:00 on the
   morning summer time ends is 07:00, not 07:00 plus an hour. */

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
/* minuteOfDay stays exported only for its own test (AU-09 test-only review). */
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
/* isQuiet stays exported only for its own test (AU-09 test-only review). */
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

/** The window as the preferences hold it. Three flat keys rather than one
    stored object, because the settings screen binds a switch and two time
    inputs straight to them (prefs/catalogue.ts) - so this is the one place
    that puts them back together, instead of each producer rebuilding the
    same three-field literal. */
export function quietHoursOf(prefs: {
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}): QuietHours {
  return { enabled: prefs.quietHoursEnabled, start: prefs.quietHoursStart, end: prefs.quietHoursEnd };
}
