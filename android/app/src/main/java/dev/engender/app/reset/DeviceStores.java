package dev.engender.app.reset;

import android.content.Context;

import dev.engender.app.backup.AutoExportPlugin;
import dev.engender.app.clipboard.SensitiveClipboard;
import dev.engender.app.quickexit.QuickExitPlugin;
import dev.engender.app.reminders.ReminderScheduler;

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
     *
     * <p>Every one of them literally: a store that throws no longer takes
     * the stores after it down with it. Two of the four can fail now that
     * the reminder payload has a Keystore alias of its own (phase 5 security
     * ticket 02), and the first one to throw used to be the last one that
     * ran - so a keystore that would not delete an alias left the backup
     * destination, the wrapped backup password and the quick-exit
     * preference on a phone the person had just wiped. The first failure is
     * the one raised, with any later one attached to it.
     */
    public static void wipe(Context context) throws Exception {
        Exception failure = null;
        for (Store store : new Store[] {
            ReminderScheduler::wipe,
            AutoExportPlugin::wipe,
            QuickExitPlugin::wipe,
            SensitiveClipboard::wipe
        }) {
            try {
                store.wipe(context);
            } catch (Exception e) {
                if (failure == null) failure = e;
                else failure.addSuppressed(e);
            }
        }
        if (failure != null) throw failure;
    }

    /** What each of the four above is, from here: one call that clears one
        store and says so by throwing. */
    private interface Store {
        void wipe(Context context) throws Exception;
    }
}
