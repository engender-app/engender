package dev.engender.app.widgets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import android.content.Context;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import dev.engender.app.R;
import dev.engender.app.disguise.DisguiseAlias;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Pins {@link QuickLogWidgetProvider#buildViews}'s rendered output before a
 * base-class extraction, on a device: header visibility and every button's
 * content description under both disguise states. This is the baseline the
 * refactor is required to reproduce exactly.
 */
@RunWith(AndroidJUnit4.class)
public class QuickLogWidgetProviderRenderTest {

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
    public void undisguisedShowsTheHeaderAndTheMoodNames() {
        View widget = inflate();

        assertEquals(View.VISIBLE, widget.findViewById(R.id.widget_header).getVisibility());
        assertEquals("Awful", widget.findViewById(R.id.widget_mood_1).getContentDescription());
        assertEquals("Bad", widget.findViewById(R.id.widget_mood_2).getContentDescription());
        assertEquals("Meh", widget.findViewById(R.id.widget_mood_3).getContentDescription());
        assertEquals("Good", widget.findViewById(R.id.widget_mood_4).getContentDescription());
        assertEquals("Great", widget.findViewById(R.id.widget_mood_5).getContentDescription());
    }

    @Test
    public void disguisedHidesTheHeaderAndDropsTheMoodNames() {
        DisguiseAlias.apply(context, true);

        View widget = inflate();

        assertEquals(View.GONE, widget.findViewById(R.id.widget_header).getVisibility());
        assertNull(widget.findViewById(R.id.widget_mood_1).getContentDescription());
        assertNull(widget.findViewById(R.id.widget_mood_5).getContentDescription());
    }

    private View inflate() {
        RemoteViews views = new QuickLogWidgetProvider().buildViews(context);
        return views.apply(context, new FrameLayout(context));
    }
}
