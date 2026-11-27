package dev.engender.app.widgets;

import android.content.Context;

import java.util.Collections;
import java.util.List;

import dev.engender.app.R;

/**
 * A home-screen widget deep-linking straight into Safe space, the existing
 * /doubt route: one tap target, no route of its own to hold - the widget
 * opens /doubt via AppLaunch.openAppIntent. Safe space is a place to read,
 * not to write (ADR-0037 retired its free-write entry): it opens on a
 * breathing exercise with good moments, the comfort list and the resources
 * one tap away, so there is nothing further for the widget to assemble.
 *
 * <p>Disguise mode is handled once by {@link DisguisableWidgetProvider}.
 */
public class DoubtWidgetProvider extends DisguisableWidgetProvider {

    @Override
    int layoutId() {
        return R.layout.widget_doubt;
    }

    @Override
    int headerViewId() {
        return R.id.widget_doubt_header;
    }

    @Override
    List<ButtonSpec> buttons(Context context) {
        String label = context.getString(R.string.widget_doubt_title);
        return Collections.singletonList(new ButtonSpec(R.id.widget_doubt_button, label, doubtRoute(), "widget-doubt", 300));
    }

    /** The route the widget's PendingIntent deep-links to - the existing
        /doubt route itself, unchanged. Pinned against
        src/lib/android/launch-routes.ts by the shared fixture at
        src/lib/android/fixtures/launch-routes.json (ADR-0028). */
    static String doubtRoute() {
        return "/doubt";
    }
}
