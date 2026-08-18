package dev.barankiewicz.genderdiary.widgets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/**
 * The doubt-entry widget's two pure decisions (ticket 34), mirroring
 * TallyWidgetProviderTest: the route its single tap target points at, and
 * what its accessible label reads as under disguise mode. RemoteViews
 * assembly and the PackageManager read need a real Android runtime, so they
 * aren't covered here.
 */
public class DoubtWidgetProviderTest {

    @Test
    public void doubtRouteMatchesTheNativeAndJsAllowlists() {
        assertEquals("/doubt", DoubtWidgetProvider.doubtRoute());
    }

    @Test
    public void buttonLabelIsTheRealLabelWhenNotDisguised() {
        assertEquals("Log a doubt", DoubtWidgetProvider.buttonLabel(false, "Log a doubt"));
    }

    @Test
    public void buttonLabelDropsTheLabelWhenDisguised() {
        assertNull(DoubtWidgetProvider.buttonLabel(true, "Log a doubt"));
    }
}
