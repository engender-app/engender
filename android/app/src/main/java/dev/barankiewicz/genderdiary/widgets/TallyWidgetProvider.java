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
 * A home-screen widget offering one-tap tally logging (ticket 33): two
 * buttons, misgendering and correct-gendering, mirroring Home's own tally
 * card (ticket 10). Neither button opens a route of its own - both
 * deep-link (AppLaunch.openAppIntent, pulled out for exactly this reuse in
 * ticket 26) to Home with a `tally` query parameter, which Home reads once
 * on mount and logs through the same journal.tally.log call the in-app
 * buttons use, then clears (src/routes/+page.svelte).
 *
 * <p>Disguise mode follows QuickLogWidgetProvider's own pattern rather than
 * a new one: DisguiseAlias's live PackageManager read decides, at render
 * time, whether the header (naming what the buttons are for) shows at all,
 * and whether each button's contentDescription carries the real label or
 * nothing beyond the glyph already printed on it.
 */
public class TallyWidgetProvider extends AppWidgetProvider {

    private static final String[] KINDS = { "misgendered", "correctly_gendered" };
    private static final int[] BUTTON_IDS = { R.id.widget_tally_misgendered, R.id.widget_tally_correct };

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        RemoteViews views = buildViews(context);
        for (int id : appWidgetIds) appWidgetManager.updateAppWidget(id, views);
    }

    /** Called from DisguisePlugin.setDisguised right alongside
        QuickLogWidgetProvider.updateAll, so an already-placed tally widget
        goes neutral immediately too, rather than waiting on its own
        system-scheduled update. */
    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TallyWidgetProvider.class));
        if (ids.length == 0) return;
        RemoteViews views = buildViews(context);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    /** The route a tally button's PendingIntent deep-links to - Home itself,
        carrying the kind as a query parameter it reads once and clears,
        rather than a route belonging to this widget. Mirrored in
        ReminderScheduler.sanitizeLaunchRoute and +layout.svelte's
        isValidAndroidLaunchRoute - both must accept this exact shape or the
        tap silently lands nowhere. */
    static String tallyRoute(String kind) {
        return "/?tally=" + kind;
    }

    /** Mirrors QuickLogWidgetProvider.buttonLabel: the real label normally,
        or nothing beyond the glyph already on the button while disguise
        mode is on - a screen reader is as much an at-rest surface as the
        visible glyph. */
    static String buttonLabel(boolean disguised, String label) {
        return disguised ? null : label;
    }

    private static RemoteViews buildViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_tally);
        boolean disguised = DisguiseAlias.isDisguised(context);
        views.setViewVisibility(R.id.widget_tally_header, disguised ? View.GONE : View.VISIBLE);

        String[] labels = context.getResources().getStringArray(R.array.widget_tally_labels);
        for (int i = 0; i < KINDS.length; i++) {
            int buttonId = BUTTON_IDS[i];
            String label = buttonLabel(disguised, labels[i]);
            if (label != null) views.setContentDescription(buttonId, label);
            views.setOnClickPendingIntent(
                buttonId,
                AppLaunch.openAppIntent(context, tallyRoute(KINDS[i]), "widget-tally-" + KINDS[i], 200 + i)
            );
        }
        return views;
    }
}
