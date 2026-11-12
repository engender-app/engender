package dev.engender.app;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.WebViewListener;

import dev.engender.app.chrome.KeyboardFollow;
import dev.engender.app.disguise.DisguiseState;
import dev.engender.app.photos.PhotoPickChannel;
import dev.engender.app.photos.PhotoWriteChannel;
import dev.engender.app.lock.LeaveCover;
import dev.engender.app.lock.LockTimingPlugin;
import dev.engender.app.lock.OwnSystemUi;
import dev.engender.app.navigation.StepBackPlugin;
import dev.engender.app.launch.AppLaunch;
import dev.engender.app.reminders.ReminderScheduler;
import dev.engender.app.screencapture.ScreenCapturePlugin;

/**
 * The whole Android application. Everything above the driver seam is the same
 * static bundle the web release serves, so the only Android-specific things
 * here are the platform bridges: the Capacitor plugins AndroidPluginRegistry
 * lists (SQLite, Keystore, the Storage Access Framework bridge for backup
 * destinations, photos, reminders, disguise and the rest).
 */
public class MainActivity extends BridgeActivity implements LockTimingPlugin.LeaveCoverHost {
    // Matches capacitor.config.ts's server.androidScheme/hostname, which is
    // fixed for the reason that file's header comment gives.
    private static final String APP_ORIGIN = "https://localhost";

    private final OwnSystemUi ownSystemUi = new OwnSystemUi();
    private boolean rendererGone;

    /** The screen going off is leaving, whatever is on top: a picker the app
     * opened ends its window here rather than when its result comes back. */
    private final BroadcastReceiver screenOff = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            ownSystemUi.closed();
            lockOnLeave();
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Apply the saved capture choice before the first frame. A device
        // where nobody switched "Block screenshots" on can be captured; disguise also
        // hides the Recents preview. SharedPreferences
        // needs no bridge or WebView, so this runs before super.onCreate.
        ScreenCapturePlugin.applyWindowFlags(this);
        // Old retrospective channels can survive an app update after their plugin is removed.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager notifications = getSystemService(NotificationManager.class);
            if (notifications != null) {
                notifications.deleteNotificationChannel("gd-wrapped");
                notifications.deleteNotificationChannel("gd-on-this-day");
            }
        }
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
            bridge.addWebViewListener(new WebViewListener() {
                @Override
                public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    if (rendererGone) return true;
                    rendererGone = true;
                    // A dead renderer cannot run the JS lock callback. Replace
                    // the whole bridge so boot starts without a session key or
                    // retained doors, just as it does in a new process.
                    bridge.onDestroy();
                    bridge = null;
                    if (view.getParent() instanceof ViewGroup) {
                        ((ViewGroup) view.getParent()).removeView(view);
                    }
                    view.destroy();
                    getWindow().getDecorView().post(MainActivity.this::recreate);
                    return true;
                }
            });
            // Before the first document's scripts: the lock screen and the
            // pre-paint script read the live alias instead of a mirror the
            // disguise flip's process kill can outrun.
            bridge.getWebView().addJavascriptInterface(new DisguiseState(this), DisguiseState.INTERFACE_NAME);
            PhotoWriteChannel.registerIfSupported(this, bridge.getWebView(), APP_ORIGIN);
            PhotoPickChannel.registerIfSupported(bridge.getWebView(), APP_ORIGIN);
            // After the bridge, so its back callback comes after the App
            // plugin's and hears a back swipe first (StepBackPlugin).
            PluginHandle stepBack = bridge.getPlugin("StepBack");
            if (stepBack != null) ((StepBackPlugin) stepBack.getInstance()).install(this);
        }
        KeyboardFollow.install(getWindow().getDecorView());
        captureReminderRoute(getIntent());
        ContextCompat.registerReceiver(this, screenOff, new IntentFilter(Intent.ACTION_SCREEN_OFF), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @Override
    public void onDestroy() {
        unregisterReceiver(screenOff);
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureReminderRoute(intent);
        // A notification touched while the app is in front raises neither a
        // focus nor a visibility event, so the page is told directly.
        if (!rendererGone && bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().evaluateJavascript(
                "window.__launchRouteFromNative && window.__launchRouteFromNative();", null);
        }
    }

    /** Pickers, the camera and the folder and save pickers all come through
     * here, from the plugins and from the WebView's file chooser alike. */
    @Override
    public void startActivityForResult(Intent intent, int requestCode, Bundle options) {
        ownSystemUi.opened(requestCode);
        try {
            super.startActivityForResult(intent, requestCode, options);
        } catch (RuntimeException e) {
            // Nothing opened, so no result will ever close the window.
            ownSystemUi.closed();
            throw e;
        }
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
        // Permission revocation cancels exact alarms without a broadcast.
        // Stored rules can recover inexact alarms even at the journal gate.
        ReminderScheduler.rescheduleFromStore(this);
        ReminderScheduler.withdrawHiddenFaces(this);
        returnFromLeave();
    }

    /** A plain block of the page's ground over the WebView, put up on a
     * leave whenever a lock is set, and taken off by the page once it has drawn
     * the gate (LeaveCover says why). */
    private View leaveCover;

    private void showLeaveCover() {
        if (leaveCover == null) {
            leaveCover = new View(this);
            leaveCover.setClickable(true);
            leaveCover.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
            addContentView(leaveCover, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        leaveCover.setBackgroundColor(LeaveCover.ground());
        leaveCover.bringToFront();
        leaveCover.setVisibility(View.VISIBLE);
    }

    @Override
    public void revealLeaveCover() {
        LeaveCover.reveal();
        if (leaveCover != null) leaveCover.setVisibility(View.GONE);
    }

    private void lockOnLeave() {
        // First and synchronously: Android photographs the window for its
        // task snapshot before the page below can draw its gate.
        if (LeaveCover.coverOnLeave()) {
            showLeaveCover();
            // Below Android 13 only FLAG_SECURE keeps the task snapshot off
            // the journal; returnFromLeave restores the capture choice.
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
            }
        }
        if (rendererGone || bridge == null || bridge.getWebView() == null) return;
        // Covered by a screen the app opened itself is not leaving it yet,
        // and the page decides how long it may stay up (leave-lock.ts). The
        // page's own visibility is ignored on Android for the same reason, so
        // this is the only report there is.
        String ownScreen = ownSystemUi.isOpen() ? "true" : "false";
        bridge.getWebView().evaluateJavascript(
            "window.__lockOnLeaveFromNative && window.__lockOnLeaveFromNative(" + ownScreen + ");", null);
    }

    private void returnFromLeave() {
        if (!rendererGone && bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().evaluateJavascript("window.__lockOnReturnFromNative && window.__lockOnReturnFromNative();", null);
        }
        ScreenCapturePlugin.applyWindowFlags(this);
    }

    private void captureReminderRoute(Intent intent) {
        if (intent == null) return;
        ReminderScheduler.storeLaunchRoute(this, AppLaunch.authenticatedRoute(this, intent));
        AppLaunch.dismissNotification(this, intent);
    }
}
