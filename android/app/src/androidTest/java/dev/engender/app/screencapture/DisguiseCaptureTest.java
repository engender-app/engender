package dev.engender.app.screencapture;

import static org.junit.Assert.assertEquals;

import android.content.Context;
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

/** FA 43: while the launcher is disguised the window is secure even though
 * the stored capture choice allows capture, so the Recents card shows no
 * journal under "Notes". The stored choice survives and applies again once
 * disguise is off. Launches MainActivity directly, so flipping the aliases
 * with DONT_KILL_APP tears down no task this test runs in.
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
    public void disguiseHidesTheWindowThoughCaptureIsAllowed() {
        DisguiseAlias.apply(context, true, DisguiseAlias.DEFAULT_PALETTE, "current");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> assertEquals(true, isSecure(activity)));
            scenario.onActivity(MainActivity::onUserLeaveHint);
            scenario.moveToState(Lifecycle.State.CREATED);
            scenario.onActivity(activity -> assertEquals(true, isSecure(activity)));
            scenario.moveToState(Lifecycle.State.RESUMED);
            scenario.onActivity(activity -> assertEquals(true, isSecure(activity)));
        }
        assertEquals(true, ScreenCapturePlugin.isAllowed(context));
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
