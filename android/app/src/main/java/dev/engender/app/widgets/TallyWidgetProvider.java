package dev.engender.app.widgets;

import android.content.Context;

import java.util.ArrayList;
import java.util.List;

import dev.engender.app.R;

/**
 * A home-screen widget offering one-tap tally logging (ticket 33): two
 * buttons, misgendering and correct-gendering, mirroring Home's own tally
 * card (ticket 10). Neither button opens a route of its own - both
 * deep-link (AppLaunch.openAppIntent, pulled out for exactly this reuse in
 * ticket 26) to Home with a `tally` query parameter, which Home reads once
 * on mount and logs through the same journal.tally.log call the in-app
 * buttons use, then clears (src/routes/+page.svelte).
 *
 * <p>Disguise mode is handled once by {@link DisguisableWidgetProvider}.
 */
public class TallyWidgetProvider extends DisguisableWidgetProvider {

    private static final String[] KINDS = { "misgendered", "correctly_gendered" };
    private static final int[] BUTTON_IDS = { R.id.widget_tally_misgendered, R.id.widget_tally_correct };

    @Override
    int layoutId() {
        return R.layout.widget_tally;
    }

    @Override
    int headerViewId() {
        return R.id.widget_tally_header;
    }

    @Override
    List<ButtonSpec> buttons(Context context) {
        String[] labels = context.getResources().getStringArray(R.array.widget_tally_labels);
        List<ButtonSpec> specs = new ArrayList<>(KINDS.length);
        for (int i = 0; i < KINDS.length; i++) {
            specs.add(new ButtonSpec(BUTTON_IDS[i], labels[i], tallyRoute(KINDS[i]), "widget-tally-" + KINDS[i], 200 + i));
        }
        return specs;
    }

    /** The route a tally button's PendingIntent deep-links to - Home itself,
        carrying the kind as a query parameter it reads once and clears,
        rather than a route belonging to this widget. Pinned against
        src/lib/android/launch-routes.ts by the shared fixture at
        src/lib/android/fixtures/launch-routes.json (ADR-0028). */
    static String tallyRoute(String kind) {
        return "/?tally=" + kind;
    }
}
