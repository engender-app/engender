package dev.engender.app;

import android.app.Application;
import android.content.Context;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.work.Configuration;
import androidx.work.WorkManager;

/** Keeps a refused backup scheduler from stopping journal startup. */
public final class JournalApplication extends Application implements Configuration.Provider {
    private static volatile long schedulingFailureAt;

    /** Whatever process starts the app (a scheduled backup, an alarm, a
        widget) clears a camera capture a killed process left behind, not
        only the activity's plugin (GD-012): the plaintext JPEG is on disk
        only while the camera holds it. */
    @Override public void onCreate() {
        super.onCreate();
        dev.engender.app.photos.CameraCapture.cancel(this);
    }

    @NonNull @Override public Configuration getWorkManagerConfiguration() {
        return new Configuration.Builder().setInitializationExceptionHandler(error -> {
            initializationFailed();
        }).build();
    }

    private static void initializationFailed() {
        schedulingFailureAt = System.currentTimeMillis();
        Log.e("AutoExport", "WorkManager initialization failed; automatic delivery is unavailable");
    }

    public static long schedulingFailureAt() { return schedulingFailureAt; }
    public static boolean schedulingUnavailable() { return schedulingFailureAt != 0; }

    public static WorkManager workManager(Context context) {
        if (schedulingUnavailable()) throw new IllegalStateException("backup-scheduling-unavailable");
        try { return WorkManager.getInstance(context); }
        catch (RuntimeException failed) {
            initializationFailed();
            throw new IllegalStateException("backup-scheduling-unavailable", failed);
        }
    }
}
