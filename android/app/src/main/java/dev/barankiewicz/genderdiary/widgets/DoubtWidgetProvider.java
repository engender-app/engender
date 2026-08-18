package dev.barankiewicz.genderdiary.widgets;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import dev.barankiewicz.genderdiary.R;
import dev.barankiewicz.genderdiary.disguise.DisguiseAlias;
import dev.barankiewicz.genderdiary.launch.AppLaunch;

/**
 * A home-screen widget deep-linking straight into the existing /doubt route
 * (ticket 34): one tap target, no route of its own to hold - the widget
 * opens /doubt via AppLaunch.openAppIntent (generalized in ticket 26 for
 * exactly this reuse), and /doubt already is the composer plus
 * counterevidence in one screen, so there is nothing further for the widget
 * to assemble.
 *
 * <p>Disguise mode follows QuickLogWidgetProvider and TallyWidgetProvider's
 * own pattern rather than a new one: DisguiseAlias's live PackageManager
 * read decides, at render time, whether the header (naming what the button
 * is for) shows at all, and whether the button's contentDescription carries
 * the real label or nothing beyond the "?" glyph already printed on it.
 */
public class DoubtWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        RemoteViews views = buildViews(context);
        for (int id : appWidgetIds) appWidgetManager.updateAppWidget(id, views);
    }

    /** Called from DisguisePlugin.setDisguised right alongside the other
        widgets' updateAll, so an already-placed doubt widget goes neutral
        immediately too, rather than waiting on its own system-scheduled
        update. */
    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, DoubtWidgetProvider.class));
        if (ids.length == 0) return;
        RemoteViews views = buildViews(context);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    /** The route the widget's PendingIntent deep-links to - the existing
        /doubt route itself, unchanged. Mirrored in
        ReminderScheduler.sanitizeLaunchRoute and +layout.svelte's
        isValidAndroidLaunchRoute - both must accept this exact shape or the
        tap silently lands nowhere. */
    static String doubtRoute() {
        return "/doubt";
    }

    /** Mirrors QuickLogWidgetProvider.buttonLabel and
        TallyWidgetProvider.buttonLabel: the real label normally, or nothing
        beyond the glyph already on the button while disguise mode is on - a
        screen reader is as much an at-rest surface as the visible glyph. */
    static String buttonLabel(boolean disguised, String label) {
        return disguised ? null : label;
    }

    private static RemoteViews buildViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_doubt);
        boolean disguised = DisguiseAlias.isDisguised(context);
        views.setViewVisibility(R.id.widget_doubt_header, disguised ? View.GONE : View.VISIBLE);

        String label = buttonLabel(disguised, context.getString(R.string.widget_doubt_title));
        if (label != null) views.setContentDescription(R.id.widget_doubt_button, label);
        views.setOnClickPendingIntent(
            R.id.widget_doubt_button,
            AppLaunch.openAppIntent(context, doubtRoute(), "widget-doubt", 300)
        );
        return views;
    }
}
