package dev.barankiewicz.genderdiary;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import dev.barankiewicz.genderdiary.backup.AutoExportPlugin;
import dev.barankiewicz.genderdiary.keystore.KeystorePlugin;
import dev.barankiewicz.genderdiary.reminders.ReminderScheduler;
import dev.barankiewicz.genderdiary.reminders.RemindersPlugin;
import dev.barankiewicz.genderdiary.sqlite.SqlitePlugin;

/**
 * The whole Android application. Everything above the driver seam is the same
 * static bundle the web release serves (ADR-0017), so the only Android-specific
 * things here are the platform bridges: SQLite, Keystore, and the Storage
 * Access Framework bridge for backup destinations.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Before super.onCreate: the bridge is built there, and a plugin
        // registered afterwards is not in the bridge the WebView gets.
        registerPlugin(SqlitePlugin.class);
        registerPlugin(KeystorePlugin.class);
        registerPlugin(RemindersPlugin.class);
        registerPlugin(AutoExportPlugin.class);
        super.onCreate(savedInstanceState);
        captureReminderRoute(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureReminderRoute(intent);
    }

    private void captureReminderRoute(Intent intent) {
        if (intent == null) return;
        ReminderScheduler.storeLaunchRoute(this, intent.getStringExtra(ReminderScheduler.EXTRA_ROUTE));
    }
}
