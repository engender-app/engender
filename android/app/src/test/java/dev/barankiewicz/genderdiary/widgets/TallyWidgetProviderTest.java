package dev.barankiewicz.genderdiary.widgets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/**
 * The tally widget's two pure decisions (ticket 33), mirroring
 * QuickLogWidgetProviderTest: which route each button points at, and what
 * its accessible label reads as under disguise mode. RemoteViews assembly
 * and the PackageManager read need a real Android runtime, so they aren't
 * covered here.
 */
public class TallyWidgetProviderTest {

    @Test
    public void tallyRouteMatchesTheNativeAndJsAllowlists() {
        assertEquals("/?tally=misgendered", TallyWidgetProvider.tallyRoute("misgendered"));
        assertEquals("/?tally=correctly_gendered", TallyWidgetProvider.tallyRoute("correctly_gendered"));
    }

    @Test
    public void buttonLabelIsTheRealLabelWhenNotDisguised() {
        assertEquals("Misgendered", TallyWidgetProvider.buttonLabel(false, "Misgendered"));
    }

    @Test
    public void buttonLabelDropsTheLabelWhenDisguised() {
        assertNull(TallyWidgetProvider.buttonLabel(true, "Misgendered"));
    }
}
