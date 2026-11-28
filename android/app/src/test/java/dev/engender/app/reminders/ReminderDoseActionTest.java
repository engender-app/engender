package dev.engender.app.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicReference;

/** Taken and Skip on a medication reminder's notification, kept natively until the journal
    is open to take them. */
public class ReminderDoseActionTest {

    private static final ZoneId ZONE = ZoneId.of("Europe/Warsaw");

    private static JSONObject reminder(String id, String drug) throws Exception {
        JSONObject reminder = new JSONObject()
            .put("id", id).put("title", "Estradiol").put("enabled", true)
            .put("time", "20:00").put("recurrence", "DAILY");
        if (drug != null) reminder.put("drug", drug);
        return reminder;
    }

    private static JSONObject payload() throws Exception {
        return new JSONObject().put("reminders", new JSONArray()
            .put(reminder("med", "Estradiol valerate"))
            .put(reminder("plain", null)));
    }

    @Test
    public void aMedicationReminderOpensItsDoseLogAndAnyOtherOpensItsEditor() throws Exception {
        assertEquals("/care/doses?add=1&reminder=med", ReminderAlarmReceiver.routeFor(reminder("med", "Estradiol valerate")));
        assertEquals("/settings/reminders/plain", ReminderAlarmReceiver.routeFor(reminder("plain", null)));
        assertEquals("/settings/reminders/blank", ReminderAlarmReceiver.routeFor(reminder("blank", "  ")));
        // The bridge sends a reminder with no drug as a JSON null, which is no drug.
        assertEquals("/settings/reminders/nul",
            ReminderAlarmReceiver.routeFor(reminder("nul", null).put("drug", JSONObject.NULL)));
        assertEquals("/care/doses?add=1&reminder=med",
            ReminderScheduler.sanitizeLaunchRoute(ReminderAlarmReceiver.routeFor(reminder("med", "E"))));
    }

    @Test
    public void aTapIsKeptWithTheDrugTheReminderNamed() throws Exception {
        AtomicReference<JSONObject> stored = new AtomicReference<>(payload());
        assertTrue(ReminderScheduler.recordDoseAction(stored::get, stored::set,
            "a1", "med", "taken", 1_000L, 2_000L, null));

        JSONArray kept = stored.get().getJSONArray(ReminderScheduler.PENDING_DOSE_ACTIONS);
        assertEquals(1, kept.length());
        JSONObject action = kept.getJSONObject(0);
        assertEquals("a1", action.getString("id"));
        assertEquals("med", action.getString("reminderId"));
        assertEquals("Estradiol valerate", action.getString("drug"));
        assertEquals("taken", action.getString("action"));
        assertEquals(1_000L, action.getLong("postedAt"));
        assertEquals(2_000L, action.getLong("at"));
    }

    @Test
    public void aTapKeepsTheRuleTheNotificationWasPostedUnder() throws Exception {
        AtomicReference<JSONObject> stored = new AtomicReference<>(payload());
        String rule = ReminderScheduler.ruleOf(reminder("med", "E"));
        ReminderScheduler.recordDoseAction(stored::get, stored::set, "a1", "med", "taken", 1L, 2L, rule);

        JSONObject kept = stored.get().getJSONArray(ReminderScheduler.PENDING_DOSE_ACTIONS)
            .getJSONObject(0).getJSONObject("rule");
        assertEquals("20:00", kept.getString("time"));
        assertEquals("DAILY", kept.getString("recurrence"));
        assertTrue(kept.isNull("epochDay"));
    }

    @Test
    public void aTapForAReminderWithNoDrugOrAnUnknownActionKeepsNothing() throws Exception {
        AtomicReference<JSONObject> stored = new AtomicReference<>(payload());
        assertFalse(ReminderScheduler.recordDoseAction(stored::get, stored::set, "a1", "plain", "taken", 1L, 2L, null));
        assertFalse(ReminderScheduler.recordDoseAction(stored::get, stored::set, "a2", "gone", "taken", 1L, 2L, null));
        assertFalse(ReminderScheduler.recordDoseAction(stored::get, stored::set, "a3", "med", "maybe", 1L, 2L, null));
        assertNull(stored.get().optJSONArray(ReminderScheduler.PENDING_DOSE_ACTIONS));
    }

