package dev.engender.app.reminders;

import org.json.JSONObject;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/**
 * When a reminder fires next. The same arithmetic as
 * src/lib/data/reminderRule.ts's nextOccurrence(), reimplemented here
 * because the alarm is scheduled before any WebView exists and Java has no
 * import path into TypeScript.
 *
 * What holds the two to the same answers is
 * src/lib/android/fixtures/reminder-rule.json, read by
 * ReminderRuleFixtureTest on this side. Change the rule here and add the
 * case there; reminderRule.ts's header says why.
 */
final class ReminderPlanner {

    private ReminderPlanner() {}

    /** The rule's next firing for a reminder row, or null when the row is
        switched off or has nothing left to fire. */
    static ZonedDateTime nextReminder(JSONObject reminder, ZonedDateTime now) {
        if (!reminder.optBoolean("enabled", false)) return null;
        return nextOccurrence(reminder, now);
    }

    /** Quiet hours can leave yesterday's occurrence waiting for this morning.
        Compare delivery times before discarding an elapsed rule occurrence. */
    static ZonedDateTime nextReminder(JSONObject reminder, ZonedDateTime now, JSONObject quietHours) {
        ZonedDateTime occurrence = nextReminderOccurrence(reminder, now, quietHours);
        return occurrence == null ? null : QuietHours.hold(occurrence, quietHours);
    }

    static ZonedDateTime nextReminderOccurrence(JSONObject reminder, ZonedDateTime now, JSONObject quietHours) {
        ZonedDateTime cursor = now.toLocalDate().minusDays(1).atStartOfDay(now.getZone()).minusNanos(1);
        ZonedDateTime candidate;
        while ((candidate = nextReminder(reminder, cursor)) != null) {
            ZonedDateTime held = QuietHours.hold(candidate, quietHours);
            if (held.isAfter(now)) return candidate;
            cursor = candidate;
        }
        return null;
    }

    /** When the rule fires next, strictly after `now`, or null when it never
        will again. Takes the rule's own fields - time, recurrence, interval,
        anchorEpochDay, epochDay - which is what the shared fixture holds,
        without the row's enabled flag around them. */
    static ZonedDateTime nextOccurrence(JSONObject reminder, ZonedDateTime now) {
        String recurrence = reminder.isNull("recurrence") ? null : reminder.optString("recurrence", null);
        String time = reminder.optString("time", "00:00");

        if (recurrence == null || recurrence.isBlank()) {
            if (reminder.isNull("epochDay")) return null;
            int epochDay = reminder.optInt("epochDay", Integer.MIN_VALUE);
            if (epochDay == Integer.MIN_VALUE) return null;
            ZonedDateTime oneOff = occurrenceOn(epochDay, time, now.getZone());
            return oneOff.isAfter(now) ? oneOff : null;
        }

        int today = (int) now.toLocalDate().toEpochDay();

        if ("EVERY_N_DAYS".equals(recurrence)) {
            if (reminder.isNull("interval") || reminder.isNull("anchorEpochDay")) return null;
            int interval = reminder.optInt("interval", 0);
            int anchor = reminder.optInt("anchorEpochDay", Integer.MIN_VALUE);
            if (interval <= 0 || anchor == Integer.MIN_VALUE) return null;

            int steps = Math.max(0, (int) Math.ceil((today - anchor) / (double) interval));
            int day = anchor + steps * interval;
            ZonedDateTime at = occurrenceOn(day, time, now.getZone());
            if (!at.isAfter(now)) at = occurrenceOn(day + interval, time, now.getZone());
            return at;
        }

        if (!"DAILY".equals(recurrence)) return null;

        ZonedDateTime todayAt = occurrenceOn(today, time, now.getZone());
        return todayAt.isAfter(now) ? todayAt : occurrenceOn(today + 1, time, now.getZone());
    }

    /** When the daily check-in fires next, or null when it is switched off.
        The same rule as src/lib/reminders/checkIn.ts's nextCheckIn, held to
        it by check-in-rule.json (CheckInRuleFixtureTest): silent through
        `checkInPausedThrough`, and a day that already has an entry - or
        whose prompt quiet hours would deliver on it - asks nothing. */
    static ZonedDateTime nextCheckIn(JSONObject payload, ZonedDateTime now) {
        if (!payload.optBoolean("checkInEnabled", false)) return null;
        String time = payload.optString("checkInTime", "21:00");
        int today = (int) now.toLocalDate().toEpochDay();
        int latestEntryDay = payload.optInt("latestEntryEpochDay", Integer.MIN_VALUE);
        int pausedThrough = pausedThrough(payload);
        ZonedDateTime candidate = occurrenceOn(Math.max(today - 1, pausedThrough + 1), time, now.getZone());

        while (true) {
            int day = (int) candidate.toLocalDate().toEpochDay();
            ZonedDateTime held = QuietHours.hold(candidate, payload.optJSONObject("quietHours"));
            int deliveryDay = (int) held.toLocalDate().toEpochDay();
            // An entry suppresses both its own prompt and a prompt deferred to that day.
            if (!held.isAfter(now) || day == latestEntryDay || deliveryDay == latestEntryDay) {
                candidate = occurrenceOn(day + 1, time, now.getZone());
                continue;
            }
            return held;
        }
    }

    /** Whether the check-in may fire on `day` at all: switched on, and past
        the last paused day. Asked again when the alarm fires, so a pause set
        after the alarm was scheduled still holds. */
    static boolean checkInAllowedOn(JSONObject payload, int day) {
        return payload.optBoolean("checkInEnabled", false) && day > pausedThrough(payload);
    }

    /** The last silent day, or MIN_VALUE when the check-in is not paused. */
    private static int pausedThrough(JSONObject payload) {
        if (payload.isNull("checkInPausedThrough")) return Integer.MIN_VALUE;
        return payload.optInt("checkInPausedThrough", Integer.MIN_VALUE);
    }

    private static ZonedDateTime occurrenceOn(int epochDay, String hhmm, ZoneId zone) {
        LocalDate day = LocalDate.ofEpochDay(epochDay);
        LocalTime time = parseTime(hhmm);
        return LocalDateTime.of(day, time).atZone(zone);
    }

    private static LocalTime parseTime(String hhmm) {
        try {
            String[] parts = hhmm.split(":");
            int hour = Integer.parseInt(parts[0]);
            int minute = Integer.parseInt(parts[1]);
            if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return LocalTime.of(0, 0);
            return LocalTime.of(hour, minute);
        } catch (Exception ignored) {
            return LocalTime.of(0, 0);
        }
    }
}
