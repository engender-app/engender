package dev.engender.app.clipboard;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.SharedPreferences;
import android.content.Context;
import android.os.PersistableBundle;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.TimeUnit;

import dev.engender.app.MainActivity;

/**
 * The three acceptance boxes for a self-clearing clipboard, against the
 * device's real clipboard: the clip is marked sensitive, the key is gone
 * again after the interval, and something copied after the key survives.
 *
 * Everything happens inside an ActivityScenario, and that is load-bearing
 * rather than scaffolding. From Android 10 the clipboard answers only an app
 * that has focus, so without a launched activity every read here would come
 * back null and every assertion would pass without touching the clipboard at
 * all.
 *
 * The clear is checked at an interval of a few hundred milliseconds rather
 * than the minute the app asks for, since the interval is the caller's to
 * name.
 */
@RunWith(AndroidJUnit4.class)
public class SensitiveClipboardTest {

    private static final String KEY = "K7QF-2M9X-BTRW-4HDC-8PNZ";
    private static final long CLEAR_AFTER_MS = 300;

    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    @After
    public void tearDown() {
        onMainThread(() -> SensitiveClipboard.forget(context));
        onMainThread(() -> clipboard().setPrimaryClip(ClipData.newPlainText("", "")));
    }

    @Test
    public void marksTheClipSensitiveSoTheKeyboardHistoryNeverSeesIt() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            copyTheKey();

            ClipDescription description = clipboard().getPrimaryClipDescription();
            assertNotNull("the clipboard would not answer a focused app", description);
            PersistableBundle extras = description.getExtras();
            assertNotNull("the clip carries no extras, so nothing marks it sensitive", extras);
            assertTrue(
                "EXTRA_IS_SENSITIVE is not set, so the keyboard would keep the key in its history",
                extras.getBoolean(ClipDescription.EXTRA_IS_SENSITIVE));
            assertEquals(KEY, textOnClipboard());
        }
    }

    @Test
    public void takesTheKeyBackOffTheClipboardAfterTheInterval() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            copyTheKey();
            assertEquals(KEY, textOnClipboard());

            assertTrue(
                "the key was still on the clipboard after the interval",
                awaitClipboardWithout(KEY));
        }
    }

    @Test
    public void leavesSomethingCopiedAfterTheKeyWhereItIs() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            copyTheKey();
            onMainThread(
                () -> clipboard().setPrimaryClip(ClipData.newPlainText("", "an address, hers")));

            /* Past the interval by a margin, and then some: the clear is
               posted for the deadline and asked again at every resume, so a
               single sleep is not proof on its own. */
            Thread.sleep(CLEAR_AFTER_MS * 4);
            onMainThread(() -> SensitiveClipboard.clearIfDue(context));

            assertEquals("an address, hers", textOnClipboard());
        }
    }

    /* The pending clear is written down rather than held in a field, because
       Android may kill this process while the person is pasting the key
       somewhere else. What a new process reads is asserted here directly: a
       digest of the key and a deadline, and nothing that a stolen copy of the
       preference file could turn back into the characters. */
    @Test
    public void writesThePendingClearDownWhereANewProcessWillFindIt() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            copyTheKey();

            SharedPreferences prefs =
                context.getSharedPreferences(SensitiveClipboard.PREFS, Context.MODE_PRIVATE);
            String digest = prefs.getString("digest", null);
            assertNotNull("nothing was written down, so a killed process forgets the clear", digest);
            assertFalse("the key itself is in the preference file", digest.contains(KEY));
            assertTrue("no deadline was written down", prefs.getLong("dueAtRealtime", 0) > 0);

            /* And what a new process does with it: clearIfDue is what the
               plugin calls at load, with no field left over from the copy. */
            assertTrue(awaitClipboardWithout(KEY));
            assertNull("the record outlived the clear it asked for", prefs.getString("digest", null));
        } catch (InterruptedException e) {
            throw new AssertionError(e);
        }
    }

    @Test public void aClipboardRecordFromAnEarlierBootExpiresImmediately() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            onMainThread(() -> SensitiveClipboard.copy(context, KEY, 60_000));
            SharedPreferences prefs = context.getSharedPreferences(SensitiveClipboard.PREFS, Context.MODE_PRIVATE);
            prefs.edit().putInt("bootCount", -1).putLong("dueAtRealtime", Long.MAX_VALUE).commit();
            onMainThread(() -> SensitiveClipboard.clearIfDue(context));
            assertFalse(KEY.equals(textOnClipboard()));
            assertNull(prefs.getString("digest", null));
        }
    }

    /* The reset used to delete the record of the pending clear and leave the key on the
       clipboard, where nothing would ever take it off. */
    @Test
    public void aResetTakesTheKeyOffTheClipboardAndDropsTheClear() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            onMainThread(() -> SensitiveClipboard.copy(context, KEY, 60_000));
            assertEquals(KEY, textOnClipboard());

            dev.engender.app.reset.DeviceStores.wipe(context);

            assertFalse("the reset left the key on the clipboard", KEY.equals(textOnClipboard()));
            SharedPreferences prefs = context.getSharedPreferences(SensitiveClipboard.PREFS, Context.MODE_PRIVATE);
            assertTrue("the pending clear survived the reset", prefs.getAll().isEmpty());
        }
    }

    @Test
    public void aResetLeavesNewerClipboardContentWhereItIs() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            onMainThread(() -> SensitiveClipboard.copy(context, KEY, 60_000));
            onMainThread(() -> clipboard().setPrimaryClip(ClipData.newPlainText("", "an address, hers")));

            dev.engender.app.reset.DeviceStores.wipe(context);

            assertEquals("an address, hers", textOnClipboard());
        }
    }

    /* The timer armed by the copy is the second way the clipboard gets
       cleared. After a reset it must neither fire into something copied
       later nor be left pending. */
    @Test
    public void theTimerArmedBeforeAResetDoesNotTouchWhatIsCopiedAfterIt() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            copyTheKey();
            dev.engender.app.reset.DeviceStores.wipe(context);
            onMainThread(() -> clipboard().setPrimaryClip(ClipData.newPlainText("", KEY)));

            Thread.sleep(CLEAR_AFTER_MS * 4);

            assertEquals("the old timer cleared a later copy", KEY, textOnClipboard());
        }
    }

    private void copyTheKey() {
        onMainThread(() -> SensitiveClipboard.copy(context, KEY, CLEAR_AFTER_MS));
    }

    /** Polls rather than sleeping once, because the clear is posted to the
        main looper and the test thread is not it. */
    private boolean awaitClipboardWithout(String value) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            if (!value.equals(textOnClipboard())) return true;
            Thread.sleep(50);
        }
        return false;
    }

    private String textOnClipboard() {
        ClipData clip = clipboard().getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) return null;
        CharSequence text = clip.getItemAt(0).getText();
        return text == null ? null : text.toString();
    }

    private ClipboardManager clipboard() {
        return (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
    }

    private void onMainThread(Runnable work) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(work);
    }
}
