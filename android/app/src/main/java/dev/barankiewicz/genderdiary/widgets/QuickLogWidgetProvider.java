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
 * A home-screen widget offering one-tap mood logging (ticket 26). Each of
 * the five buttons deep-links (AppLaunch.openAppIntent) into the same
 * mood-seeded entry composer the in-app quick log on Home already uses -
 * app lock's own gate (+layout.svelte's {#if locked}) is what stands
 * between that landing and anything actually rendering, exactly as it does
 * for a reminder notification tap, so this widget never bypasses it.
 *
 * <p>Nothing here reads or shows journal data (today's mood, a streak) -
 * the buttons are a static input control, not a display of what has
 * already been logged. The one thing that does vary at render time is
 * disguise mode: {@link #buttonLabel} swaps the mood name for the plain
 * digit already printed on the button, and the header (which names what
 * the buttons are for) is hidden outright, mirroring how
 * ReminderAlarmReceiver.resolveNotificationTitle swaps a reminder's title
 * for the channel name under hideNotificationTitles - a live read at
 * render time, not a second copy of the preference.
 */
public class QuickLogWidgetProvider extends AppWidgetProvider {

    private static final int[] MOODS = {1, 2, 3, 4, 5};
    private static final int[] BUTTON_IDS = {
        R.id.widget_mood_1, R.id.widget_mood_2, R.id.widget_mood_3, R.id.widget_mood_4, R.id.widget_mood_5
    };

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        RemoteViews views = buildViews(context);
        for (int id : appWidgetIds) appWidgetManager.updateAppWidget(id, views);
    }

    /** Called from DisguisePlugin.setDisguised right after the launcher
        alias flips, so an already-placed widget goes neutral immediately
        rather than waiting for the next system-scheduled onUpdate. */
    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, QuickLogWidgetProvider.class));
        if (ids.length == 0) return;
        RemoteViews views = buildViews(context);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    /** The route a mood button's PendingIntent deep-links to - "today"
        rather than a computed epoch day, so a PendingIntent built now still
        lands on the right day no matter how long it sits on the home
        screen before being tapped; the [day] route resolves "today" live,
        at navigation time. Mirrored in ReminderScheduler.sanitizeLaunchRoute
        and +layout.svelte's isValidAndroidLaunchRoute - both must accept
        this exact shape or the tap silently lands nowhere. */
    static String moodRoute(int mood) {
        return "/entry/new/today?seedMood=" + mood;
    }

    /** What a mood button's accessible label reads as: the mood's own name
        ("Awful".."Great") normally, or nothing beyond the plain digit
        already printed on the button while disguise mode is on - a screen
        reader is as much an at-rest surface as the visible icon, so the
        swap has to cover both. */
    static String buttonLabel(boolean disguised, String moodName) {
        return disguised ? null : moodName;
    }

    private static RemoteViews buildViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_quick_log);
        boolean disguised = DisguiseAlias.isDisguised(context);
        views.setViewVisibility(R.id.widget_header, disguised ? View.GONE : View.VISIBLE);

        String[] moodNames = context.getResources().getStringArray(R.array.widget_mood_names);
        for (int i = 0; i < MOODS.length; i++) {
            int buttonId = BUTTON_IDS[i];
            String label = buttonLabel(disguised, moodNames[i]);
            if (label != null) views.setContentDescription(buttonId, label);
            views.setOnClickPendingIntent(
                buttonId,
                AppLaunch.openAppIntent(context, moodRoute(MOODS[i]), "widget-mood-" + MOODS[i], 100 + MOODS[i])
            );
        }
        return views;
    }
}
