package dev.engender.app.photos;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.nio.file.Files;
import org.junit.Test;
import org.junit.runner.RunWith;

/** GD-012: the plaintext capture is on disk only while the camera holds it. */
@RunWith(AndroidJUnit4.class)
public class CameraCaptureProcessStartTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    @Test public void anyProcessStartRemovesACaptureAKilledProcessLeft() throws Exception {
        CameraCapture.prepare(context);
        File capture = new File(context.getCacheDir(), "camera-capture/capture.jpg");
        Files.write(capture.toPath(), "plaintext-jpeg-sentinel".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertTrue(capture.length() > 0);
        // The process was killed while the camera held the file. Whatever starts the next one (a
        // scheduled backup, an alarm, a widget, the launcher) runs Application.onCreate first, with
        // no activity and no Photos plugin loaded.
        InstrumentationRegistry.getInstrumentation().callApplicationOnCreate((Application) context.getApplicationContext());
        assertFalse("a plaintext capture outlived the process start", capture.exists());
    }
}
