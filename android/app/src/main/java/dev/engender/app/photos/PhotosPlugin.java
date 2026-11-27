package dev.engender.app.photos;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Android half of the photo seam: one picker call and one
 * app-private file store, both behind a bridge that keeps web types and
 * Android types out of the journal code. {@link #pickDocument}
 * reuses the same picker shape for a PDF or an image.
 */
@CapacitorPlugin(name = "Photos", permissions = {
    @Permission(alias = "camera", strings = { Manifest.permission.CAMERA })
})
public class PhotosPlugin extends Plugin {

    /** Sits beside documents/limits.ts's DOCUMENT_SIZE_CEILING (25 MB) - the
        JS side has no File to ask a size of for a bridge pick, so this is
        the number hold() checks a content provider's declared size against
        before a token for that file is ever handed out. */
    private static final long DOCUMENT_SIZE_CEILING = 25L * 1024 * 1024;
    static final long PHOTO_SIZE_CEILING = 50L * 1024 * 1024;

    @Override
    public void load() {
        CameraCapture.cancel(getContext());
    }

    /**
     * One image, or several in one trip when the call asks for
     * {@code multiple}, the way the web's file input picks them
     * (after-release 27, audit L10-10). The photo picker takes at most
     * {@link MediaStore#getPickImagesMaxLimit()} and refuses a larger
     * {@code EXTRA_PICK_IMAGES_MAX}; the document picker on older Android
     * takes {@code EXTRA_ALLOW_MULTIPLE}. pickedImages already reads
     * either shape of result.
     */
    @PluginMethod
    public void pickImages(PluginCall call) {
        boolean multiple = Boolean.TRUE.equals(call.getBoolean("multiple", false));
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent = new Intent(MediaStore.ACTION_PICK_IMAGES);
            if (multiple) {
                int max = MediaStore.getPickImagesMaxLimit();
                if (max > 1) intent.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, max);
            }
        } else {
            intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("image/*");
            if (multiple) intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }
        startActivityForResult(call, intent, "pickedImages");
    }

    @PluginMethod
    public void captureImage(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermissionResult");
            return;
        }
        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (intent.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("camera unavailable");
            return;
        }
        try {
            startActivityForResult(call, CameraCapture.prepare(getContext()), "capturedImage");
        } catch (Exception e) {
            CameraCapture.cancel(getContext());
            call.reject(message(e), e);
        }
    }

    @PermissionCallback
    private void cameraPermissionResult(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) captureImage(call);
        else call.reject("camera permission denied");
    }

    /**
     * A PDF or an image, one at a time, through the
     * system picker rather than the WebView's file input, which crashes on
     * this call. No permission is declared or needed - {@code
     * ACTION_OPEN_DOCUMENT} hands back a per-URI grant.
     */
    @PluginMethod
    public void pickDocument(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "application/pdf", "image/*" });
        startActivityForResult(call, intent, "pickedDocument");
    }

    @ActivityCallback
    private void pickedImages(PluginCall call, ActivityResult activityResult) {
        JSObject result = new JSObject();
        JSArray tokens = new JSArray();

        if (activityResult == null || activityResult.getResultCode() != Activity.RESULT_OK) {
            result.put("tokens", tokens);
            call.resolve(result);
            return;
        }

        Intent data = activityResult.getData();
        if (data == null) {
            result.put("tokens", tokens);
            call.resolve(result);
            return;
        }

        try {
            List<Uri> uris = new ArrayList<>();
            if (data.getClipData() != null) {
                for (int i = 0; i < data.getClipData().getItemCount(); i++) {
                    uris.add(data.getClipData().getItemAt(i).getUri());
                }
            } else if (data.getData() != null) {
                uris.add(data.getData());
            }
            for (String token : hold(uris, PHOTO_SIZE_CEILING)) tokens.put(token);
            result.put("tokens", tokens);
            call.resolve(result);
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @ActivityCallback
    private void capturedImage(PluginCall call, ActivityResult activityResult) {
        try {
            if (call == null) return;
            JSObject result = new JSObject();
            if (activityResult == null || activityResult.getResultCode() != Activity.RESULT_OK) {
                result.put("token", JSObject.NULL);
            } else {
                result.put("token", PickedFiles.hold(Collections.singletonList(
                    PickedFiles.ofBytes(CameraCapture.consume(getContext())))).get(0));
            }
            call.resolve(result);
        } catch (Exception e) {
            if (call != null) call.reject(message(e), e);
        } finally {
            CameraCapture.cancel(getContext());
        }
    }

    /** A returned URI the content provider will not open (an unmounted SD
        card, a file already deleted from under the picker) fails when the
        bytes are asked for rather than here, because that is when the file
        is opened now - either transport reports it the same way, and
        documentPicking.ts's own catch is what the person sees. */
    @ActivityCallback
    private void pickedDocument(PluginCall call, ActivityResult activityResult) {
        JSObject result = new JSObject();

        if (activityResult == null || activityResult.getResultCode() != Activity.RESULT_OK) {
            result.put("token", JSObject.NULL);
            call.resolve(result);
            return;
        }

        Intent data = activityResult.getData();
        Uri uri = data == null ? null : data.getData();
        if (uri == null) {
            result.put("token", JSObject.NULL);
            call.resolve(result);
            return;
        }

        try {
            result.put("token", hold(Collections.singletonList(uri), DOCUMENT_SIZE_CEILING).get(0));
            call.resolve(result);
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    /** How much of a picked file crosses the bridge in one call. A
        multiple of three, so a chunk encodes without padding and the
        file's base64 is exactly its chunks' concatenated - picker.ts
        decodes each piece separately and does not need that, but a
        transport whose pieces only join by luck is worth not having.

        <p>768 KB is chosen from what one call is allowed to allocate, not
        from throughput: the buffer plus the encoding plus the Java String
        that carries it is around 3.8 MB live at the peak, against the 34 MB
        one allocation the whole file used to ask for. At the 25 MB ceiling
        that is 34 calls. */
    private static final int CHUNK_BYTES = 3 * 256 * 1024;

    /** Makes a token the page just read redeemable once more: the app locked
        while the file was being read and the page keeps only the token. */
    @PluginMethod
    public void reopenPicked(PluginCall call) {
        call.resolve(new JSObject().put("reopened", PickedFiles.reopen(call.getString("token"))));
    }

    /** Reads one base64 chunk per call when the WebView cannot register
     * {@link PhotoPickChannel} (ADR-0023). picker.ts calls this fallback
     * until {@code done}. A single JSON response for a 25 MB document
     * could exceed the Java heap limit.
     *
     * <p>Chunking keeps memory bounded while preserving JS-side file
     * encryption (ADR-0018, ADR-0020). Documents retain their original bytes
     * (ADR-0065). {@link PickedFiles#readChunk} owns the stream between calls.
     * {@code PhotoPickChannelTest} measures both transports.
     */
    @PluginMethod
    public void readPickedChunk(PluginCall call) {
        try {
            byte[] buffer = new byte[CHUNK_BYTES];
            int read = PickedFiles.readChunk(call.getString("token"), buffer);
            if (read == -1) {
                call.reject("unknown picked file");
                return;
            }
            JSObject result = new JSObject();
            result.put("base64", Base64.encodeToString(buffer, 0, read, Base64.NO_WRAP));
            /* readChunk's own end condition, read off its contract rather
               than guessed: a chunk shorter than the buffer is the last one,
               and it has already closed the file and dropped the token. */
            result.put("done", read < CHUNK_BYTES);
            call.resolve(result);
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @PluginMethod
    public void writeFile(PluginCall call) {
        String name = call.getString("name");
        String base64 = call.getString("base64");
        if (name == null || base64 == null) {
            call.reject("writeFile requires name and base64");
            return;
        }
        try {
            File target = fileFor(call, name);
            PhotoWriteOrder.Request request = PhotoFiles.reserveWrite(target);
            try {
                request.accept(Base64.decode(base64, Base64.DEFAULT));
            } catch (Exception error) {
                request.fail(error);
                throw error;
            }
            request.result.whenComplete((ignored, error) -> {
                if (error == null) call.resolve();
                else {
                    Throwable cause = error.getCause() == null ? error : error.getCause();
                    call.reject(PhotoFiles.message(cause));
                }
            });
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @PluginMethod
    public void sizeFile(PluginCall call) {
        String name = call.getString("name");
        if (name == null) {
            call.reject("sizeFile requires name");
            return;
        }
        try {
            JSObject result = new JSObject();
            File target = fileFor(call, name);
            if (!target.exists()) {
                result.put("size", JSObject.NULL);
            } else {
                result.put("size", target.length());
            }
            call.resolve(result);
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @PluginMethod
    public void sizeFiles(PluginCall call) {
        try {
            JSArray names = call.getArray("names");
            if (names == null) {
                call.reject("sizeFiles requires names");
                return;
            }

            JSArray values = new JSArray();
            for (int i = 0; i < names.length(); i++) {
                String name = names.getString(i);
                if (name == null) throw new IllegalArgumentException("invalid photo file name");
                File target = fileFor(call, name);
                if (!target.exists()) {
                    values.put(JSObject.NULL);
                } else {
                    values.put(target.length());
                }
            }

            JSObject result = new JSObject();
            result.put("sizes", values);
            call.resolve(result);
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @PluginMethod
    public void removeFile(PluginCall call) {
        String name = call.getString("name");
        if (name == null) {
            call.reject("removeFile requires name");
            return;
        }
        try {
            File target = fileFor(call, name);
            if (!target.exists() || target.delete()) {
                call.resolve();
                return;
            }
            call.reject("could not delete " + target.getName());
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    /**
     * The absolute path of the photo directory, so the WebView can fetch a
     * file's bytes over Capacitor's local server instead of taking them
     * through this bridge as base64.
     *
     * <p>A plugin response crosses into the WebView as a JSON string, which
     * measured at 0.8MB/s on a Pixel 10a - so a decade of photos took seven
     * minutes to read and the cost was the crossing rather than the disk.
     * Fetching the same bytes over the local server keeps them binary the
     * whole way. The path never reaches the journal: android-file-store.ts
     * turns it into a URL and nothing above that seam sees either.
     */
    @PluginMethod
    public void directoryPath(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("path", photoDirectory(call).getAbsolutePath());
            call.resolve(result);
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    /** The reset's half of the photos (ux-carpet 214): the whole directory,
        before the key they are sealed under is erased. */
    @PluginMethod
    public void removeDirectory(PluginCall call) {
        try {
            PhotoFiles.deleteDirectory(getContext(), call.getString("directory", PhotoFiles.DEFAULT_DIRECTORY));
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @PluginMethod
    public void listFiles(PluginCall call) {
        try {
            String[] names = photoDirectory(call).list();
            if (names == null) names = new String[0];
            Arrays.sort(names);
            JSArray list = new JSArray();
            for (String name : names) if (!name.startsWith(".")) list.put(name);
            JSObject result = new JSObject();
            result.put("names", list);
            call.resolve(result);
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    private File photoDirectory(PluginCall call) {
        return PhotoFiles.directory(getContext(), call.getString("directory", PhotoFiles.DEFAULT_DIRECTORY));
    }

    private File fileFor(PluginCall call, String name) {
        return PhotoFiles.fileFor(getContext(), call.getString("directory", PhotoFiles.DEFAULT_DIRECTORY), name);
    }

    /** The size a content provider declares for a Uri, queried rather than
        read - OpenableColumns.SIZE is a column on the same cursor a file
        picker's own display row comes from, not a stream. -1 where the
        provider does not report one, which readBase64() takes as "unknown"
        rather than "refuse": a provider that cannot say is not evidence the
        file is oversized. */
    private long querySize(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver()
                .query(uri, new String[] { OpenableColumns.SIZE }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (index != -1 && !cursor.isNull(index)) return cursor.getLong(index);
            }
        }
        return -1;
    }

    /** Every URI's declared size is checked before any of them is held, as
        are the selection's count and total ({@link PickBudget}), so
        one oversized file in a multi-pick refuses the batch before a token
        for any of them exists - the same "none of them read" the web half
        gets from checking every File.size before the first arrayBuffer()
        (picker.ts).

        The application context, not the plugin's: a source outlives the
        activity result it came from by as long as it takes the WebView to
        ask for the bytes, and a static map holding an Activity would be a
        leak. */
    private List<String> hold(List<Uri> uris, long ceiling) throws IOException {
        long total = 0;
        for (Uri uri : uris) {
            long size = querySize(uri);
            if (size > ceiling) throw new IOException("too-large");
            if (size > 0) total += size;
        }
        PickBudget.check(uris.size(), total);

        Context context = getContext().getApplicationContext();
        List<PickedFiles.Source> sources = new ArrayList<>(uris.size());
        for (Uri uri : uris) {
            sources.add(() -> PhotoPickChannel.limit(context.getContentResolver().openInputStream(uri), ceiling));
        }
        return PickedFiles.hold(sources);
    }

    private static String message(Exception e) {
        return PhotoFiles.message(e);
    }
}
