package dev.engender.app.screencapture;

import static org.junit.Assert.assertEquals;

import android.content.Context;
import android.os.Build;
import android.view.WindowManager;

import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import dev.engender.app.MainActivity;
import dev.engender.app.disguise.DisguiseAlias;
import dev.engender.app.lock.LockTimingPlugin;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/** While the launcher is disguised the window follows the stored capture
 * choice: capture allowed leaves it capturable (screenshots work), capture off
 * keeps FLAG_SECURE. The Recents card is hidden by disguise from Android 13
 * through setRecentsScreenshotEnabled, which CaptureDecisionTest covers;
 * before 13 the secure flag stays on under disguise. Launches MainActivity
 * directly, so flipping the aliases with DONT_KILL_APP tears down no task
 * this test runs in.
 */
@RunWith(AndroidJUnit4.class)
public class DisguiseCaptureTest {

    private Context context;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.getSharedPreferences(LockTimingPlugin.PREFS, Context.MODE_PRIVATE).edit().clear().commit();
        context.getSharedPreferences(ScreenCapturePlugin.PREFS, Context.MODE_PRIVATE).edit().clear().commit();
        DisguiseAlias.apply(context, false, DisguiseAlias.DEFAULT_PALETTE, "current");
    }

    @After
    public void tearDown() {
        DisguiseAlias.apply(context, false, DisguiseAlias.DEFAULT_PALETTE, "current");
    }

    @Test
    public void disguiseLeavesTheWindowCapturableWhenCaptureIsAllowed() {
        DisguiseAlias.apply(context, true, DisguiseAlias.DEFAULT_PALETTE, "current");
        boolean secureExpected = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> assertEquals(secureExpected, isSecure(activity)));
            scenario.onActivity(MainActivity::onUserLeaveHint);
            scenario.moveToState(Lifecycle.State.CREATED);
            scenario.onActivity(activity -> assertEquals(secureExpected, isSecure(activity)));
            scenario.moveToState(Lifecycle.State.RESUMED);
            scenario.onActivity(activity -> assertEquals(secureExpected, isSecure(activity)));
        }
        assertEquals(true, ScreenCapturePlugin.isAllowed(context));
    }

    @Test
    public void disguiseKeepsTheWindowSecureWhenCaptureIsOff() {
        DisguiseAlias.apply(context, true, DisguiseAlias.DEFAULT_PALETTE, "current");
        context.getSharedPreferences(ScreenCapturePlugin.PREFS, Context.MODE_PRIVATE).edit().putBoolean("allowed", false).commit();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> assertEquals(true, isSecure(activity)));
        }
    }

    @Test
    public void theCaptureChoiceReturnsWhenDisguiseGoesOff() {
        DisguiseAlias.apply(context, true, DisguiseAlias.DEFAULT_PALETTE, "current");
        DisguiseAlias.apply(context, false, DisguiseAlias.DEFAULT_PALETTE, "current");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> assertEquals(false, isSecure(activity)));
        }
    }

    private static boolean isSecure(MainActivity activity) {
        return (activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0;
    }
}
