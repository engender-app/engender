package dev.barankiewicz.genderdiary.reset;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.security.KeyStore;

import javax.crypto.KeyGenerator;

import dev.barankiewicz.genderdiary.backup.AutoExportPlugin;
import dev.barankiewicz.genderdiary.clipboard.SensitiveClipboard;
import dev.barankiewicz.genderdiary.quickexit.QuickExitPlugin;
import dev.barankiewicz.genderdiary.reminders.ReminderPayloadStore;
import dev.barankiewicz.genderdiary.reminders.ReminderScheduler;

/**
 * Phase 5 security ticket 01, the Android half of "nothing outlives a
 * reset" (F-01), on a device rather than against a fake.
 *
 * <p>Everything here was left behind by the reset as shipped: the reminder
 * titles, the auto-export destination and the Keystore alias its password
 * was wrapped under, and the quick-exit preference. The alias is the one no
 * amount of file deletion reaches - it lives in the platform, not in
 * anything the app owns - so a reset that cleared only the preferences left
 * the password recoverable by anything that could put the ciphertext back.
 *
 * <p>The alarms are the fourth store, and they are asserted where the
 * scheduler that holds them can be reached:
 * {@code ReminderSchedulerStoreTest.wipeCancelsTheAlarmsAndTakesTheTitlesWithThem}.
 */
@RunWith(AndroidJUnit4.class)
public class DeviceStoresTest {

    /* From the classes that write them rather than spelled out again here:
       a copy would keep passing after the app moved its own store. */
    private static final String REMINDERS_PREFS = ReminderScheduler.PREFS;
    private static final String AUTO_EXPORT_PREFS = AutoExportPlugin.PREFS;
    private static final String QUICK_EXIT_PREFS = QuickExitPlugin.PREFS;
    private static final String SENSITIVE_CLIPBOARD_PREFS = SensitiveClipboard.PREFS;
    private static final String PASSWORD_ALIAS = AutoExportPlugin.PASSWORD_ALIAS;
    private static final String REMINDERS_ALIAS = ReminderPayloadStore.ALIAS;

    private Context context;

    @Before
    public void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        DeviceStores.wipe(context);
    }

    @After
    public void tearDown() throws Exception {
        DeviceStores.wipe(context);
    }

    @Test
    public void aResetLeavesNoPreferenceFileBehind() {
        write(REMINDERS_PREFS, "payload-v1", "{\"reminders\":[{\"title\":\"Estradiol patch\"}]}");
        write(AUTO_EXPORT_PREFS, "destinationLabel", "Journal backups");
        write(AUTO_EXPORT_PREFS, "passwordCiphertext", "not-really-a-ciphertext");
        write(QUICK_EXIT_PREFS, "enabled", "true");
        write(SENSITIVE_CLIPBOARD_PREFS, "digest", "bm90LXJlYWxseS1hLWRpZ2VzdA==");

        wipe();

        assertEmpty("the reminder titles are still here", REMINDERS_PREFS);
        assertEmpty("the backup destination is still here", AUTO_EXPORT_PREFS);
        assertEmpty("the quick-exit preference is still here", QUICK_EXIT_PREFS);
        assertEmpty("the pending clipboard clear is still here", SENSITIVE_CLIPBOARD_PREFS);
    }

    @Test
    public void aResetDeletesTheKeystoreAliasTheBackupPasswordWasWrappedUnder() throws Exception {
        createAlias(PASSWORD_ALIAS);
        assertTrue("the alias was not created", aliasExists(PASSWORD_ALIAS));

        wipe();

        assertFalse("the wrapping key survived the reset", aliasExists(PASSWORD_ALIAS));
    }

    @Test
    public void aResetDeletesTheKeystoreAliasTheRemindersWereWrappedUnder() throws Exception {
        /* Phase 5 security ticket 02 (G-02): the reminder payload gained a
           wrapping key of its own, and it leaves for the same reason the
           backup password's does. The ciphertext is only gone because the
           preference file went with it, so a key left behind opens any copy
           of that file taken before the reset. */
        createAlias(REMINDERS_ALIAS);
        assertTrue("the alias was not created", aliasExists(REMINDERS_ALIAS));

        wipe();

        assertFalse("the wrapping key survived the reset", aliasExists(REMINDERS_ALIAS));
    }

    @Test
    public void aResetOnAPhoneWithNothingOnItIsNotAnError() {
        // The reset is also reachable straight after onboarding, before any
        // reminder, destination or password exists.
        wipe();
        wipe();
    }

    private void wipe() {
        try {
            DeviceStores.wipe(context);
        } catch (Exception e) {
            throw new AssertionError("the wipe threw", e);
        }
    }

    private void write(String prefs, String key, String value) {
        context.getSharedPreferences(prefs, Context.MODE_PRIVATE).edit().putString(key, value).commit();
    }

    private void assertEmpty(String message, String prefs) {
        assertTrue(message, context.getSharedPreferences(prefs, Context.MODE_PRIVATE).getAll().isEmpty());
    }

    /** The aliases AutoExportPlugin's PasswordStore and the reminder store
        mint on their first write, under the names they mint them with. Built
        here rather than driven through the plugin because a Plugin needs a
        Capacitor bridge and this test has none - and what the reset owes an
        alias does not depend on which key is under it. */
    private static void createAlias(String alias) throws Exception {
        KeyGenerator keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        keyGenerator.init(
            new KeyGenParameterSpec.Builder(
                alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(false)
                .build());
        keyGenerator.generateKey();
    }

    private static boolean aliasExists(String alias) throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        return keyStore.containsAlias(alias);
    }
}
