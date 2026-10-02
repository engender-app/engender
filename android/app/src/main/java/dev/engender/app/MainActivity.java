package dev.engender.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

import dev.engender.app.photos.PhotoPickChannel;
import dev.engender.app.photos.PhotoWriteChannel;
import dev.engender.app.lock.LockTimingPlugin;
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

    /** Home gives this hint before pausing; Recents can pause without it. */
    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        lockOnLeave();
    }

    @Override
    public void onPause() {
        // Before Android 10, the visible split-screen pane can be paused.
        if (!isInMultiWindowMode() && !isChangingConfigurations()) lockOnLeave();
        super.onPause();
    }

    @Override
    public void onStop() {
        if (!isChangingConfigurations()) lockOnLeave();
        super.onStop();
    }

    /** Recents can take focus while this activity remains resumed. */
    @Override
    public void onTopResumedActivityChanged(boolean isTopResumedActivity) {
        super.onTopResumedActivityChanged(isTopResumedActivity);
        if (isTopResumedActivity) {
            returnFromLeave();
        } else if (!isInMultiWindowMode() && !isChangingConfigurations()) {
            lockOnLeave();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        returnFromLeave();
    }

    private void lockOnLeave() {
        if (bridge == null || bridge.getWebView() == null) return;
        // The native flag protects the thumbnail while the WebView renders
        // its gate. Capture permission returns when the app resumes.
        if (LockTimingPlugin.locksImmediately(this)) ScreenCapturePlugin.applyWindowFlags(this, false);
        bridge.getWebView().evaluateJavascript("window.__lockOnLeaveFromNative && window.__lockOnLeaveFromNative();", null);
    }

    private void returnFromLeave() {
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().evaluateJavascript("window.__lockOnReturnFromNative && window.__lockOnReturnFromNative();", null);
        }
        ScreenCapturePlugin.applyWindowFlags(this, ScreenCapturePlugin.isAllowed(this));
    }

    private void captureReminderRoute(Intent intent) {
        if (intent == null) return;
        ReminderScheduler.storeLaunchRoute(this, intent.getStringExtra(ReminderScheduler.EXTRA_ROUTE));
    }
}
