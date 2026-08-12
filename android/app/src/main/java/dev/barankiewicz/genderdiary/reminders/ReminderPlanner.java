package dev.barankiewicz.genderdiary.reminders;

import org.json.JSONObject;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

final class ReminderPlanner {

    private ReminderPlanner() {}

    static ZonedDateTime nextReminder(JSONObject reminder, ZonedDateTime now) {
        if (!reminder.optBoolean("enabled", false)) return null;

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

        if (!"DAILY".equals(recurrence) && !"WEEKLY".equals(recurrence)) return null;

        int step = "WEEKLY".equals(recurrence) ? 7 : 1;
        ZonedDateTime todayAt = occurrenceOn(today, time, now.getZone());
        return todayAt.isAfter(now) ? todayAt : occurrenceOn(today + step, time, now.getZone());
    }

    static ZonedDateTime nextCheckIn(String time, ZonedDateTime now, boolean todayHasEntry) {
        int today = (int) now.toLocalDate().toEpochDay();
        ZonedDateTime todayAt = occurrenceOn(today, time, now.getZone());
        if (todayAt.isAfter(now) && !todayHasEntry) return todayAt;
        return occurrenceOn(today + 1, time, now.getZone());
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