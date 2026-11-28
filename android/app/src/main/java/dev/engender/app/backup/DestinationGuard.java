package dev.engender.app.backup;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import dev.engender.app.files.DocumentUris;
import org.json.JSONObject;

/**
 * The backup folder and the file a retry writes to come from a folder picker
 * and from provider answers, so both are checked every time they are used,
 * not only when they were stored (DocumentUris has the shapes). A stored
 * folder that fails is cleared with the delivery switched off, the way a
 * revoked one is, and a staged target outside it is dropped without being
 * opened or deleted: the URI is not something this app created.
 */
final class DestinationGuard {
    static final String INVALID = "destination-invalid";

    private DestinationGuard() {}

    /** The stored folder, or null when none is stored or it failed the check
        and has been cleared. Callers hold OWNER. */
    static Uri storedTree(Context context, SharedPreferences preferences) {
        String raw = preferences.getString("destinationUri", null);
        if (raw == null) return null;
        if (DocumentUris.isTree(raw)) return Uri.parse(raw);
        // Not a folder a picker could have returned: nothing is released, opened or deleted.
        preferences.edit().putBoolean("enabled", false)
            .remove("destinationUri").remove("destinationLabel")
            .putLong("lastFailureAt", System.currentTimeMillis())
            .putString("lastFailureReason", INVALID).commit();
        PersistentBackup.clear(context);
        return null;
    }

    /** The staged target when it is a document inside {@code tree}; otherwise
        it is removed from the stage and null comes back, so the next write
        creates a fresh file in the folder. */
    static String ownedTarget(SharedPreferences preferences, JSONObject stage, Uri tree) throws org.json.JSONException {
        if (!stage.has("target")) return null;
        String target = stage.getString("target");
        if (DocumentUris.isInTree(tree.toString(), target)) return target;
        stage.remove("target");
        preferences.edit().putString("encryptedStage", stage.toString()).commit();
        return null;
    }

    /** Whether a recorded target may be deleted as this app's partial file. */
    static boolean mayDelete(SharedPreferences preferences, String target) {
        String tree = preferences.getString("destinationUri", null);
        return tree != null && DocumentUris.isInTree(tree, target);
    }

    /** A file the provider just created must be a document inside the folder
        it was created in; a provider that answers with anything else is not
        written to, and is not deleted either, since it is not ours. */
    static void requireChild(Uri tree, androidx.documentfile.provider.DocumentFile created) {
        if (created == null || !DocumentUris.isInTree(tree.toString(), created.getUri().toString())) {
            throw new IllegalStateException(INVALID);
        }
    }
}
