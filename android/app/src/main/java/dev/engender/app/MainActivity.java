package dev.engender.app;

import android.content.Intent;
import android.os.Bundle;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

import dev.engender.app.photos.PhotoPickChannel;
import dev.engender.app.photos.PhotoWriteChannel;
import dev.engender.app.lock.LockTimingPlugin;
import dev.engender.app.lock.OwnSystemUi;
import dev.engender.app.launch.AppLaunch;
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

    private final OwnSystemUi ownSystemUi = new OwnSystemUi();

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
        // Every runtime permission prompt goes through ActivityCompat, the
        // WebView's microphone and camera prompts included, and
        // Activity.requestPermissions is final, so this is the one place to
        // see a prompt going out. Returning false lets it go out as usual.
        ActivityCompat.setPermissionCompatDelegate(new ActivityCompat.PermissionCompatDelegate() {
            @Override
            public boolean requestPermissions(@NonNull android.app.Activity activity, @NonNull String[] permissions, int requestCode) {
                if (activity instanceof MainActivity) ((MainActivity) activity).ownSystemUi.opened(requestCode);
                return false;
            }

            @Override
            public boolean onActivityResult(@NonNull android.app.Activity activity, int requestCode, int resultCode, Intent data) {
                return false;
            }
        });
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

    /** Pickers, the camera and the folder and save pickers all come through
     * here, from the plugins and from the WebView's file chooser alike. */
    @Override
    public void startActivityForResult(Intent intent, int requestCode, Bundle options) {
        ownSystemUi.opened(requestCode);
        super.startActivityForResult(intent, requestCode, options);
    }

    // Closed before the result is handed on, because handling it can open the
    // next one: a granted camera permission goes straight on to the camera.
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        ownSystemUi.closed();
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        ownSystemUi.closed();
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
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
        // Below Android 13, Recents and capture share one flag. Protect every
        // locked access mode on leave, including the default restart timing.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU && LockTimingPlugin.isEnabled(this)) {
            ScreenCapturePlugin.applyWindowFlags(this, false);
        }
        // Covered by a screen the app opened itself is not leaving it. The
        // page's own visibility is ignored on Android for the same reason
        // (leave-lock.ts), so this is the only check there is.
        if (ownSystemUi.isOpen()) return;
        if (bridge == null || bridge.getWebView() == null) return;
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
        ReminderScheduler.storeLaunchRoute(this, AppLaunch.authenticatedRoute(this, intent));
    }
}
