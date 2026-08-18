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
 * Pins {@link DoubtWidgetProvider#buildViews}'s rendered output before
 * ticket 06's base-class extraction, on a device: header visibility and the
 * button's content description under both disguise states. This is the
 * baseline the refactor is required to reproduce exactly.
 */
@RunWith(AndroidJUnit4.class)
public class DoubtWidgetProviderRenderTest {

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
    public void undisguisedShowsTheHeaderAndTheLabel() {
        View widget = inflate();

        assertEquals(View.VISIBLE, widget.findViewById(R.id.widget_doubt_header).getVisibility());
        assertEquals("Log a doubt", widget.findViewById(R.id.widget_doubt_button).getContentDescription());
    }

    @Test
    public void disguisedHidesTheHeaderAndDropsTheLabel() {
        DisguiseAlias.apply(context, true);

        View widget = inflate();

        assertEquals(View.GONE, widget.findViewById(R.id.widget_doubt_header).getVisibility());
        assertNull(widget.findViewById(R.id.widget_doubt_button).getContentDescription());
    }

    private View inflate() {
        RemoteViews views = new DoubtWidgetProvider().buildViews(context);
        return views.apply(context, new FrameLayout(context));
    }
}
