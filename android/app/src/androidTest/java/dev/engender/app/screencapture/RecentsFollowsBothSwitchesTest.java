package dev.engender.app.screencapture;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import android.content.Context;
import android.os.Build;
import android.view.WindowManager;

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

/**
 * GD-045: the Recents card follows both switches. From Android 13 the card is
 * kept only when capture is allowed and the launcher is not disguised
 * (setRecentsScreenshotEnabled); FLAG_SECURE follows capture alone. Before 13
 * FLAG_SECURE is the only lever, so it is set when capture is off or disguise
 * is on. Run on an API 33+ image and on one below 33: each branch asserts the
 * half it owns. The identity change applies the same rule at once, so the
 * card cannot keep a journal screen under the new name.
 */
@RunWith(AndroidJUnit4.class)
public class RecentsFollowsBothSwitchesTest {

    private static final boolean ANDROID_13 = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU;
    private Context context;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.getSharedPreferences(LockTimingPlugin.PREFS, Context.MODE_PRIVATE).edit().clear().commit();
        context.getSharedPreferences(ScreenCapturePlugin.PREFS, Context.MODE_PRIVATE).edit().clear().commit();
        DisguiseAlias.apply(context, false, DisguiseAlias.DEFAULT_PALETTE, "current");
        ScreenCapturePlugin.recentsScreenshotEnabled = null;
    }

    @After
    public void tearDown() {
        DisguiseAlias.apply(context, false, DisguiseAlias.DEFAULT_PALETTE, "current");
    }

    @Test
    public void allFourCombinationsOfCaptureAndDisguise() {
        boolean[] both = {true, false};
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            for (boolean allowed : both) {
                for (boolean disguised : both) {
                    String label = "allowed=" + allowed + " disguised=" + disguised;
                    scenario.onActivity(activity -> {
                        ScreenCapturePlugin.applyWindowFlags(activity, allowed, disguised);
                        boolean secure = isSecure(activity);
                        if (ANDROID_13) {
                            assertEquals(label + " FLAG_SECURE", !allowed, secure);
                            assertEquals(label + " Recents card", allowed && !disguised,
                                ScreenCapturePlugin.recentsScreenshotEnabled);
                        } else {
                            assertEquals(label + " FLAG_SECURE", !allowed || disguised, secure);
                            assertNull(ScreenCapturePlugin.recentsScreenshotEnabled);
                        }
                    });
                }
            }
        }
    }

    @Test
    public void turningDisguiseOnBlanksTheCardAtOnceWithCaptureAllowed() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                ScreenCapturePlugin.applyWindowFlags(activity, true, false);
                ScreenCapturePlugin.recentsScreenshotEnabled = null;

                ScreenCapturePlugin.coverForIdentityChange(activity, true);

                if (ANDROID_13) {
                    assertEquals("the Recents card was left on", Boolean.FALSE,
                        ScreenCapturePlugin.recentsScreenshotEnabled);
                    assertEquals("screenshots must stay allowed", false, isSecure(activity));
                } else {
                    assertEquals("FLAG_SECURE was not set", true, isSecure(activity));
                }
            });
        }
    }

    private static boolean isSecure(MainActivity activity) {
        return (activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0;
    }
}
