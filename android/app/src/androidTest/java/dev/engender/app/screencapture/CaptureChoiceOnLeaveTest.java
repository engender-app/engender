package dev.engender.app.screencapture;

import static org.junit.Assert.assertEquals;

import android.content.Context;
import android.view.WindowManager;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import dev.engender.app.MainActivity;
import dev.engender.app.lock.LockTimingPlugin;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/** The capture choice is the only thing that decides FLAG_SECURE, on leave as
 * well as in the foreground. Needs no WebView, so it also runs on the API 26
 * emulator, where FLAG_SECURE is what hides the Recents preview as well. Both
 * preference files are cleared first: a fresh install allows capture, and
 * older builds treated the cleared lock mirror as a journal with a lock.
 */
@RunWith(AndroidJUnit4.class)
public class CaptureChoiceOnLeaveTest {

    @Before
    public void setUp() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.getSharedPreferences(LockTimingPlugin.PREFS, Context.MODE_PRIVATE).edit().clear().commit();
        context.getSharedPreferences(ScreenCapturePlugin.PREFS, Context.MODE_PRIVATE).edit().clear().commit();
    }

    @Test
    public void allowedCaptureStaysVisibleWhenTheAppIsLeft() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(MainActivity::onUserLeaveHint);
            scenario.onActivity(MainActivity::onPause);
            scenario.onActivity(activity -> assertEquals(false, isSecure(activity)));
            scenario.onActivity(MainActivity::onResume);
            scenario.onActivity(activity -> assertEquals(false, isSecure(activity)));
        }
    }

    @Test
    public void captureNotAllowedStaysHiddenWhenTheAppIsLeftAndReturnedTo() {
        InstrumentationRegistry.getInstrumentation().getTargetContext()
            .getSharedPreferences(ScreenCapturePlugin.PREFS, Context.MODE_PRIVATE)
            .edit().putBoolean("allowed", false).commit();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> assertEquals(true, isSecure(activity)));
            scenario.onActivity(MainActivity::onUserLeaveHint);
            scenario.onActivity(MainActivity::onPause);
            scenario.onActivity(activity -> assertEquals(true, isSecure(activity)));
            scenario.onActivity(MainActivity::onResume);
            scenario.onActivity(activity -> assertEquals(true, isSecure(activity)));
        }
    }

    private static boolean isSecure(MainActivity activity) {
        return (activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0;
    }
}
