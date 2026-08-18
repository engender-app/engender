package dev.barankiewicz.genderdiary.widgets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import android.content.Context;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import dev.barankiewicz.genderdiary.R;
import dev.barankiewicz.genderdiary.disguise.DisguiseAlias;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Pins {@link TallyWidgetProvider#buildViews}'s rendered output before
 * ticket 06's base-class extraction, on a device: header visibility and
 * every button's content description under both disguise states. This is
 * the baseline the refactor is required to reproduce exactly.
 */
@RunWith(AndroidJUnit4.class)
public class TallyWidgetProviderRenderTest {

    private Context context;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        DisguiseAlias.apply(context, false);
    }

    @After
    public void tearDown() {
        DisguiseAlias.apply(context, false);
    }

    @Test
    public void undisguisedShowsTheHeaderAndTheLabels() {
        View widget = inflate();

        assertEquals(View.VISIBLE, widget.findViewById(R.id.widget_tally_header).getVisibility());
        assertEquals("Misgendered", widget.findViewById(R.id.widget_tally_misgendered).getContentDescription());
        assertEquals("Correctly gendered", widget.findViewById(R.id.widget_tally_correct).getContentDescription());
    }

    @Test
    public void disguisedHidesTheHeaderAndDropsTheLabels() {
        DisguiseAlias.apply(context, true);

        View widget = inflate();

        assertEquals(View.GONE, widget.findViewById(R.id.widget_tally_header).getVisibility());
        assertNull(widget.findViewById(R.id.widget_tally_misgendered).getContentDescription());
        assertNull(widget.findViewById(R.id.widget_tally_correct).getContentDescription());
    }

    private View inflate() {
        RemoteViews views = TallyWidgetProvider.buildViews(context);
        return views.apply(context, new FrameLayout(context));
    }
}
