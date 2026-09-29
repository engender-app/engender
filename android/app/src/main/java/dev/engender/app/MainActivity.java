package dev.engender.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

import dev.engender.app.photos.PhotoPickChannel;
import dev.engender.app.photos.PhotoWriteChannel;
import dev.engender.app.quickexit.QuickExitPlugin;
import dev.engender.app.reminders.ReminderScheduler;
import dev.engender.app.screencapture.ScreenCapturePlugin;

/**
 * The whole Android application. Everything above the driver seam is the same
 * static bundle the web release serves, so the only Android-specific things
 * here are the platform bridges: SQLite, Keystore, and the Storage Access
 * Framework bridge for backup destinations.
 */
public class MainActivity extends BridgeActivity {
    // Matches capacitor.config.ts's server.androidScheme/hostname, which is
    // fixed for the reason that file's header comment gives.
    private static final String APP_ORIGIN = "https://localhost";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Apply the saved capture choice before the first frame. A device
        // with no saved choice allows capture by default. SharedPreferences
        // needs no bridge or WebView, so this runs before super.onCreate.
        ScreenCapturePlugin.applyWindowFlags(this, ScreenCapturePlugin.isAllowed(this));
        // Before super.onCreate: the bridge is built there, and a plugin
        // registered afterwards is not in the bridge the WebView gets.
        AndroidPluginRegistry.assertRequiredPluginClassesExposeExpectedIds();
        for (Class<? extends Plugin> pluginClass : AndroidPluginRegistry.requiredPluginClasses()) {
            registerPlugin(pluginClass);
        }
        super.onCreate(savedInstanceState);
        // After super.onCreate, not before: the WebView this needs does not
        // exist until the bridge builds it there.
        if (bridge != null && bridge.getWebView() != null) {
            PhotoWriteChannel.registerIfSupported(this, bridge.getWebView(), APP_ORIGIN);
            PhotoPickChannel.registerIfSupported(bridge.getWebView(), APP_ORIGIN);
        }
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
