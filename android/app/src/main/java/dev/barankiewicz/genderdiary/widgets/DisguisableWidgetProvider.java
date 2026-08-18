package dev.barankiewicz.genderdiary.widgets;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import java.util.List;

import dev.barankiewicz.genderdiary.disguise.DisguiseAlias;
import dev.barankiewicz.genderdiary.launch.AppLaunch;

/**
 * What every quick-log, tally and doubt-entry widget (tickets 26, 33, 34)
 * shares: a single-view RemoteViews rebuilt whole on every update, and the
 * disguise invariant - a screen reader is as much an at-rest surface as the
 * visible glyph, so while disguise mode is on the header that names what the
 * buttons are for is hidden outright, and each button's contentDescription
 * carries nothing beyond the glyph already printed on it. A subclass
 * declares only what is genuinely its own: its layout, its header view, and
 * its buttons' ids/labels/routes.
 */
public abstract class DisguisableWidgetProvider extends AppWidgetProvider {

    /** One button's view id, its real label, and the route its tap deep-links
        to. Route shapes are cases in the shared launch-route fixture
        (src/lib/android/fixtures/launch-routes.json, ADR-0028). */
    static final class ButtonSpec {
        final int viewId;
        final String label;
        final String route;
        final String key;
        final int requestCode;

        ButtonSpec(int viewId, String label, String route, String key, int requestCode) {
            this.viewId = viewId;
            this.label = label;
            this.route = route;
            this.key = key;
            this.requestCode = requestCode;
        }
    }

    abstract int layoutId();

    abstract int headerViewId();

    abstract List<ButtonSpec> buttons(Context context);

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        RemoteViews views = buildViews(context);
        for (int id : appWidgetIds) appWidgetManager.updateAppWidget(id, views);
    }

    /** Called from DisguisePlugin.setDisguised right after the launcher alias
        flips, so an already-placed widget goes neutral immediately rather
        than waiting for the next system-scheduled onUpdate. */
    public void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, getClass()));
        if (ids.length == 0) return;
        RemoteViews views = buildViews(context);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    /** What a button's accessible label reads as: its real label normally,
        or nothing beyond the glyph already printed on it while disguise mode
        is on. */
    static String buttonLabel(boolean disguised, String label) {
        return disguised ? null : label;
    }

    RemoteViews buildViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layoutId());
        boolean disguised = DisguiseAlias.isDisguised(context);
        views.setViewVisibility(headerViewId(), disguised ? View.GONE : View.VISIBLE);

        for (ButtonSpec button : buttons(context)) {
            String label = buttonLabel(disguised, button.label);
            if (label != null) views.setContentDescription(button.viewId, label);
            views.setOnClickPendingIntent(
                button.viewId,
                AppLaunch.openAppIntent(context, button.route, button.key, button.requestCode)
            );
        }
        return views;
    }
}
