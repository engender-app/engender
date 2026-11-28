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
 * Read microphone and camera grants with checkSelfPermission.
 * WebView's navigator.permissions describes the page, while
 * getUserMedia delegates OS prompts to BridgeWebChromeClient.
 * openAppInfo opens Android's app details for a denied grant.
 * RemindersPlugin owns notification and exact alarm permissions.
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
