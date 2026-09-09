package dev.engender.app.permissions;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The two things the permissions list needs and nothing else already owns
 * (phase 10 redesign ticket 31).
 *
 * The microphone and the camera are asked for by `getUserMedia` - Capacitor's
 * BridgeWebChromeClient turns the WebView's request into the OS prompt, so
 * there is no plugin in that path and this one does not add itself to it.
 * What the web side cannot do is *read* whether the grant is already there:
 * asking `navigator.permissions` inside a WebView answers about the page
 * rather than about the app, and the only honest way to show a granted row as
 * granted without opening the microphone to find out is checkSelfPermission.
 * That is `getStatus`.
 *
 * `openAppInfo` is the gap the inventory named. Android offers no settings
 * screen for a single runtime permission, so a refused microphone or camera
 * has been unrecoverable from inside the app: the prompt does not come back a
 * second time and nothing links out. The app's own details page is what
 * Android does offer, and it is the same fallback branch RemindersPlugin
 * already writes for a device with no notification-settings screen.
 *
 * Notifications and exact alarms are deliberately absent here. RemindersPlugin
 * owns both already, prompt and deep-link and status, and a second reader of
 * the same two permissions is how the two answers drift apart.
 */
@CapacitorPlugin(name = "Permissions")
public class PermissionsPlugin extends Plugin {

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject status = new JSObject();
        status.put("microphone", state(Manifest.permission.RECORD_AUDIO));
        status.put("camera", state(Manifest.permission.CAMERA));
        call.resolve(status);
    }

    @PluginMethod
    public void openAppInfo(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.parse("package:" + getContext().getPackageName()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("could not open the app's settings page", e);
        }
    }

    /**
     * "granted" or "denied", never "not-required": both permissions are
     * declared in the manifest and both are runtime permissions on every
     * SDK level this app supports (minSdkVersion 26).
     */
    private String state(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED
            ? "granted"
            : "denied";
    }
}
