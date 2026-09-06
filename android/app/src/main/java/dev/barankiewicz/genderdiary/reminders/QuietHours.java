package dev.barankiewicz.genderdiary.reminders;

import org.json.JSONObject;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZonedDateTime;

/**
 * Quiet hours, the unprompted registry's one cross-class rule. The same
 * arithmetic as src/lib/unprompted/quietHours.ts, reimplemented here for the same reason
 * {@link ReminderPlanner} reimplements reminderRule.ts: an alarm is scheduled
 * before any WebView exists and Java has no import path into TypeScript.
 *
 * <p>What holds the two to the same answers is
 * src/lib/android/fixtures/quiet-hours.json, read by QuietHoursFixtureTest on
 * this side.
 *
 * <p>Held, never dropped: an alarm that would fire inside the window is
 * scheduled at the end of the window instead, so the person still gets it and
 * gets it once. The window is half-open, which is what stops a held alarm
 * landing on a minute that is itself still quiet, and two equal ends read as
 * an empty window rather than a silent whole day.
 *
 * <p>The hold is applied when the alarm is <em>set</em>, not when it fires.
 * An alarm the OS delivers late - doze deferring a non-exact alarm by hours -
 * can therefore still arrive inside the window. Checking again in
 * {@link ReminderAlarmReceiver} would turn that case into a drop rather than
 * a hold, since nothing would reschedule it, which is the worse of the two.
 */
final class QuietHours {

    private QuietHours() {}

    /**
     * The fire time itself, or the end of the window when it falls inside
     * one. Computed as a wall-clock time on a real date rather than as a
     * count of minutes added: 07:00 on the morning summer time ends is 07:00,
     * not 07:00 plus an hour.
     */
    static ZonedDateTime hold(ZonedDateTime fireAt, JSONObject quietHours) {
        if (quietHours == null || !quietHours.optBoolean("enabled", false)) return fireAt;

        int start = minuteOfDay(quietHours.optString("start", "00:00"));
        int end = minuteOfDay(quietHours.optString("end", "00:00"));
        if (start == end) return fireAt;

        int minute = fireAt.getHour() * 60 + fireAt.getMinute();
        if (!inside(minute, start, end)) return fireAt;

        // A wrapping window entered before midnight ends on the next day; one
        // entered after midnight, and any window that does not wrap, ends on
        // the same day.
        LocalDate day = fireAt.toLocalDate();
        if (start > end && minute >= start) day = day.plusDays(1);

        return LocalDateTime.of(day, LocalTime.of(end / 60, end % 60)).atZone(fireAt.getZone());
    }

    /** Whether a notification due at {@code minute} minutes past local
        midnight falls inside the window. */
    static boolean inside(int minute, int start, int end) {
        if (start == end) return false;
        if (start < end) return minute >= start && minute < end;
        return minute >= start || minute < end;
    }

    /** Minutes since local midnight for an {@code HH:MM} preference, or 0 for
        one that cannot be read - the same fallback
        {@code ReminderPlanner.parseTime} makes, and for the same reason. */
    static int minuteOfDay(String hhmm) {
        try {
            String[] parts = hhmm.split(":");
            if (parts.length != 2) return 0;
            int hour = Integer.parseInt(parts[0]);
            int minute = Integer.parseInt(parts[1]);
            if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return 0;
            return hour * 60 + minute;
        } catch (Exception ignored) {
            return 0;
        }
    }
}
