package dev.engender.app.files;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.DocumentsContract;
import java.io.IOException;
import java.util.HashSet;
import java.util.Set;

/** Records only destinations returned for this app's unfinished manual exports. */
final class ManualExportCleanup {
    private static final String TARGET = "target:";
    private static final String GRANT = "grant:";
    private static final Set<String> writing = new HashSet<>();
    private static final int ACCESS = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences("manual-export-cleanup", Context.MODE_PRIVATE);
    }

    private static void commit(SharedPreferences.Editor editor) throws IOException {
        if (!editor.commit()) throw new IOException("export-cleanup-record-failed");
    }

    static synchronized void picker(Context context, String id) throws IOException {
        commit(preferences(context).edit().putString("picker", id));
    }

    static synchronized void pickerFinished(Context context, String id) throws IOException {
        SharedPreferences prefs = preferences(context);
        if (id.equals(prefs.getString("picker", null))) commit(prefs.edit().remove("picker"));
    }

    static synchronized void destination(Context context, String id, Uri uri) throws IOException {
        boolean hadGrant = context.getContentResolver().getPersistedUriPermissions().stream()
            .anyMatch(permission -> permission.getUri().equals(uri));
        // Persist ownership before requesting access or opening the destination.
        commit(preferences(context).edit().putString(TARGET + id, uri.toString()).putBoolean(GRANT + id, !hadGrant));
        try { context.getContentResolver().takePersistableUriPermission(uri, ACCESS); }
        catch (SecurityException refused) { /* Some providers offer only the activity's temporary grant. */ }
        writing.add(id);
    }

    static synchronized void delivered(Context context, String id) throws IOException {
        forget(context, id);
        writing.remove(id);
        pickerFinished(context, id);
    }

    static synchronized boolean failed(Context context, String id, Uri uri) {
        writing.remove(id);
        if (!preferences(context).contains(TARGET + id) && uri != null) {
            try { commit(preferences(context).edit().putString(TARGET + id, uri.toString())); }
            catch (IOException unavailable) {
                try { return DocumentsContract.deleteDocument(context.getContentResolver(), uri); }
                catch (Exception refused) { return false; }
            }
        }
        return removeTarget(context, id);
    }

    private static boolean removeTarget(Context context, String id) {
        SharedPreferences prefs = preferences(context);
        String target = prefs.getString(TARGET + id, null);
        if (target == null) return true;
        try {
            if (!DocumentsContract.deleteDocument(context.getContentResolver(), Uri.parse(target))) return false;
            forget(context, id);
            return true;
        } catch (Exception unavailable) { return false; }
    }

    private static void forget(Context context, String id) throws IOException {
        SharedPreferences prefs = preferences(context);
        String target = prefs.getString(TARGET + id, null);
        boolean release = prefs.getBoolean(GRANT + id, false);
        commit(prefs.edit().remove(TARGET + id).remove(GRANT + id));
        if (release && target != null) {
            try { context.getContentResolver().releasePersistableUriPermission(Uri.parse(target), ACCESS); }
            catch (SecurityException absent) { /* The provider did not persist this grant. */ }
        }
    }

    static synchronized void recover(Context context) throws IOException {
        SharedPreferences prefs = preferences(context);
        boolean interrupted = prefs.contains("picker");
        for (String key : prefs.getAll().keySet()) {
            if (!key.startsWith(TARGET)) continue;
            String id = key.substring(TARGET.length());
            if (writing.contains(id)) continue;
            interrupted = true;
            removeTarget(context, id);
        }
        if (interrupted) commit(prefs.edit().remove("picker").putBoolean("interrupted", true));
    }

    static synchronized boolean consumeInterrupted(Context context) throws IOException {
        SharedPreferences prefs = preferences(context);
        boolean interrupted = prefs.getBoolean("interrupted", false);
        if (interrupted) commit(prefs.edit().remove("interrupted"));
        return interrupted;
    }

    static synchronized boolean pending(Context context) {
        return preferences(context).getAll().keySet().stream().anyMatch(key -> key.startsWith(TARGET));
    }

    static synchronized void reset(Context context) throws IOException {
        SharedPreferences prefs = preferences(context);
        commit(prefs.edit().remove("picker").remove("interrupted"));
        for (String key : prefs.getAll().keySet()) {
            if (key.startsWith(TARGET) && !writing.contains(key.substring(TARGET.length()))) {
                removeTarget(context, key.substring(TARGET.length()));
            }
        }
    }
}
