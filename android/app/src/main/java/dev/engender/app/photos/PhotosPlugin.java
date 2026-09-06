package dev.engender.app.photos;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
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
@CapacitorPlugin(name = "Photos")
public class PhotosPlugin extends Plugin {

    /** Sits beside documents/limits.ts's DOCUMENT_SIZE_CEILING (25 MB) - the
        JS side has no File to ask a size of for a bridge pick, so this is
        the number hold() checks a content provider's declared size against
        before a token for that file is ever handed out. */
    private static final long DOCUMENT_SIZE_CEILING = 25L * 1024 * 1024;

    @PluginMethod
    public void pickImages(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent = new Intent(MediaStore.ACTION_PICK_IMAGES);
        } else {
            intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("image/*");
        }
        startActivityForResult(call, intent, "pickedImages");
    }

    @PluginMethod
    public void captureImage(PluginCall call) {
        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (intent.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("camera unavailable");
            return;
        }
        startActivityForResult(call, intent, "capturedImage");
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
            for (String token : hold(uris)) tokens.put(token);
            result.put("tokens", tokens);
            call.resolve(result);
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @ActivityCallback
    private void capturedImage(PluginCall call, ActivityResult activityResult) {
        JSObject result = new JSObject();

        if (activityResult == null || activityResult.getResultCode() != Activity.RESULT_OK) {
            result.put("token", JSObject.NULL);
            call.resolve(result);
            return;
        }

        Intent data = activityResult.getData();
        if (data == null) {
            result.put("token", JSObject.NULL);
            call.resolve(result);
            return;
        }

        try {
            Bundle extras = data.getExtras();
            if (extras == null) {
                result.put("token", JSObject.NULL);
                call.resolve(result);
                return;
            }
            Object thumbnail = extras.get("data");
            if (!(thumbnail instanceof Bitmap)) {
                result.put("token", JSObject.NULL);
                call.resolve(result);
                return;
            }

            /* The one pick whose bytes exist before anything asks for them:
               the camera hands back a Bitmap in the activity result, not a
               URI to reopen, so this is the compressed copy of it. */
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            ((Bitmap) thumbnail).compress(Bitmap.CompressFormat.JPEG, 92, output);
            result.put(
                "token",
                PickedFiles.hold(Collections.singletonList(PickedFiles.ofBytes(output.toByteArray()))).get(0));
            call.resolve(result);
        } catch (Exception e) {
            call.reject(message(e), e);
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
            result.put("token", hold(Collections.singletonList(uri)).get(0));
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

    /**
     * The floor's transport for a picked file's bytes: base64 over the
     * bridge, for the WebView versions {@link PhotoPickChannel} cannot
     * register on (ADR-0023). picker.ts calls this only where
     * {@code window.androidPhotoPickChannel} does not exist, and loops on
     * it until {@code done}.
     *
     * <p><b>A piece per call, because a plugin response is one string by
     * construction</b> (phase 9 audit ticket 14). Handing back a whole file
     * meant {@code toString("US-ASCII")} materialising the entire encoding
     * as a Java String - two bytes a character, so 34 MB for a file at the
     * 25 MB document ceiling - and on the API 35 emulator's 192 MB growth
     * limit that allocation is refused and the pick is refused with it. A
     * scan really does reach the ceiling, because a document is stored
     * exactly as it arrived (ADR-0065), so this was the ceiling failing on
     * every WebView below 105 rather than a corner of it.
     *
     * <p><b>Why this and not the other two routes.</b> Raising the WebView
     * floor from 87 to 105 would delete this method, and ADR-0023 has
     * already answered that shape: a capability the floor does not cover is
     * a bug to fix while it is cheap, not a reason to raise the floor and
     * lose the devices in between. Having native write the picked file into
     * the app-private directory and hand JavaScript a name would work at the
     * floor, and loses for the reason android-pick-channel.ts's header gives
     * at length: files at rest are encrypted per file in JavaScript
     * (ADR-0018/ADR-0020), so a name means a picked scan sitting on disk in
     * plaintext until the encrypt finishes and past a crash. Chunking is the
     * one of the three that changes no version condition and no security
     * property - it is only slower, on the path that was already the slow
     * one.
     *
     * <p>{@link PickedFiles#readChunk} owns the stream between calls and
     * every way a read ends. {@code PhotoPickChannelTest} records what this
     * costs against the channel.
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
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            try (FileOutputStream out = new FileOutputStream(target, false)) {
                out.write(bytes);
            }
            call.resolve();
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

    @PluginMethod
    public void listFiles(PluginCall call) {
        try {
            String[] names = photoDirectory(call).list();
            if (names == null) names = new String[0];
            Arrays.sort(names);
            JSArray list = new JSArray();
            for (String name : names) list.put(name);
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

    /** Every URI's declared size is checked before any of them is held, so
        one oversized file in a multi-pick refuses the batch before a token
        for any of them exists - the same "none of them read" the web half
        gets from checking every File.size before the first arrayBuffer()
        (picker.ts).

        The application context, not the plugin's: a source outlives the
        activity result it came from by as long as it takes the WebView to
        ask for the bytes, and a static map holding an Activity would be a
        leak. */
    private List<String> hold(List<Uri> uris) throws IOException {
        for (Uri uri : uris) {
            if (querySize(uri) > DOCUMENT_SIZE_CEILING) throw new IOException("too-large");
        }

        Context context = getContext().getApplicationContext();
        List<PickedFiles.Source> sources = new ArrayList<>(uris.size());
        for (Uri uri : uris) {
            sources.add(() -> context.getContentResolver().openInputStream(uri));
        }
        return PickedFiles.hold(sources);
    }

    private static String message(Exception e) {
        return PhotoFiles.message(e);
    }
}
