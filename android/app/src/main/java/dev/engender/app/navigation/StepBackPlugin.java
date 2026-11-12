package dev.engender.app.navigation;

import android.os.Build;
import android.webkit.WebView;

import androidx.activity.BackEventCompat;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.OnBackPressedDispatcher;
import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.WebViewListener;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The Android end of the predictive step back; the rules are in
 * StepBackGesture and the page's end in src/lib/android/step-preview.ts.
 *
 * The swipe's progress reaches a callback only on Android 14 (API 34) and
 * later, so below that nothing is installed and Back stays exactly the
 * App plugin's.
 */
@CapacitorPlugin(name = "StepBack")
public class StepBackPlugin extends Plugin {
    private OnBackPressedCallback callback;
    private StepBackGesture gesture;

    /**
     * Called by MainActivity after the bridge is built. The dispatcher asks
     * the most recently added callback first, so this has to come after the
     * App plugin's, which is added while the bridge is built.
     */
    public void install(ComponentActivity activity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE || callback != null) return;
        OnBackPressedDispatcher dispatcher = activity.getOnBackPressedDispatcher();
        gesture = new StepBackGesture(new StepBackGesture.Page() {
            @Override public void started() {
                notifyListeners("backStarted", new JSObject());
            }

            @Override public void progressed(float progress) {
                JSObject data = new JSObject();
                data.put("progress", progress);
                notifyListeners("backProgress", data);
            }

            @Override public void cancelled() {
                notifyListeners("backCancelled", new JSObject());
            }
        }, () -> {
            // Off for the length of the hand-on, so the dispatcher passes
            // this Back to the next enabled callback, the App plugin's.
            callback.setEnabled(false);
            dispatcher.onBackPressed();
            callback.setEnabled(gesture.enabled());
        });
        callback = new OnBackPressedCallback(false) {
            @Override public void handleOnBackStarted(@NonNull BackEventCompat backEvent) {
                gesture.started();
            }

            @Override public void handleOnBackProgressed(@NonNull BackEventCompat backEvent) {
                gesture.progressed(backEvent.getProgress());
            }

            @Override public void handleOnBackCancelled() {
                gesture.cancelled();
            }

            @Override public void handleOnBackPressed() {
                gesture.released();
            }
        };
        dispatcher.addCallback(activity, callback);
        bridge.addWebViewListener(new WebViewListener() {
            @Override public void onPageStarted(WebView webView) {
                gesture.pageStarted();
                callback.setEnabled(false);
            }
        });
    }

    @PluginMethod
    public void setArmed(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("armed", false));
        getBridge().executeOnMainThread(() -> {
            if (gesture != null) {
                gesture.arm(on);
                callback.setEnabled(gesture.enabled());
            }
            call.resolve();
        });
    }
}
