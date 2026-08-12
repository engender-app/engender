package dev.barankiewicz.genderdiary.backup;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Android side of scheduled encrypted backup destination management
 * (ticket 16): a SAF tree the person picks, and verified writes into it.
 */
@CapacitorPlugin(name = "AutoExport")
public class AutoExportPlugin extends Plugin {
    private static final String PREFS = "gender-diary-auto-export";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_SCHEDULE = "schedule";
    private static final String KEY_DESTINATION_URI = "destinationUri";
    private static final String KEY_DESTINATION_LABEL = "destinationLabel";
    private static final String KEY_LAST_SUCCESS_AT = "lastSuccessAt";
    private static final String KEY_LAST_FAILURE_AT = "lastFailureAt";
    private static final String KEY_LAST_FAILURE_REASON = "lastFailureReason";

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(statusObject());
    }

    @PluginMethod
    public void configure(PluginCall call) {
        Boolean enabledArg = call.getBoolean("enabled");
        String schedule = call.getString("schedule", "weekly");
        if (enabledArg == null) {
            call.reject("configure requires enabled");
            return;
        }
        if (!isSchedule(schedule)) {
            call.reject("invalid schedule");
            return;
        }

        boolean enabled = enabledArg && destinationUri() != null;
        preferences().edit().putBoolean(KEY_ENABLED, enabled).putString(KEY_SCHEDULE, schedule).apply();
        call.resolve(statusObject());
    }

    @PluginMethod
    public void pickDestination(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "pickedDestination");
    }

    @ActivityCallback
    private void pickedDestination(PluginCall call, ActivityResult result) {
        JSObject out = new JSObject();
        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            out.put("picked", false);
            out.put("destinationUri", JSObject.NULL);
            out.put("destinationLabel", JSObject.NULL);
            call.resolve(out);
            return;
        }

        Uri uri = result.getData().getData();
        if (uri == null) {
            out.put("picked", false);
            out.put("destinationUri", JSObject.NULL);
            out.put("destinationLabel", JSObject.NULL);
            call.resolve(out);
            return;
        }

        try {
            int flags = result.getData().getFlags();
            int grants = flags & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            getContext().getContentResolver().takePersistableUriPermission(uri, grants);

            String label = destinationLabel(uri);
            preferences().edit()
                .putString(KEY_DESTINATION_URI, uri.toString())
                .putString(KEY_DESTINATION_LABEL, label)
                .remove(KEY_LAST_FAILURE_AT)
                .remove(KEY_LAST_FAILURE_REASON)
                .apply();

            out.put("picked", true);
            out.put("destinationUri", uri.toString());
            out.put("destinationLabel", label);
            call.resolve(out);
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @PluginMethod
    public void writeBackup(PluginCall call) {
        String fileName = call.getString("fileName");
        String base64 = call.getString("base64");
        if (fileName == null || base64 == null) {
            call.reject("writeBackup requires fileName and base64");
            return;
        }

        Uri destination = destinationUri();
        if (destination == null) {
            disableWithFailure("destination-unavailable");
            call.reject("destination-unavailable");
            return;
        }

        try {
            DocumentFile folder = DocumentFile.fromTreeUri(getContext(), destination);
            if (folder == null || !folder.canWrite()) {
                throw new IllegalStateException("destination-unavailable");
            }

            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            DocumentFile target = folder.createFile("application/octet-stream", fileName);
            if (target == null) {
                throw new IllegalStateException("destination-unavailable");
            }

            Uri targetUri = target.getUri();
            try (OutputStream out = getContext().getContentResolver().openOutputStream(targetUri, "w")) {
                if (out == null) throw new IllegalStateException("destination-unavailable");
                out.write(bytes);
                out.flush();
            }

            verifyBytes(targetUri, bytes);

            long now = System.currentTimeMillis();
            preferences().edit()
                .putLong(KEY_LAST_SUCCESS_AT, now)
                .remove(KEY_LAST_FAILURE_AT)
                .remove(KEY_LAST_FAILURE_REASON)
                .apply();

            JSObject result = new JSObject();
            result.put("writtenAt", now);
            call.resolve(result);
        } catch (SecurityException e) {
            disableWithFailure("destination-revoked");
            call.reject("destination-revoked", e);
        } catch (IllegalStateException e) {
            String reason = message(e);
            if (reason.contains("destination-unavailable")) {
                disableWithFailure("destination-unavailable");
                call.reject("destination-unavailable", e);
                return;
            }
            failure(reason);
            call.reject(reason, e);
        } catch (Exception e) {
            String reason = message(e);
            failure(reason);
            call.reject(reason, e);
        }
    }

    private void verifyBytes(Uri uri, byte[] expected) throws Exception {
        byte[] written;
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            if (in == null) throw new IllegalStateException("destination-unavailable");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            written = out.toByteArray();
        }

        if (written.length != expected.length) {
            throw new IllegalStateException("verification-failed");
        }
        for (int i = 0; i < expected.length; i++) {
            if (written[i] != expected[i]) throw new IllegalStateException("verification-failed");
        }
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS, Activity.MODE_PRIVATE);
    }

    private Uri destinationUri() {
        String raw = preferences().getString(KEY_DESTINATION_URI, null);
        return raw == null ? null : Uri.parse(raw);
    }

    private static boolean isSchedule(String value) {
        return "weekly".equals(value) || "monthly".equals(value);
    }

    private void disableWithFailure(String reason) {
        long now = System.currentTimeMillis();
        preferences().edit()
            .putBoolean(KEY_ENABLED, false)
            .remove(KEY_DESTINATION_URI)
            .remove(KEY_DESTINATION_LABEL)
            .putLong(KEY_LAST_FAILURE_AT, now)
            .putString(KEY_LAST_FAILURE_REASON, reason)
            .apply();
    }

    private void failure(String reason) {
        long now = System.currentTimeMillis();
        preferences().edit().putLong(KEY_LAST_FAILURE_AT, now).putString(KEY_LAST_FAILURE_REASON, reason).apply();
    }

    private JSObject statusObject() {
        SharedPreferences prefs = preferences();
        JSObject out = new JSObject();

        out.put("enabled", prefs.getBoolean(KEY_ENABLED, false));
        out.put("schedule", prefs.getString(KEY_SCHEDULE, "weekly"));

        String destinationUri = prefs.getString(KEY_DESTINATION_URI, null);
        out.put("destinationUri", destinationUri == null ? JSObject.NULL : destinationUri);

        String destinationLabel = prefs.getString(KEY_DESTINATION_LABEL, null);
        out.put("destinationLabel", destinationLabel == null ? JSObject.NULL : destinationLabel);

        out.put("lastSuccessAt", prefs.contains(KEY_LAST_SUCCESS_AT) ? prefs.getLong(KEY_LAST_SUCCESS_AT, 0) : JSObject.NULL);
        out.put("lastFailureAt", prefs.contains(KEY_LAST_FAILURE_AT) ? prefs.getLong(KEY_LAST_FAILURE_AT, 0) : JSObject.NULL);

        String reason = prefs.getString(KEY_LAST_FAILURE_REASON, null);
        out.put("lastFailureReason", reason == null ? JSObject.NULL : reason);

        return out;
    }

    private static String destinationLabel(Uri uri) {
        String tree = uri.getLastPathSegment();
        if (tree == null || tree.isEmpty()) return "chosen folder";
        int marker = tree.lastIndexOf(':');
        String value = marker >= 0 ? tree.substring(marker + 1) : tree;
        value = Uri.decode(value);
        return value.isEmpty() ? "chosen folder" : value;
    }

    private static String message(Exception e) {
        String detail = e.getMessage();
        return detail == null || detail.isEmpty() ? e.getClass().getName() : detail;
    }
}
