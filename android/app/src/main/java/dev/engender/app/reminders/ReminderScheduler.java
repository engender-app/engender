package dev.engender.app.reminders;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.function.BooleanSupplier;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

public final class ReminderScheduler {

    public static final String PREFS = "engender-reminders";
    private static final String KEY_LAUNCH_ROUTE = "launch-route";
    static final String PENDING_AT = "pendingAt";
    static final String BOOT_CATCH_UP = "bootCatchUp";
    static final String PENDING_DAY = "pendingDay";
    static final String PENDING_ZONE = "pendingZone";
    /** The local calendar day (epoch day) of the occurrence last delivered, for
        every recurrence. Taken and Skip carry it so the app answers the day the
        notification rang for, in whatever zone it opens in. */
    static final String POSTED_DAY = "postedDay";
    static final String DELIVERED_DAY = "deliveredDay";
    static final String DELIVERED_ZONE = "deliveredZone";
    static final String DELIVERED_AT = "deliveredAt";
    private static final long ZONE_REPEAT_WINDOW_MILLIS = 12 * 60 * 60 * 1000L;

    static final String EXTRA_KIND = "kind";
    static final String EXTRA_REMINDER_ID = "reminderId";
    public static final String EXTRA_ROUTE = "gd_route";
    static final String KIND_REMINDER = "reminder";
    static final String KIND_CHECK_IN = "check-in";
    static final String KIND_DOSE_ACTION = "dose-action";
    static final String EXTRA_DOSE_ACTION = "doseAction";
    static final String EXTRA_POSTED_AT = "postedAt";
    static final String EXTRA_RULE = "rule";
    static final String EXTRA_SLOT_DAY = "slotDay";

    /** Taken and Skip taps on a medication reminder's notification,
        kept in the encrypted payload until
        the app has written them into the journal. The journal may be locked
        when the button is pressed, and its key only exists after unlock, so
        this store is where a tap waits. */
    static final String PENDING_DOSE_ACTIONS = "pendingDoseActions";

    /** Where a posted reminder lives: tag "reminder:<id>", this id. */
    static final String REMINDER_TAG_PREFIX = "reminder:";
    static final int REMINDER_NOTIFICATION_ID = 7000;

    static final String CHANNEL_REMINDERS = "gd-reminders";
    static final String CHANNEL_CHECK_IN = "gd-check-in";

    private static final int REQUEST_REMINDER = 41;
    private static final int REQUEST_CHECK_IN = 42;
    private static final int REQUEST_DOSE_ACTION = 43;

    private ReminderScheduler() {}

    // The class monitor covers store reads through alarm replacement and wipe.
    // A receiver must not write an old payload over a concurrent journal sync.

    /**
     * The store is written before the old alarms are cancelled, so a wrap
     * that fails leaves the phone on the rules it already had rather than
     * on none. {@code RemindersPlugin.sync}
     * rejects, which {@code platform-sync.ts} logs and nothing shows the
     * person; what recovers it is the next sync, on the next focus.
     */
    static synchronized void saveAndSchedule(Context context, JSONObject payload) throws Exception {
        ZonedDateTime now = ZonedDateTime.now();
        saveAndSchedule(payload, now, () -> loadPayload(context),
            saved -> ReminderPayloadStore.write(context, saved),
            previous -> cancelAll(context, previous), saved -> scheduleAll(context, saved, now));
        /* Still under the class monitor, so an alarm that was delivering
           with the old payload has finished posting before this looks, and
           the next one reads the new payload. Nothing can post the old
           titles after this returns. */
        withdrawRevealedReminders(context, payload);
    }

    /** Reposts a device test makes Android appear to shed: the next N are
        skipped. Zero in production. */
    static volatile int dropReposts;

    /**
     * Reminders already in the shade were posted under whatever the payload
     * said then. When titles are now hidden, each is replaced in place by
     * its hidden form, silently, so the lock screen stops showing a title or
     * a line of text the person has just said to keep off it. The "Noted"
     * line a dose button leaves behind (marked by an extra) times itself out in seconds and
     * names the reminder, so it is cancelled rather than reposted. A
     * reminder the payload no longer has is cancelled too. Anything else in
     * the shade - another tag, another id, the check-in - is not touched here;
     * {@link CheckInFaces#reconcile} owns the check-in.
     */
    /** Under Android's roughly five notifications a second, with room to
        spare. A person with many reminders flips hide titles and every one
        is reposted at once; spaced like this none is shed in the first
        place. */
    private static final long REPOST_SPACING_MS = 250;
    /** The class monitor is held for the whole pass, so it is bounded: past
        this many the rest are cancelled instead of reposted, which is also
        a valid end state, and the longest hold is about 3.5 s. */
    private static final int MAX_PACED_REPOSTS = 8;
    private static final long SETTLE_POLL_MS = 150;
    private static final int SETTLE_POLLS = 10;

