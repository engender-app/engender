package dev.engender.app.backup;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import androidx.documentfile.provider.DocumentFile;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import org.json.JSONObject;

/** Durable encrypted bytes plus non-secret attempt metadata. All calls hold OWNER. */
final class PersistentBackup {
    private static final String STAGE = "encryptedStage";

    static File directory(Context context) {
        File directory = new File(context.getNoBackupFilesDir(), "automatic-archives");
        if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("staging-unavailable");
        return directory;
    }

    static void clear(Context context) {
        SharedPreferences preferences = BackupWork.preferences(context);
        String raw = preferences.getString(STAGE, null);
        if (raw != null) {
            try {
                JSONObject metadata = new JSONObject(raw);
                if (metadata.has("target") && !preferences.getString("verifiedBackups", "[]").contains(metadata.getString("target"))) {
                    DocumentFile partial = DocumentFile.fromSingleUri(context, Uri.parse(metadata.getString("target")));
                    if (partial != null) partial.delete();
                }
            } catch (Exception unavailable) { /* Destination access may already be revoked. */ }
        }
        AutoExportPlugin.commitState(preferences,
            preferences.edit().remove(STAGE).remove("deferredAt").remove("retryNotBeforeAt"));
        File directory = directory(context);
        File[] files = directory.listFiles();
        if (files != null) for (File file : files) file.delete();
    }

    static void stage(Context context, StagedBackup backup, long size, String digest, long snapshotAt, long generation) throws Exception {
        SharedPreferences preferences = BackupWork.preferences(context);
        if (!preferences.getBoolean("enabled", false) || generation != preferences.getLong("backupGeneration", 0)) {
            throw new IllegalStateException("backup-configuration-changed");
        }
        String name = java.util.UUID.randomUUID().toString();
        File file = new File(directory(context), name);
        try (InputStream input = new FileInputStream(backup.file); FileOutputStream output = new FileOutputStream(file)) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            output.getFD().sync();
        } catch (Exception error) {
            file.delete();
            throw error;
        }
        JSONObject metadata = new JSONObject().put("file", name).put("length", size).put("sha256", digest)
            .put("snapshotAt", snapshotAt).put("generation", generation).put("due", BackupWork.due(preferences));
        String previous = preferences.getString(STAGE, null);
        java.util.Map<String, ?> before = preferences.getAll();
        if (!preferences.edit().putString(STAGE, metadata.toString()).remove("deferredAt").remove("retryNotBeforeAt").commit()) {
            restoreStageState(preferences, before);
            file.delete();
            throw new IllegalStateException("staging-unavailable");
        }
        if (previous != null) {
            JSONObject old = new JSONObject(previous);
            new File(directory(context), old.getString("file")).delete();
            if (old.has("target") && !preferences.getString("verifiedBackups", "[]").contains(old.getString("target"))) {
                try {
                    DocumentFile partial = DocumentFile.fromSingleUri(context, Uri.parse(old.getString("target")));
                    if (partial != null) partial.delete();
                } catch (Exception unavailable) { /* Preserve the replacement stage. */ }
            }
        }
    }

    private static void restoreStageState(SharedPreferences preferences, java.util.Map<String, ?> before) {
        SharedPreferences.Editor rollback = preferences.edit();
        for (String key : new String[] { STAGE, "deferredAt", "retryNotBeforeAt" }) {
            Object value = before.get(key);
            if (value instanceof String) rollback.putString(key, (String) value);
            else if (value instanceof Long) rollback.putLong(key, (Long) value);
            else rollback.remove(key);
        }
        rollback.commit();
    }

    static boolean deliver(Context context) throws Exception {
        SharedPreferences preferences = BackupWork.preferences(context);
        String raw = preferences.getString(STAGE, null);
        if (raw == null) return false;
        JSONObject stage = new JSONObject(raw);
        if (stage.getLong("generation") != preferences.getLong("backupGeneration", 0)
            || stage.getLong("due") != BackupWork.due(preferences)) {
            clear(context);
            return false;
        }
        String stagedName = stage.getString("file");
        if (!stagedName.matches("[a-f0-9-]{36}")) throw new IllegalStateException("invalid-backup-stage");
        File file = new File(directory(context), stagedName);
        if (!file.isFile()) { clear(context); return false; }
        long size = stage.getLong("length");
        String digest = stage.getString("sha256");
        try (InputStream input = new FileInputStream(file)) { StagedBackup.verify(input, size, digest); }
        String destination = preferences.getString("destinationUri", null);
        if (destination == null) throw new IllegalStateException("destination-unavailable");
        DocumentFile folder = DocumentFile.fromTreeUri(context, Uri.parse(destination));
        if (folder == null || !folder.canWrite()) throw new IllegalStateException("destination-unavailable");
        DocumentFile target = stage.has("target") ? DocumentFile.fromSingleUri(context, Uri.parse(stage.getString("target"))) : null;
        if (target == null || !target.exists()) {
            target = folder.createFile("application/octet-stream", "auto-backup-" + stage.getLong("snapshotAt") + ".ttbackup");
            if (target == null) throw new IllegalStateException("destination-unavailable");
            stage.put("target", target.getUri().toString());
            if (!preferences.edit().putString(STAGE, stage.toString()).commit()) {
                preferences.edit().putString(STAGE, raw).commit();
                target.delete();
                throw new IllegalStateException("staging-unavailable");
            }
        }
        // Reuse the recorded target after interruption, never create duplicate attempts.
        try (InputStream input = new FileInputStream(file); OutputStream output = context.getContentResolver().openOutputStream(target.getUri(), "wt")) {
            if (output == null) throw new IllegalStateException("destination-unavailable");
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            output.flush();
        }
        try (InputStream input = context.getContentResolver().openInputStream(target.getUri())) {
            if (input == null) throw new IllegalStateException("destination-unavailable");
            StagedBackup.verify(input, size, digest);
        }
        AutoExportPlugin.completeVerifiedBackup(context, folder, target, stage.getLong("snapshotAt"), System.currentTimeMillis());
        file.delete();
        return true;
    }
}
