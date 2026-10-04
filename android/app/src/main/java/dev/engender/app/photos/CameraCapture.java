package dev.engender.app.photos;

import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.MediaStore;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

/** The camera can write only to the disposable capture directory. */
public final class CameraCapture {
    private CameraCapture() {}

    private static File output(Context context) {
        return new File(context.getCacheDir(), "camera-capture/capture.jpg");
    }

    private static Uri uri(Context context) {
        return FileProvider.getUriForFile(context, context.getPackageName() + ".camera-files", output(context));
    }

    public static Intent prepare(Context context) throws IOException {
        cancel(context);
        File file = output(context);
        if (!file.getParentFile().isDirectory() && !file.getParentFile().mkdirs()) {
            throw new IOException("could not create camera cache");
        }
        if (!file.createNewFile()) throw new IOException("could not create camera output");
        Uri uri = uri(context);
        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE)
            .putExtra(MediaStore.EXTRA_OUTPUT, uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        intent.setClipData(ClipData.newRawUri("camera output", uri));
        return intent;
    }

    public static byte[] consume(Context context) throws IOException {
        try {
            byte[] bytes = Files.readAllBytes(output(context).toPath());
            if (bytes.length == 0) throw new IOException("camera returned no photo");
            return bytes;
        } finally {
            cancel(context);
        }
    }

    public static void cancel(Context context) {
        context.revokeUriPermission(uri(context),
            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        output(context).delete();
    }
}
