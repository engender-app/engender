package dev.barankiewicz.genderdiary;

import android.content.Intent;
import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

import dev.barankiewicz.genderdiary.quickexit.QuickExitPlugin;
import dev.barankiewicz.genderdiary.reminders.ReminderScheduler;

/**
 * The whole Android application. Everything above the driver seam is the same
 * static bundle the web release serves (ADR-0017), so the only Android-specific
 * things here are the platform bridges: SQLite, Keystore, and the Storage
 * Access Framework bridge for backup destinations.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Unconditional, not toggled with lock state: a recents thumbnail
        // of the Journal is the leak ticket 15's third acceptance box
        // names, and a flag flipped at lock time is a race against
        // whatever the system snapshots the moment this app backgrounds.
        // Before super.onCreate, so the window never has a frame without it.
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        // Before super.onCreate: the bridge is built there, and a plugin
        // registered afterwards is not in the bridge the WebView gets.
        AndroidPluginRegistry.assertRequiredPluginClassesExposeExpectedIds();
        for (Class<? extends Plugin> pluginClass : AndroidPluginRegistry.requiredPluginClasses()) {
            registerPlugin(pluginClass);
        }
        super.onCreate(savedInstanceState);
        captureReminderRoute(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureReminderRoute(intent);
    }

    /** Fires on the deliberate "leave the app" gesture - Home, Recents -
        and not on a rotation or a system dialog stealing focus. Quick
        exit's Android equivalent (lock.svelte.ts) is this gesture, not a
        copy of the web's two-finger swipe, so this is where it locks: a
        direct call into the WebView's JS rather than waiting on the
        blur/visibilitychange listeners watchLock() already runs, which
        only fire once the WebView's own event loop gets to them - by
        which point the system may already have taken its recents
        snapshot. */
    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (!QuickExitPlugin.isEnabled(this) || bridge == null || bridge.getWebView() == null) return;
        bridge.getWebView().evaluateJavascript("window.__quickExitFromNative && window.__quickExitFromNative();", null);
    }

    private void captureReminderRoute(Intent intent) {
        if (intent == null) return;
        ReminderScheduler.storeLaunchRoute(this, intent.getStringExtra(ReminderScheduler.EXTRA_ROUTE));
    }
}
