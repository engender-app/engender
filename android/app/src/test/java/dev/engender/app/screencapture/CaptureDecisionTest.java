package dev.engender.app.screencapture;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** What the window carries for each capture choice and disguise state. Disguise
 * hides only the Recents card; screenshots follow the capture choice alone
 *. Android 13 is where the two separate. */
public class CaptureDecisionTest {
    private static final int ANDROID_13 = 33;
    private static final int ANDROID_12 = 32;

    @Test public void captureAllowedAndDisguisedStillAllowsScreenshotsOnAndroid13() {
        assertFalse(ScreenCapturePlugin.windowSecure(ANDROID_13, true, true));
        assertFalse(ScreenCapturePlugin.recentsPreviewShown(true, true));
    }

    @Test public void captureAllowedAndNotDisguisedShowsBothScreenshotsAndRecents() {
        assertFalse(ScreenCapturePlugin.windowSecure(ANDROID_13, true, false));
        assertTrue(ScreenCapturePlugin.recentsPreviewShown(true, false));
    }

    @Test public void captureNotAllowedBlocksScreenshotsAndRecentsWhetherDisguisedOrNot() {
        for (boolean disguised : new boolean[] {false, true}) {
            assertTrue(ScreenCapturePlugin.windowSecure(ANDROID_13, false, disguised));
            assertFalse(ScreenCapturePlugin.recentsPreviewShown(false, disguised));
        }
    }

    @Test public void beforeAndroid13OnlyTheSecureFlagHidesRecentsSoDisguiseKeepsIt() {
        assertTrue(ScreenCapturePlugin.windowSecure(ANDROID_12, true, true));
        assertFalse(ScreenCapturePlugin.windowSecure(ANDROID_12, true, false));
    }
}