    @Test
    public void aSyncFromTheAppKeepsTheTapsItHasNotAppliedYet() throws Exception {
        AtomicReference<JSONObject> stored = new AtomicReference<>(payload());
        ReminderScheduler.recordDoseAction(stored::get, stored::set, "a1", "med", "skipped", 1L, 2L, null);

        JSONObject fresh = payload();
        ReminderScheduler.saveAndSchedule(fresh, ZonedDateTime.of(2026, 10, 22, 12, 0, 0, 0, ZONE),
            stored::get, stored::set, cancelled -> {}, scheduled -> {});

        assertEquals("a1", stored.get().getJSONArray(ReminderScheduler.PENDING_DOSE_ACTIONS)
            .getJSONObject(0).getString("id"));
    }

    @Test
    public void clearingRemovesOnlyTheActionsTheAppApplied() throws Exception {
        AtomicReference<JSONObject> stored = new AtomicReference<>(payload());
        ReminderScheduler.recordDoseAction(stored::get, stored::set, "a1", "med", "taken", 1L, 2L, null);
        ReminderScheduler.recordDoseAction(stored::get, stored::set, "a2", "med", "skipped", 3L, 4L, null);

        ReminderScheduler.clearDoseActions(stored::get, stored::set, Collections.singleton("a1"));

        JSONArray kept = stored.get().getJSONArray(ReminderScheduler.PENDING_DOSE_ACTIONS);
        assertEquals(1, kept.length());
        assertEquals("a2", kept.getJSONObject(0).getString("id"));
    }

    @Test
    public void aTapKeepsTheDayTheNotificationRangForAndAnOlderOneKeepsNone() throws Exception {
        AtomicReference<JSONObject> stored = new AtomicReference<>(payload());
        ReminderScheduler.recordDoseAction(stored::get, stored::set, "a1", "med", "taken", 1L, 2L, null, 20775L);
        ReminderScheduler.recordDoseAction(stored::get, stored::set, "a2", "med", "taken", 3L, 4L, null);

        JSONArray kept = stored.get().getJSONArray(ReminderScheduler.PENDING_DOSE_ACTIONS);
        assertEquals(20775L, kept.getJSONObject(0).getLong("slotEpochDay"));
        assertFalse(kept.getJSONObject(1).has("slotEpochDay"));
    }

    @Test
    public void aDeliveredReminderNamesTheDayItRangForWhateverItsRecurrence() throws Exception {
        for (String recurrence : new String[] { "DAILY", "EVERY_N_DAYS" }) {
            JSONObject row = reminder("med", "Estradiol valerate").put("time", "22:30").put("recurrence", recurrence);
            if (recurrence.equals("EVERY_N_DAYS")) row.put("interval", 3).put("anchorEpochDay", 20775L - 6);
            JSONObject payload = new JSONObject().put("reminders", new JSONArray().put(row));
            ZonedDateTime ring = ZonedDateTime.of(2026, 11, 18, 22, 30, 0, 0, ZONE);
            ReminderScheduler.saveAndSchedule(payload, ring.minusMinutes(1), () -> null, saved -> {}, old -> {}, saved -> {});
            assertNull(ReminderScheduler.slotDayOf(row));

            AtomicReference<Long> posted = new AtomicReference<>();
            ReminderScheduler.deliverReminder(payload, row, ring, saved -> {},
                delivered -> posted.set(ReminderScheduler.slotDayOf(delivered)), delivered -> {});

            assertEquals(recurrence, Long.valueOf(20775L), posted.get());
        }
    }
}
