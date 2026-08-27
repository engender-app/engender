package dev.barankiewicz.genderdiary.reset;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.security.KeyStore;

import javax.crypto.KeyGenerator;

import dev.barankiewicz.genderdiary.backup.AutoExportPlugin;
import dev.barankiewicz.genderdiary.quickexit.QuickExitPlugin;
import dev.barankiewicz.genderdiary.reminders.ReminderAlarmReceiver;
import dev.barankiewicz.genderdiary.reminders.ReminderScheduler;

/**
 * Phase 5 security ticket 01, the Android half of "nothing outlives a
 * reset" (F-01), on a device rather than against a fake.
 *
 * <p>Everything here was left behind by the reset as shipped: the reminder
 * titles and the alarms carrying them, the auto-export destination and the
 * Keystore alias its password was wrapped under, and the quick-exit
 * preference. The Keystore alias is the one no unit test could ever have
 * caught - it lives in the platform, not in a file the app owns.
 */
@RunWith(AndroidJUnit4.class)
public class DeviceStoresTest {

    private static final String REMINDER_ID = "r-1";
    /* From the classes that write them, not spelled out again here: a copy
       would keep passing after the app moved its own store. */
    private static final String REMINDERS_PREFS = ReminderScheduler.PREFS;
    private static final String AUTO_EXPORT_PREFS = AutoExportPlugin.PREFS;
    private static final String QUICK_EXIT_PREFS = QuickExitPlugin.PREFS;
    private static final String PASSWORD_ALIAS = AutoExportPlugin.PASSWORD_ALIAS;

    private Context context;

    @Before
    public void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        clearEverything();
    }

    @After
    public void tearDown() throws Exception {
        clearEverything();
    }

    @Test
    public void aResetLeavesNoPreferenceFileBehind() throws Exception {
        ReminderScheduler.saveAndSchedule(context, payload());
        context.getSharedPreferences(AUTO_EXPORT_PREFS, Context.MODE_PRIVATE).edit()
            .putString("destinationLabel", "Journal backups")
            .putString("passwordCiphertext", "not-really-a-ciphertext")
            .commit();
        context.getSharedPreferences(QUICK_EXIT_PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("enabled", true)
            .commit();

        DeviceStores.wipe(context);

        assertTrue(
            "the reminder titles are still here",
            context.getSharedPreferences(REMINDERS_PREFS, Context.MODE_PRIVATE).getAll().isEmpty());
        assertTrue(
            "the backup destination is still here",
            context.getSharedPreferences(AUTO_EXPORT_PREFS, Context.MODE_PRIVATE).getAll().isEmpty());
        assertTrue(
            "the quick-exit preference is still here",
            context.getSharedPreferences(QUICK_EXIT_PREFS, Context.MODE_PRIVATE).getAll().isEmpty());
        assertNull(ReminderScheduler.loadPayload(context));
    }

    @Test
    public void aResetLeavesNoAlarmBehind() throws Exception {
        ReminderScheduler.saveAndSchedule(context, payload());
        assertTrue("nothing was scheduled to begin with", reminderAlarmExists());

        DeviceStores.wipe(context);

        /* A live PendingIntent is what AlarmManager holds; when the last
           reference goes, FLAG_NO_CREATE stops finding one. A wiped phone
           that keeps posting the person's own reminder titles on schedule
           is the shape of this defect, and the app is not there to cancel
           them on the next open if there is no next open. */
        assertFalse("an alarm is still scheduled", reminderAlarmExists());
    }

    @Test
    public void aResetDeletesTheKeystoreAliasTheBackupPasswordWasWrappedUnder() throws Exception {
        createPasswordAlias();
        assertTrue("the alias was not created", aliasExists());

        DeviceStores.wipe(context);

        /* Without this the wrapped password stays recoverable after a wipe:
           the ciphertext is only gone because a preference file went with
           it, and anything that can put those bytes back can read the
           password again. */
        assertFalse("the wrapping key survived the reset", aliasExists());
    }

    @Test
    public void aResetOnAPhoneWithNothingOnItIsNotAnError() throws Exception {
        // The reset is also reachable straight after onboarding, before any
        // reminder, destination or password exists.
        DeviceStores.wipe(context);
        DeviceStores.wipe(context);
    }

    private boolean reminderAlarmExists() {
        Intent intent = new Intent(context, ReminderAlarmReceiver.class)
            .setAction("dev.barankiewicz.genderdiary.REMINDER")
            .setData(Uri.parse("genderdiary://reminder/" + Uri.encode(REMINDER_ID)))
            .putExtra("kind", "reminder")
            .putExtra("reminderId", REMINDER_ID);
        PendingIntent pending = PendingIntent.getBroadcast(
            context, 41, intent, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        return pending != null;
    }

    /** The same alias AutoExportPlugin's PasswordStore mints on the first
        setPassword, under the name it mints it with. Built here rather than
        driven through the plugin because a Plugin needs a Capacitor bridge
        and this test has none - and what the reset must do to the alias
        does not depend on which key is under it. */
    private static void createPasswordAlias() throws Exception {
        KeyGenerator keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        keyGenerator.init(
            new KeyGenParameterSpec.Builder(
                PASSWORD_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(false)
                .build());
        keyGenerator.generateKey();
    }

    private static boolean aliasExists() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        return keyStore.containsAlias(PASSWORD_ALIAS);
    }

    private void clearEverything() throws Exception {
        DeviceStores.wipe(context);
    }

    private JSONObject payload() throws Exception {
        return new JSONObject()
            .put("reminders", new JSONArray().put(new JSONObject()
                .put("id", REMINDER_ID)
                .put("title", "Estradiol patch")
                .put("type", "med")
                .put("time", "20:00")
                .put("recurrence", "DAILY")
                .put("enabled", true)))
            .put("checkInEnabled", false)
            .put("checkInTime", "21:00")
            .put("latestEntryEpochDay", JSONObject.NULL)
            .put("texts", new JSONObject()
                .put("channelReminders", "Reminders")
                .put("channelCheckIn", "Check-in")
                .put("checkInTitle", "Daily check-in")
                .put("checkInBody", "How are you today?"));
    }
}