    private static void withdrawRevealedReminders(Context context, JSONObject payload) {
        if (!payload.optBoolean("hideNotificationTitles", false)) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        List<JSONObject> repost = new ArrayList<>();
        for (StatusBarNotification posted : manager.getActiveNotifications()) {
            JSONObject reminder = ownReminderOf(posted, payload);
            if (reminder == null && isOwnReminderTag(posted)) {
                // The Noted line, or a reminder the payload no longer has.
                manager.cancel(posted.getTag(), REMINDER_NOTIFICATION_ID);
            } else if (reminder != null && !alreadyHidden(posted.getNotification(), payload, reminder)) {
                repost.add(reminder);
            }
        }
        for (int i = MAX_PACED_REPOSTS; i < repost.size(); i++) {
            manager.cancel(REMINDER_TAG_PREFIX + repost.get(i).optString("id", ""), REMINDER_NOTIFICATION_ID);
        }
        if (repost.size() > MAX_PACED_REPOSTS) repost = repost.subList(0, MAX_PACED_REPOSTS);
        boolean interrupted = false;
        for (int i = 0; i < repost.size() && !interrupted; i++) {
            if (dropReposts > 0) {
                dropReposts--;
                continue;
            }
            /* Replaced in place under the same tag and id. A cancel first
               races the repost inside the notification service (the two
               take different paths) and on a Pixel running Android 17 the
               cancel won, leaving nothing in the shade. */
            ReminderAlarmReceiver.postReminderNotification(context, payload, repost.get(i), true);
            interrupted = !pause(i + 1 < repost.size() ? REPOST_SPACING_MS : 0);
        }
        /* Android sheds what it is sent too fast, silently. Whatever is
           still showing a title once the reposts have had time to land is
           cancelled: the end state is hidden or gone, never the old title. */
        for (int poll = 0; poll < SETTLE_POLLS && !interrupted; poll++) {
            if (stillRevealed(manager, payload).isEmpty()) return;
            interrupted = !pause(SETTLE_POLL_MS);
        }
        for (String tag : stillRevealed(manager, payload)) manager.cancel(tag, REMINDER_NOTIFICATION_ID);
    }

