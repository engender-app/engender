package dev.engender.app.backup;

import static org.junit.Assert.*;

import android.content.Context;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.work.Configuration;
import dev.engender.app.MainActivity;
import dev.engender.app.webview.WebViewProbe;
import org.junit.Test;

/** Run in its own instrumentation process: initialization failure lasts until restart. */
public class WorkManagerStartupTest {
    @Test public void refusedInitializationReportsFailureWithoutAdvertisingASchedule() throws Exception {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("WorkManager must initialize on demand", app.getApplicationContext() instanceof Configuration.Provider);
        Configuration configuration = ((Configuration.Provider) app.getApplicationContext()).getWorkManagerConfiguration();
        assertNotNull("WorkManager failures must have an owner", configuration.getInitializationExceptionHandler());
        configuration.getInitializationExceptionHandler().accept(new IllegalStateException("synthetic initialization refusal"));

        app.getSharedPreferences(AutoExportPlugin.PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("enabled", true).putString("schedule", "weekly").commit();
        try {
            BackupWork.schedule(app);
            fail("a refused initialization must not accept a schedule");
        } catch (IllegalStateException failed) {
            assertEquals("backup-scheduling-unavailable", failed.getMessage());
        }
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebViewProbe probe = new WebViewProbe(scenario, 60);
            probe.awaitTrue("!!window.Capacitor");
            probe.evaluate("window.Capacitor.nativePromise('AutoExport','status',{}).then(s=>window.startupStatus=s)");
            probe.awaitTrue("!!window.startupStatus");
            assertEquals("\"backup-scheduling-unavailable\"", probe.evaluate("window.startupStatus.lastFailureReason"));
            assertEquals("null", probe.evaluate("window.startupStatus.nextDueAt"));
            assertEquals("true", probe.evaluate("window.startupStatus.lastFailureAt > 0"));
        }
    }
}
