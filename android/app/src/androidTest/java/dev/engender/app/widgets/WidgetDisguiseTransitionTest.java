package dev.engender.app.widgets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.res.Configuration;
import android.os.LocaleList;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import java.util.List;
import java.util.Locale;

import dev.engender.app.disguise.DisguiseAlias;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Checks launcher-style updates on the same view hierarchy. */
@RunWith(AndroidJUnit4.class)
public class WidgetDisguiseTransitionTest {
    private Context context;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        DisguiseAlias.apply(context, false, DisguiseAlias.DEFAULT_PALETTE, "current");
    }

    @After
    public void tearDown() {
        DisguiseAlias.apply(context, false, DisguiseAlias.DEFAULT_PALETTE, "current");
    }

    @Test
    public void quickLogClearsAndRestoresExistingLabels() {
        assertTransitions(new QuickLogWidgetProvider());
    }

    @Test
    public void tallyClearsAndRestoresExistingLabels() {
        assertTransitions(new TallyWidgetProvider());
    }

    @Test
    public void doubtClearsAndRestoresExistingLabels() {
        assertTransitions(new DoubtWidgetProvider());
    }

    private void assertTransitions(DisguisableWidgetProvider provider) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            for (String language : new String[] { "en", "pl" }) {
                Configuration configuration = new Configuration(context.getResources().getConfiguration());
                configuration.setLocales(new LocaleList(Locale.forLanguageTag(language)));
                Context localized = context.createConfigurationContext(configuration);
                List<DisguisableWidgetProvider.ButtonSpec> buttons = provider.buttons(localized);
                View widget = provider.buildViews(localized).apply(localized, new FrameLayout(localized));
                String[] glyphs = new String[buttons.size()];
                int[] widths = new int[buttons.size()];
                int[] heights = new int[buttons.size()];
                for (int i = 0; i < buttons.size(); i++) {
                    TextView button = widget.findViewById(buttons.get(i).viewId);
                    glyphs[i] = button.getText().toString();
                    widths[i] = button.getMinimumWidth();
                    heights[i] = button.getMinimumHeight();
                    assertEquals(buttons.get(i).label, button.getContentDescription());
                }

                for (int toggle = 0; toggle < 4; toggle++) {
                    boolean disguised = toggle % 2 == 0;
                    DisguiseAlias.apply(context, disguised, DisguiseAlias.DEFAULT_PALETTE, "current");
                    provider.buildViews(localized).reapply(localized, widget);
                    assertEquals(disguised ? View.GONE : View.VISIBLE,
                        widget.findViewById(provider.headerViewId()).getVisibility());
                    for (int i = 0; i < buttons.size(); i++) {
                        TextView button = widget.findViewById(buttons.get(i).viewId);
                        if (disguised) assertNull(button.getContentDescription());
                        else assertEquals(buttons.get(i).label, button.getContentDescription());
                        assertEquals(glyphs[i], button.getText().toString());
                        assertEquals(widths[i], button.getMinimumWidth());
                        assertEquals(heights[i], button.getMinimumHeight());
                        assertTrue(button.hasOnClickListeners());
                    }
                }
            }
        });
    }
}
