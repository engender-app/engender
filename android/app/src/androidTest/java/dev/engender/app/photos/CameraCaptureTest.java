package dev.engender.app.photos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.provider.MediaStore;

import androidx.core.content.FileProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.OutputStream;

@RunWith(AndroidJUnit4.class)
public class CameraCaptureTest {
    private Context context;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    @After
    public void tearDown() {
        CameraCapture.cancel(context);
    }

    @Test
    public void outputUriDeliversFullResolutionBytesAndDeletesTheCacheFile() throws Exception {
        Intent intent = CameraCapture.prepare(context);
        assertEquals(MediaStore.ACTION_IMAGE_CAPTURE, intent.getAction());
        Uri output = intent.getParcelableExtra(MediaStore.EXTRA_OUTPUT);
        assertNotNull(output);
        assertEquals("content", output.getScheme());
        assertEquals(context.getPackageName() + ".camera-files", output.getAuthority());
        assertEquals(output, intent.getClipData().getItemAt(0).getUri());
        assertEquals(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
            intent.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION));
        Bitmap photo = Bitmap.createBitmap(1800, 1200, Bitmap.Config.ARGB_8888);
        try (OutputStream stream = context.getContentResolver().openOutputStream(output)) {
            assertTrue(photo.compress(Bitmap.CompressFormat.JPEG, 92, stream));
        } finally {
            photo.recycle();
        }
        byte[] bytes = CameraCapture.consume(context);
        BitmapFactory.Options dimensions = new BitmapFactory.Options();
        dimensions.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, dimensions);
        assertEquals(1800, dimensions.outWidth);
        assertEquals(1200, dimensions.outHeight);
        assertFalse(new File(context.getCacheDir(), "camera-capture/capture.jpg").exists());
    }

    @Test
    public void cancelledCaptureDeletesPartialOutput() throws Exception {
        CameraCapture.prepare(context);
        CameraCapture.cancel(context);
        assertFalse(new File(context.getCacheDir(), "camera-capture/capture.jpg").exists());
    }

    @Test
    public void providerCannotShareOtherCacheFiles() {
        assertThrows(IllegalArgumentException.class, () -> FileProvider.getUriForFile(context,
            context.getPackageName() + ".camera-files", new File(context.getCacheDir(), "private-secret")));
    }
}
