package dev.barankiewicz.genderdiary.reset;

import android.content.Context;

import dev.barankiewicz.genderdiary.backup.AutoExportPlugin;
import dev.barankiewicz.genderdiary.quickexit.QuickExitPlugin;
import dev.barankiewicz.genderdiary.reminders.ReminderScheduler;

/**
 * What this app leaves on a phone that is neither the journal nor in the
 * WebView's storage (phase 5 security ticket 01, ADR-0014).
 *
 * <p>{@code src/lib/data/reset.ts} already had the two halves that are the
 * journal - the database file and the Keystore-wrapped data key - and
 * nothing else. What survived a reset was everything the app writes
 * alongside it: the reminder titles and times, the auto-export destination
 * and its wrapped password, whether quick exit was on, and the alarms
 * themselves, which kept posting the person's own reminder titles on a
 * phone they had just wiped.
 *
 * <p>Each store is cleared by the class that writes it rather than by a
 * list of preference file names here, so a store that moves or gains a
 * second file moves with its owner. This class is only the order they go
 * in, and the one call the WebView makes.
 */
public final class DeviceStores {
    private DeviceStores() {}

    /**
     * Every one of them, or an exception. Nothing is swallowed: the reset
     * screen states the loss before it happens, and a wipe that half
     * happened has to reach {@code wipeLocalData} as a failure rather than
     * as a reset the person is told went through.
     */
    public static void wipe(Context context) throws Exception {
        ReminderScheduler.wipe(context);
        AutoExportPlugin.wipe(context);
        QuickExitPlugin.wipe(context);
    }
}
