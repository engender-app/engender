package dev.barankiewicz.genderdiary.widgets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/**
 * The quick-log widget's two pure decisions (ticket 26): which route each
 * mood button points at, and what its accessible label reads as under
 * disguise mode. Everything else about the widget (RemoteViews, disguise's
 * live PackageManager read) needs a real Android runtime; these two do not.
 */
public class QuickLogWidgetProviderTest {

    @Test
    public void moodRouteMatchesTheNativeAndJsAllowlists() {
        assertEquals("/entry/new/today?seedMood=1", QuickLogWidgetProvider.moodRoute(1));
        assertEquals("/entry/new/today?seedMood=5", QuickLogWidgetProvider.moodRoute(5));
    }

    @Test
    public void buttonLabelIsTheMoodNameWhenNotDisguised() {
        assertEquals("Awful", QuickLogWidgetProvider.buttonLabel(false, "Awful"));
    }

    @Test
    public void buttonLabelDropsTheMoodNameWhenDisguised() {
        assertNull(QuickLogWidgetProvider.buttonLabel(true, "Awful"));
    }
}
