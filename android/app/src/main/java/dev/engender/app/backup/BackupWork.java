package dev.engender.app.backup;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import androidx.annotation.NonNull;
import java.util.concurrent.TimeUnit;

/** Persistent delivery of an encrypted Archive; never opens the journal. */
public final class BackupWork extends Worker {
    static final String NAME = "automatic-archive-delivery";
    static final long DAY = 86400000L;
    static final Object OWNER = new Object();
    static boolean foregroundPacking;
    static long resetEpoch;

    public BackupWork(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(AutoExportPlugin.PREFS, Context.MODE_PRIVATE);
    }

    static long due(SharedPreferences preferences) {
        return preferences.contains("lastSuccessAt")
            ? preferences.getLong("lastSuccessAt", 0) + ("monthly".equals(preferences.getString("schedule", "weekly")) ? 30 : 7) * DAY
            : 0;
    }

    static void schedule(Context context) { schedule(context, false); }

    private static void schedule(Context context, boolean append) {
        SharedPreferences preferences = preferences(context);
        if (!preferences.getBoolean("enabled", false)) {
            await(WorkManager.getInstance(context).cancelUniqueWork(NAME));
            return;
        }
        long now = System.currentTimeMillis();
        long earliest = Math.max(due(preferences), preferences.getLong("retryNotBeforeAt", 0));
        if (!preferences.contains("encryptedStage") && preferences.contains("deferredAt")) {
            earliest = Math.max(earliest, preferences.getLong("deferredAt", 0) + DAY);
        }
        long delay = Math.max(0, earliest - now);
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(BackupWork.class)
            .setInitialDelay(delay, TimeUnit.MILLISECONDS).build();
        await(WorkManager.getInstance(context).enqueueUniqueWork(NAME,
            append ? ExistingWorkPolicy.APPEND_OR_REPLACE : ExistingWorkPolicy.REPLACE, request));
    }

    static void await(androidx.work.Operation operation) {
        try { operation.getResult().get(10, TimeUnit.SECONDS); }
        catch (Exception failed) { throw new IllegalStateException("backup-scheduling-unavailable", failed); }
    }

    private void scheduleNext() {
        try {
            boolean pending = WorkManager.getInstance(getApplicationContext()).getWorkInfosForUniqueWork(NAME)
                .get(10, TimeUnit.SECONDS).stream().anyMatch(info -> !info.getId().equals(getId()) && !info.getState().isFinished());
            if (!pending) schedule(getApplicationContext(), true);
        } catch (Exception failed) { throw new IllegalStateException("backup-scheduling-unavailable", failed); }
    }

    @NonNull @Override public Result doWork() {
        synchronized (OWNER) {
            SharedPreferences preferences = preferences(getApplicationContext());
            if (!preferences.getBoolean("enabled", false)) return Result.success();
            if (due(preferences) > System.currentTimeMillis()) {
                scheduleNext();
                return Result.success();
            }
            if (foregroundPacking) {
                if (getRunAttemptCount() < 2) return Result.retry();
                preferences.edit().putLong("retryNotBeforeAt", System.currentTimeMillis() + DAY).commit();
                scheduleNext();
                return Result.success();
            }
            try {
                if (!PersistentBackup.deliver(getApplicationContext())) {
                    preferences.edit().putLong("deferredAt", System.currentTimeMillis()).commit();
                    scheduleNext();
                    return Result.success();
                }
                scheduleNext();
                return Result.success();
            } catch (Exception error) {
                String reason = AutoExportPlugin.deliveryFailure(error);
                preferences.edit().putLong("lastFailureAt", System.currentTimeMillis())
                    .putString("lastFailureReason", reason).commit();
                // Three attempts, then a day without delivery retries. Unlock can stage a current Archive.
                if (getRunAttemptCount() < 2) return Result.retry();
                preferences.edit().putLong("retryNotBeforeAt", System.currentTimeMillis() + DAY).commit();
                scheduleNext();
                return Result.success();
            }
        }
    }
}
