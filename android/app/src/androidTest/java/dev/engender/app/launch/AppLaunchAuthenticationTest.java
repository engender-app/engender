package dev.engender.app.launch;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import android.content.Context;
import android.content.Intent;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import dev.engender.app.MainActivity;
import dev.engender.app.reminders.ReminderScheduler;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AppLaunchAuthenticationTest {
    private Context context;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    @Test
    public void routesWithoutThisInstallNonceAreRejected() {
        Intent foreign = new Intent().putExtra(ReminderScheduler.EXTRA_ROUTE, "/?tally=misgendered");
        assertNull(AppLaunch.authenticatedRoute(context, foreign));
        foreign.putExtra("gd_route_nonce", "another-install");
        assertNull(AppLaunch.authenticatedRoute(context, foreign));
    }

    @Test
    public void appRoutesAuthenticateAcrossContextInstances() {
        Intent own = AppLaunch.routeIntent(context, "/?tally=misgendered", "tally");
        assertEquals("/?tally=misgendered", AppLaunch.authenticatedRoute(context, own));
        assertEquals("/?tally=misgendered", AppLaunch.authenticatedRoute(context.getApplicationContext(), own));
        own.putExtra("gd_route_nonce", "wrong-nonce");
        assertNull(AppLaunch.authenticatedRoute(context, own));
    }

    @Test
    public void exportedLauncherDoesNotStoreAnUnauthenticatedTallyRoute() {
        context.getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE)
            .edit().remove("launch-route").commit();
        Intent foreign = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName())
            .putExtra(ReminderScheduler.EXTRA_ROUTE, "/?tally=misgendered")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(foreign)) {
            scenario.onActivity(activity -> assertNull(context
                .getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE)
                .getString("launch-route", null)));
        }
    }
}
