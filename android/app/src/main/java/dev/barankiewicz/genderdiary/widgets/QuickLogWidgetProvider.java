package dev.barankiewicz.genderdiary.widgets;

import android.content.Context;

import java.util.ArrayList;
import java.util.List;

import dev.barankiewicz.genderdiary.R;

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
 * disguise mode, handled once by {@link DisguisableWidgetProvider}.
 */
public class QuickLogWidgetProvider extends DisguisableWidgetProvider {

    private static final int[] MOODS = {1, 2, 3, 4, 5};
    private static final int[] BUTTON_IDS = {
        R.id.widget_mood_1, R.id.widget_mood_2, R.id.widget_mood_3, R.id.widget_mood_4, R.id.widget_mood_5
    };

    @Override
    int layoutId() {
        return R.layout.widget_quick_log;
    }

    @Override
    int headerViewId() {
        return R.id.widget_header;
    }

    @Override
    List<ButtonSpec> buttons(Context context) {
        String[] moodNames = context.getResources().getStringArray(R.array.widget_mood_names);
        List<ButtonSpec> specs = new ArrayList<>(MOODS.length);
        for (int i = 0; i < MOODS.length; i++) {
            int mood = MOODS[i];
            specs.add(new ButtonSpec(BUTTON_IDS[i], moodNames[i], moodRoute(mood), "widget-mood-" + mood, 100 + mood));
        }
        return specs;
    }

    /** The route a mood button's PendingIntent deep-links to - "today"
        rather than a computed epoch day, so a PendingIntent built now still
        lands on the right day no matter how long it sits on the home
        screen before being tapped; the [day] route resolves "today" live,
        at navigation time. Pinned against src/lib/android/launch-routes.ts
        by the shared fixture at src/lib/android/fixtures/launch-routes.json
        (ADR-0028). */
    static String moodRoute(int mood) {
        return "/entry/new/today?seedMood=" + mood;
    }
}