    private static boolean pause(long millis) {
        if (millis <= 0) return true;
        try {
            Thread.sleep(millis);
            return true;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private static List<String> stillRevealed(NotificationManager manager, JSONObject payload) {
        List<String> tags = new ArrayList<>();
        for (StatusBarNotification posted : manager.getActiveNotifications()) {
            JSONObject reminder = ownReminderOf(posted, payload);
            if (reminder != null && !alreadyHidden(posted.getNotification(), payload, reminder)) tags.add(posted.getTag());
        }
        return tags;
    }

    private static boolean isOwnReminderTag(StatusBarNotification posted) {
        return posted.getId() == REMINDER_NOTIFICATION_ID && posted.getTag() != null
            && posted.getTag().startsWith(REMINDER_TAG_PREFIX);
    }

    /** The reminder a posted notification stands for, or null when it is not
        a reminder of ours, is the Noted line, or names one the payload lacks. */
    private static JSONObject ownReminderOf(StatusBarNotification posted, JSONObject payload) {
        if (!isOwnReminderTag(posted)) return null;
        if (posted.getNotification().extras.getBoolean(ReminderAlarmReceiver.EXTRA_NOTED, false)) return null;
        return findReminder(payload, posted.getTag().substring(REMINDER_TAG_PREFIX.length()));
    }

    private static boolean alreadyHidden(Notification notification, JSONObject payload, JSONObject reminder) {
        CharSequence title = notification.extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence text = notification.extras.getCharSequence(Notification.EXTRA_TEXT);
        return title != null && text != null
            && title.toString().equals(ReminderAlarmReceiver.resolveNotificationTitle(payload, reminder))
            && text.toString().equals(ReminderAlarmReceiver.resolveNotificationText(payload, reminder));
    }

    /** What {@code RemindersPlugin.sync} does with a payload from the app,
        named so a device test can drive the production path without a
        bridge call. */
    static void applySync(Context context, JSONObject payload) throws Exception {
        saveAndSchedule(context, payload);
        CheckInFaces.reconcile(context, payload);
    }

    /** The reminders screen's retry. Under the same monitor as the alarms, so
        a delivery never reads the store halfway through the rewrap. When it
        works the alarms are set from the recovered payload at once. */
    static synchronized boolean retryStoredCopy(Context context) {
        boolean locked = ReminderPayloadStore.retryLegacy(context);
        if (locked) rescheduleFromStore(context);
        return locked;
    }

    static synchronized void eraseStoredCopy(Context context) {
        ReminderPayloadStore.eraseLegacy(context);
    }

    public static synchronized void rescheduleFromStore(Context context) {
        ZonedDateTime now = ZonedDateTime.now();
        rescheduleFromStore(context, now, false);
    }

    static synchronized void rescheduleAfterBoot(Context context) {
        rescheduleFromStore(context, ZonedDateTime.now(), true);
    }

    /** Called whenever the app comes forward, including at the gate: a
        disguise switched on while faces sit in the shade must clear them
        before anyone has unlocked and synced. */
    public static void withdrawHiddenFaces(Context context) {
        JSONObject payload = loadPayload(context);
        if (payload != null) CheckInFaces.reconcile(context, payload);
    }

    private static void rescheduleFromStore(Context context, ZonedDateTime now, boolean boot) {
        rescheduleFromStore(() -> loadPayload(context), now,
            saved -> ReminderPayloadStore.write(context, saved),
            payload -> cancelAll(context, payload), payload -> scheduleAll(context, payload, now), boot,
            (payload, reminder) -> ReminderAlarmReceiver.postReminderNotification(context, payload, reminder));
    }

    interface PayloadReader {
        JSONObject read() throws Exception;
    }

    interface PayloadWriter {
        void write(JSONObject payload) throws Exception;
    }

    static synchronized void saveAndSchedule(JSONObject payload, ZonedDateTime now, PayloadReader reader, PayloadWriter writer,
                                Consumer<JSONObject> cancel, Consumer<JSONObject> schedule) throws Exception {
        JSONObject previous = reader.read();
        /* The app's payload never carries the taps it has not applied yet,
           so a sync must not drop them on its way through. */
        JSONArray kept = previous == null ? null : previous.optJSONArray(PENDING_DOSE_ACTIONS);
        if (kept != null) payload.put(PENDING_DOSE_ACTIONS, kept);
        JSONArray reminders = payload.optJSONArray("reminders");
        if (reminders != null) {
            for (int i = 0; i < reminders.length(); i++) {
                JSONObject reminder = reminders.optJSONObject(i);
                if (reminder == null) continue;
                JSONObject old = findReminder(previous, reminder.optString("id", ""));
                if (old != null && sameRule(old, reminder)) {
                    for (String field : new String[] { DELIVERED_DAY, DELIVERED_ZONE, DELIVERED_AT }) {
                        if (old.has(field)) reminder.put(field, old.get(field));
                    }
                }
                boolean heldCatchUp = old != null && old.optBoolean(BOOT_CATCH_UP) && sameRule(old, reminder);
                reminder.remove(PENDING_AT);
                reminder.remove(BOOT_CATCH_UP);
                if (heldCatchUp) {
                    reminder.put(BOOT_CATCH_UP, true);
                    for (String field : new String[] { PENDING_DAY, PENDING_ZONE }) {
                        if (old.has(field)) reminder.put(field, old.get(field));
                    }
                }
                updatePending(reminder, payload, now);
            }
        }
        writer.write(payload);
        cancel.accept(previous);
        schedule.accept(payload);
    }

    /** Persist occurrence changes before replacing alarms or posting a caught-up notification. */
    static synchronized void rescheduleFromStore(PayloadReader reader, ZonedDateTime now, PayloadWriter writer,
                                    Consumer<JSONObject> cancel, Consumer<JSONObject> schedule) {
        rescheduleFromStore(reader, now, writer, cancel, schedule, false, (payload, reminder) -> {});
    }

    static synchronized void rescheduleFromStore(PayloadReader reader, ZonedDateTime now, PayloadWriter writer,
                                    Consumer<JSONObject> cancel, Consumer<JSONObject> schedule, boolean boot,
                                    BiConsumer<JSONObject, JSONObject> post) {
        JSONObject payload;
        List<JSONObject> missed = new ArrayList<>();
        try {
            payload = reader.read();
            if (payload == null) return;
            String before = payload.toString();
            JSONArray reminders = payload.optJSONArray("reminders");
            if (reminders != null) {
                for (int i = 0; i < reminders.length(); i++) {
                    JSONObject reminder = reminders.optJSONObject(i);
                    if (reminder == null) continue;
                    boolean due = reminder.has(PENDING_AT)
                        && reminder.optLong(PENDING_AT) <= now.toInstant().toEpochMilli();
                    if (boot && due && reminder.optBoolean("enabled", false)) {
                        ZonedDateTime held = QuietHours.hold(now, payload.optJSONObject("quietHours"));
                        if (held.isAfter(now)) {
                            reminder.put(BOOT_CATCH_UP, true);
                            reminder.put(PENDING_AT, held.toInstant().toEpochMilli());
                            continue;
                        }
                        reminder.remove(BOOT_CATCH_UP);
                        if (!repeatsDailySlot(reminder, reminder.optLong(PENDING_DAY, Long.MIN_VALUE), now.getZone().getId(), now)) {
                            recordDelivery(reminder, now);
                            missed.add(reminder);
                        }
                    }
                    updatePending(reminder, payload, now);
                }
            }
            if (!before.equals(payload.toString())) writer.write(payload);
        } catch (Exception failedStore) {
            return;
        }
        cancel.accept(payload);
        for (JSONObject reminder : missed) post.accept(payload, reminder);
        schedule.accept(payload);
    }

    private static void updatePending(JSONObject reminder, JSONObject payload, ZonedDateTime now) throws Exception {
        boolean catchUp = reminder.optBoolean(BOOT_CATCH_UP) && reminder.optBoolean("enabled", false);
        ZonedDateTime occurrence = catchUp ? null
            : ReminderPlanner.nextReminderOccurrence(reminder, now, payload.optJSONObject("quietHours"));
        if (occurrence != null && repeatsDailySlot(reminder, occurrence.toLocalDate().toEpochDay(),
                now.getZone().getId(), QuietHours.hold(occurrence, payload.optJSONObject("quietHours")))) {
            occurrence = ReminderPlanner.nextReminderOccurrence(reminder,
                QuietHours.hold(occurrence, payload.optJSONObject("quietHours")), payload.optJSONObject("quietHours"));
        }
        ZonedDateTime next = catchUp ? QuietHours.hold(now, payload.optJSONObject("quietHours"))
            : occurrence == null ? null : QuietHours.hold(occurrence, payload.optJSONObject("quietHours"));
        if (next == null || reminder.optString("id", "").isBlank()) {
            reminder.remove(PENDING_AT);
            reminder.remove(PENDING_DAY);
            reminder.remove(PENDING_ZONE);
            reminder.remove(BOOT_CATCH_UP);
        } else {
            reminder.put(PENDING_AT, next.toInstant().toEpochMilli());
            if (!catchUp) {
                reminder.put(PENDING_DAY, occurrence.toLocalDate().toEpochDay());
                reminder.put(PENDING_ZONE, now.getZone().getId());
            }
        }
    }

    /** A daily slot is the reminder row, unchanged rule and original local date.
     * A changed zone cannot repeat that slot within 12 hours of its delivery.
     * History lives in the encrypted payload and is committed before posting. */
    private static boolean repeatsDailySlot(JSONObject reminder, long day, String zone, ZonedDateTime at) {
        long elapsed = at.toInstant().toEpochMilli() - reminder.optLong(DELIVERED_AT, Long.MIN_VALUE);
        return "DAILY".equals(reminder.optString("recurrence"))
            && reminder.has(DELIVERED_AT) && day == reminder.optLong(DELIVERED_DAY, Long.MIN_VALUE)
            && !zone.equals(reminder.optString(DELIVERED_ZONE))
            && elapsed >= 0 && elapsed < ZONE_REPEAT_WINDOW_MILLIS;
    }

    private static void recordDelivery(JSONObject reminder, ZonedDateTime now) throws Exception {
        reminder.put(POSTED_DAY, reminder.optLong(PENDING_DAY, now.toLocalDate().toEpochDay()));
        if (!"DAILY".equals(reminder.optString("recurrence"))) return;
        reminder.put(DELIVERED_DAY, reminder.optLong(PENDING_DAY, now.toLocalDate().toEpochDay()));
        reminder.put(DELIVERED_ZONE, reminder.optString(PENDING_ZONE, now.getZone().getId()));
        reminder.put(DELIVERED_AT, now.toInstant().toEpochMilli());
    }

    private static boolean sameRule(JSONObject left, JSONObject right) {
        for (String field : new String[] { "enabled", "time", "recurrence", "interval", "anchorEpochDay", "epochDay" }) {
            if (!String.valueOf(left.opt(field)).equals(String.valueOf(right.opt(field)))) return false;
        }
        return true;
    }

    static JSONObject findReminder(JSONObject payload, String id) {
        JSONArray reminders = payload == null ? null : payload.optJSONArray("reminders");
        if (reminders == null || id == null || id.isBlank()) return null;
        for (int i = 0; i < reminders.length(); i++) {
            JSONObject reminder = reminders.optJSONObject(i);
            if (reminder != null && id.equals(reminder.optString("id", ""))) return reminder;
        }
        return null;
    }

    /**
     * Keeps one Taken or Skip tap until the app applies it. Only a reminder
     * that names a drug has the buttons, so a tap for any other, for a
     * reminder that has since gone, or with an action this build does not
     * know keeps nothing. The drug is copied in, so a reminder deleted
     * before the next unlock still says what the tap was about.
     */
    static synchronized boolean recordDoseAction(PayloadReader reader, PayloadWriter writer, String id,
                                                 String reminderId, String action, long postedAt, long at,
                                                 String rule) throws Exception {
        return recordDoseAction(reader, writer, id, reminderId, action, postedAt, at, rule, null);
    }

    /** `slotDay` is the epoch day the notification rang for (POSTED_DAY), or
        null for a tap whose notification was posted by a build that did not
        carry it. */
    static synchronized boolean recordDoseAction(PayloadReader reader, PayloadWriter writer, String id,
                                                 String reminderId, String action, long postedAt, long at,
                                                 String rule, Long slotDay) throws Exception {
        if (!"taken".equals(action) && !"skipped".equals(action)) return false;
        JSONObject payload = reader.read();
        JSONObject reminder = findReminder(payload, reminderId);
        String drug = reminder == null ? "" : drugOf(reminder);
        if (drug.isEmpty()) return false;
        JSONArray actions = payload.optJSONArray(PENDING_DOSE_ACTIONS);
        if (actions == null) actions = new JSONArray();
        JSONObject kept = new JSONObject()
            .put("id", id).put("reminderId", reminderId).put("drug", drug)
            .put("action", action).put("postedAt", postedAt).put("at", at);
        JSONObject posted = parseRule(rule);
        if (posted != null) kept.put("rule", posted);
        if (slotDay != null) kept.put("slotEpochDay", slotDay.longValue());
        actions.put(kept);
        payload.put(PENDING_DOSE_ACTIONS, actions);
        writer.write(payload);
        return true;
    }

    /** The reminder's drug, or "" for none. Read by type rather than with
        optString, which on Android turns a JSON null into the text "null". */
    static String drugOf(JSONObject reminder) {
        Object drug = reminder.opt("drug");
        return drug instanceof String ? ((String) drug).trim() : "";
    }

    static synchronized boolean recordDoseAction(Context context, String id, String reminderId, String action,
                                                 long postedAt, long at, String rule, Long slotDay) throws Exception {
        return recordDoseAction(() -> loadPayload(context), saved -> ReminderPayloadStore.write(context, saved),
            id, reminderId, action, postedAt, at, rule, slotDay);
    }

    /** The reminder's rule as the notification was posted with it, so a rule
        edited before the tap does not move the slot the tap answers. */
    static String ruleOf(JSONObject reminder) {
        try {
            JSONObject rule = new JSONObject();
            for (String field : new String[] { "time", "recurrence", "interval", "anchorEpochDay", "epochDay" }) {
                rule.put(field, reminder.has(field) ? reminder.get(field) : JSONObject.NULL);
            }
            return rule.toString();
        } catch (Exception unreadable) {
            return null;
        }
    }

    private static JSONObject parseRule(String rule) {
        if (rule == null) return null;
        try {
            return new JSONObject(rule);
        } catch (Exception unreadable) {
            return null;
        }
    }

    static synchronized JSONArray pendingDoseActions(Context context) {
        JSONObject payload = loadPayload(context);
        JSONArray actions = payload == null ? null : payload.optJSONArray(PENDING_DOSE_ACTIONS);
        return actions == null ? new JSONArray() : actions;
    }

    /** Removes the taps the app has written, and only those: one pressed
        while the app was applying the others waits for the next pass. */
    static synchronized void clearDoseActions(PayloadReader reader, PayloadWriter writer, Set<String> ids) throws Exception {
        JSONObject payload = reader.read();
        JSONArray actions = payload == null ? null : payload.optJSONArray(PENDING_DOSE_ACTIONS);
        if (actions == null) return;
        JSONArray kept = new JSONArray();
        for (int i = 0; i < actions.length(); i++) {
            JSONObject action = actions.optJSONObject(i);
            if (action != null && !ids.contains(action.optString("id", ""))) kept.put(action);
        }
        payload.put(PENDING_DOSE_ACTIONS, kept);
        writer.write(payload);
    }

    static synchronized void clearDoseActions(Context context, Set<String> ids) throws Exception {
        clearDoseActions(() -> loadPayload(context), saved -> ReminderPayloadStore.write(context, saved), ids);
    }

    /** The day the notification rang for, or null when the row has none. */
    static Long slotDayOf(JSONObject reminder) {
        return reminder.has(POSTED_DAY) ? Long.valueOf(reminder.optLong(POSTED_DAY)) : null;
    }

    static PendingIntent doseActionIntent(Context context, String reminderId, String action, long postedAt, String rule,
                                          Long slotDay) {
        Intent intent = new Intent(context, ReminderAlarmReceiver.class)
            .setAction("dev.engender.app.DOSE_ACTION")
            .setData(Uri.parse("engender://dose-action/" + Uri.encode(reminderId) + "/" + action))
            .putExtra(EXTRA_KIND, KIND_DOSE_ACTION)
            .putExtra(EXTRA_REMINDER_ID, reminderId)
            .putExtra(EXTRA_DOSE_ACTION, action)
            .putExtra(EXTRA_POSTED_AT, postedAt)
            .putExtra(EXTRA_RULE, rule);
        if (slotDay != null) intent.putExtra(EXTRA_SLOT_DAY, slotDay.longValue());
        return PendingIntent.getBroadcast(context, REQUEST_DOSE_ACTION, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Consuming the occurrence must reach disk before its notification can be posted. */
    static synchronized void deliverReminder(Context context, JSONObject payload, JSONObject reminder, ZonedDateTime now) {
        deliverReminder(payload, reminder, now, saved -> ReminderPayloadStore.write(context, saved),
            row -> ReminderAlarmReceiver.postReminderNotification(context, payload, row),
            row -> scheduleOneReminder(context, payload, row, now));
    }

    static synchronized void deliverReminder(JSONObject payload, JSONObject reminder, ZonedDateTime now,
                                    PayloadWriter writer, Consumer<JSONObject> post, Consumer<JSONObject> schedule) {
        boolean repeat = repeatsDailySlot(reminder, reminder.optLong(PENDING_DAY, now.toLocalDate().toEpochDay()),
            now.getZone().getId(), now);
        try {
            if (!repeat) recordDelivery(reminder, now);
            reminder.remove(BOOT_CATCH_UP);
            updatePending(reminder, payload, now);
            writer.write(payload);
        } catch (Exception failedStore) {
            return;
        }
        if (!repeat) post.accept(reminder);
        schedule.accept(reminder);
    }

    /**
     * Read the payload, cancel its alarms with {@link #cancelAll},
     * then delete the payload synchronously with {@code commit}.
     * Keep request codes and intents shared with normal scheduling.
     *
     * <p>An unreadable payload prevents cancelling its named alarms.
     * They each wake once more and the receiver returns without
     * posting or rescheduling. Always cancel check-in by its fixed
     * request code.
     */
    public static synchronized void wipe(Context context) throws Exception {
        cancelAll(context, loadPayload(context));
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit();
        /* After the file, and for the same reason AutoExportPlugin deletes
           its own alias: the ciphertext is only gone because the file went
           with it, and a key left behind is a key that opens a copy of that
           file taken before the reset. */
        ReminderPayloadStore.deleteKey();
    }

    static synchronized JSONObject loadPayload(Context context) {
        return ReminderPayloadStore.read(context);
    }

    static void scheduleOneReminder(Context context, JSONObject payload, JSONObject reminder, ZonedDateTime now) {
        if (!reminder.has(PENDING_AT)) return;
        ZonedDateTime fireAt = Instant.ofEpochMilli(reminder.optLong(PENDING_AT)).atZone(now.getZone());
        String reminderId = reminder.optString("id", "");
        if (reminderId.isBlank()) return;
        PendingIntent pending = PendingIntent.getBroadcast(
            context,
            REQUEST_REMINDER,
            reminderIntent(context, reminderId),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        schedule(context, pending, fireAt.toInstant().toEpochMilli());
    }

    static void scheduleOneReminder(JSONObject payload, JSONObject reminder, ZonedDateTime now,
                                    Consumer<ZonedDateTime> scheduleAlarm) {
        ZonedDateTime fireAt = ReminderPlanner.nextReminder(reminder, now, payload.optJSONObject("quietHours"));
        if (fireAt == null) return;
        scheduleAlarm.accept(fireAt);
    }

    static void scheduleCheckIn(Context context, JSONObject payload, ZonedDateTime now) {
        scheduleCheckIn(payload, now, fireAt -> scheduleCheckInAt(context, fireAt));
    }

    static void scheduleCheckIn(JSONObject payload, ZonedDateTime now, Consumer<ZonedDateTime> scheduleAlarm) {
        ZonedDateTime fireAt = ReminderPlanner.nextCheckIn(payload, now);
        if (fireAt == null) return;
        scheduleAlarm.accept(fireAt);
    }

    static void scheduleCheckInAt(Context context, ZonedDateTime fireAt) {
        PendingIntent pending = PendingIntent.getBroadcast(
            context,
            REQUEST_CHECK_IN,
            checkInIntent(context),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        schedule(context, pending, fireAt.toInstant().toEpochMilli());
    }

    static void maybeOpenExactAlarmSettings(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
        Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
            .setData(Uri.parse("package:" + context.getPackageName()))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    /** A launch route waits here until the page can read it, which behind
        a gate is until the unlock. A mood face's route names a mood, and no
        mood waits on the device for an unlock (decision of 2026-11-10), so
        that one is held in memory only: it is lost with the process, and
        the person touches the face again. */
    private static volatile String routeHeldInMemory;

    public static void storeLaunchRoute(Context context, String route) {
        String sanitized = sanitizeLaunchRoute(route);
        if (sanitized == null) return;
        android.content.SharedPreferences.Editor prefs = context
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit();
        if (sanitized.contains("seedMood=")) {
            routeHeldInMemory = sanitized;
            prefs.remove(KEY_LAUNCH_ROUTE).apply();
            return;
        }
        routeHeldInMemory = null;
        prefs.putString(KEY_LAUNCH_ROUTE, sanitized).apply();
    }

    static String consumeLaunchRoute(Context context) {
        String held = routeHeldInMemory;
        routeHeldInMemory = null;
        if (held != null) return sanitizeLaunchRoute(held);
        String route = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LAUNCH_ROUTE, null);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_LAUNCH_ROUTE).apply();
        return sanitizeLaunchRoute(route);
    }

    static String sanitizeLaunchRoute(String route) {
        if (route == null || route.isBlank() || route.charAt(0) != '/') return null;
        if (route.startsWith("//")) return null;
        // A medication reminder's notification:
        // the reminder's id only, which the app resolves to its drug.
        if (route.startsWith("/care/doses?add=1&reminder=")) {
            String reminderId = route.substring("/care/doses?add=1&reminder=".length());
            if (reminderId.isEmpty()) return null;
            for (int i = 0; i < reminderId.length(); i++) {
                char c = reminderId.charAt(i);
                boolean ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-';
                if (!ok) return null;
            }
            return route;
        }
        if (route.startsWith("/settings/reminders")) {
            String suffix = route.substring("/settings/reminders".length());
            if (suffix.isEmpty()) return route;
            if (!suffix.startsWith("/")) return null;
            String reminderId = suffix.substring(1);
            if (reminderId.isBlank()) return null;
            for (int i = 0; i < reminderId.length(); i++) {
                char c = reminderId.charAt(i);
                boolean ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-';
                if (!ok) return null;
            }
            return route;
        }
        // Keep pinned launch routes for external shortcuts.
        if (route.equals("/wrapped/week") || route.equals("/wrapped/month") || route.equals("/wrapped/year")) {
            return route;
        }
        if (route.equals("/on-this-day")) return route;
        if (route.startsWith("/on-this-day?lookback=")) {
            String lookback = route.substring("/on-this-day?lookback=".length());
            boolean known = "month".equals(lookback) || "sixMonths".equals(lookback) || "year".equals(lookback);
            return known ? route : null;
        }
        // The quick-log widget's mood buttons: "today" rather than
        // a computed epoch day, so a PendingIntent built at widget-render time
        // still lands on the right day even if tapped much later - the [day]
        // route resolves "today" live, at navigation time, not at intent-build
        // time. One digit 1-5 only, matching MoodPicker's five mood values.
        if (route.startsWith("/entry/new/today?seedMood=")) {
            String mood = route.substring("/entry/new/today?seedMood=".length());
            return mood.length() == 1 && mood.charAt(0) >= '1' && mood.charAt(0) <= '5' ? route : null;
        }
        // The Safe space widget: the existing /doubt route itself -
        // no query parameter to carry.
        if (route.equals("/doubt")) return route;
        if (!route.startsWith("/entry/new/")) return null;
        String epochDay = route.substring("/entry/new/".length());
        if (epochDay.isBlank() || epochDay.contains("/")) return null;
        for (int i = 0; i < epochDay.length(); i++) {
            char c = epochDay.charAt(i);
            if (c < '0' || c > '9') return null;
        }
        return route;
    }

    private static void scheduleAll(Context context, JSONObject payload, ZonedDateTime now) {
        JSONArray reminders = payload.optJSONArray("reminders");
        if (reminders != null) {
            for (int i = 0; i < reminders.length(); i++) {
                JSONObject reminder = reminders.optJSONObject(i);
                if (reminder != null) scheduleOneReminder(context, payload, reminder, now);
            }
        }
        scheduleCheckIn(context, payload, now);
    }

    private static void cancelAll(Context context, JSONObject payload) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        /* A missing payload used to return here, taking the check-in alarm
           below with it - and that one needs no payload to name, only its
           fixed request code. The reset is where that matters: a reminders
           file that will not parse left a check-in alarm scheduled that
           nothing could reach afterwards. */
        JSONArray reminders = payload == null ? null : payload.optJSONArray("reminders");
        if (reminders != null) {
            for (int i = 0; i < reminders.length(); i++) {
                JSONObject reminder = reminders.optJSONObject(i);
                if (reminder == null) continue;
                String reminderId = reminder.optString("id", "");
                if (reminderId.isBlank()) continue;
                PendingIntent pending = PendingIntent.getBroadcast(
                    context,
                    REQUEST_REMINDER,
                    reminderIntent(context, reminderId),
                    PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
                );
                if (pending != null) {
                    alarmManager.cancel(pending);
                    pending.cancel();
                }
            }
        }

        PendingIntent checkIn = PendingIntent.getBroadcast(
            context,
            REQUEST_CHECK_IN,
            checkInIntent(context),
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        if (checkIn != null) {
            alarmManager.cancel(checkIn);
            checkIn.cancel();
        }
    }

    private static Intent reminderIntent(Context context, String reminderId) {
        return new Intent(context, ReminderAlarmReceiver.class)
            .setAction("dev.engender.app.REMINDER")
            .setData(Uri.parse("engender://reminder/" + Uri.encode(reminderId)))
            .putExtra(EXTRA_KIND, KIND_REMINDER)
            .putExtra(EXTRA_REMINDER_ID, reminderId);
    }

    private static Intent checkInIntent(Context context) {
        return new Intent(context, ReminderAlarmReceiver.class)
            .setAction("dev.engender.app.CHECK_IN")
            .setData(Uri.parse("engender://check-in"))
            .putExtra(EXTRA_KIND, KIND_CHECK_IN);
    }

    private static void schedule(Context context, PendingIntent pending, long triggerAtMillis) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;
        schedule(Build.VERSION.SDK_INT >= Build.VERSION_CODES.S, alarmManager::canScheduleExactAlarms,
            () -> alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pending),
            () -> alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pending));
    }

    static void schedule(boolean requiresPermission, BooleanSupplier canScheduleExact, Runnable exact, Runnable inexact) {
        if (!requiresPermission) {
            exact.run();
            return;
        }
        if (canScheduleExact.getAsBoolean()) {
            try {
                exact.run();
                return;
            } catch (SecurityException revoked) {
                // Permission can be revoked between the check and admission.
            }
        }
        inexact.run();
    }
}
