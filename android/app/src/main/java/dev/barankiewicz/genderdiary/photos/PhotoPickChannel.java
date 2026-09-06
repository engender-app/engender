package dev.barankiewicz.genderdiary.photos;

import android.util.Log;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebMessagePortCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The pick half of the photo bridge (phase 9 audit ticket 06), the same
 * {@link PhotoWriteChannel} mechanism run in the other direction.
 *
 * <p>Writes escaped the Capacitor plugin-call queue because bytes crossing it
 * become a JSON string; picks pay the same crossing plus a decode the write
 * path never had, because a base64 string has to be turned back into a
 * {@code Uint8Array} on the WebView's main thread. Over a 25 MB scan - the
 * size a document really reaches, since a PDF is stored exactly as it
 * arrived and there is no normalisation path for one - that measured 1054ms
 * of blocked main thread against 4ms for a typed decode, with the base64
 * string, {@code atob}'s intermediate binary string and the final array all
 * live at once.
 *
 * <p>The protocol is a half of the write channel's, because only one message
 * carries bytes:
 *
 * <ol>
 *   <li>JS opens a {@code MessageChannel} and posts the token a pick handed
 *       it, as JSON, to {@code window.androidPhotoPickChannel}, transferring
 *       one port along with it.</li>
 *   <li>This class redeems that token with {@link PickedFiles}, reads the
 *       file on a worker thread, and posts the bytes back on the transferred
 *       port as an {@code ArrayBuffer}.</li>
 *   <li>A failure comes back on the same port as a JSON string,
 *       {@code {"ok":false,"error":...}}. A WebMessage carries either bytes
 *       or a string and never both, so the reply's own type is what tells
 *       the two apart - no envelope, and no copy of the bytes into one.</li>
 * </ol>
 *
 * <p>{@link #registerIfSupported} is a no-op below the WebView versions that
 * carry {@code WEB_MESSAGE_LISTENER} and {@code WEB_MESSAGE_ARRAY_BUFFER},
 * the same two the write channel needs. The app's floor is WebView 87, below
 * both (ADR-0023), so {@code window.androidPhotoPickChannel} is not always
 * there and {@code picker.ts} falls back to the plugin's own
 * {@code readPickedBase64} exactly where it does not exist.
 */
public final class PhotoPickChannel {
    private static final String TAG = "PhotoPickChannel";
    private static final String CHANNEL_NAME = "androidPhotoPickChannel";

    /** One thread, because picker.ts reads a multi-pick's files one at a
        time - deliberately, so the WebView holds one file rather than the
        whole pick - and a pool here would only ever have one job in it. */
    private final ExecutorService reads = Executors.newSingleThreadExecutor();

    private PhotoPickChannel() {}

    /** Registers the channel against {@code webView}, or does nothing where the
        WebView cannot carry it. Must run after the WebView exists, which for a
        {@code BridgeActivity} means after {@code super.onCreate}. */
    public static void registerIfSupported(WebView webView, String originRule) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
            || !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER)) {
            Log.i(TAG, "WebView lacks WEB_MESSAGE_LISTENER/WEB_MESSAGE_ARRAY_BUFFER; picked bytes stay on the bridge");
            return;
        }
        new PhotoPickChannel().register(webView, originRule);
    }

    private void register(WebView webView, String originRule) {
        WebViewCompat.addWebMessageListener(
            webView,
            CHANNEL_NAME,
            Collections.singleton(originRule),
            (view, message, sourceOrigin, isMainFrame, replyProxy) -> onRequest(message)
        );
    }

    private void onRequest(WebMessageCompat message) {
        WebMessagePortCompat[] ports = message.getPorts();
        if (ports == null || ports.length == 0) {
            Log.w(TAG, "pick request arrived without a reply port; dropping it");
            return;
        }
        WebMessagePortCompat port = ports[0];

        String token;
        try {
            token = new JSONObject(message.getData()).getString("token");
        } catch (JSONException e) {
            replyError(port, "invalid pick request");
            return;
        }

        PickedFiles.Source source = PickedFiles.take(token);
        if (source == null) {
            replyError(port, "unknown picked file");
            return;
        }

        reads.execute(() -> readAndReply(port, source));
    }

    private void readAndReply(WebMessagePortCompat port, PickedFiles.Source source) {
        try (InputStream input = source.open()) {
            if (input == null) throw new IllegalStateException("could not read selected file");
            port.postMessage(new WebMessageCompat(readFully(input)));
        } catch (Exception e) {
            replyError(port, PhotoFiles.message(e));
        }
    }

    /** The one buffer the bytes pass through. The size a content provider
        declares is not trusted to size it: {@code PhotosPlugin} has already
        refused anything declaring more than the ceiling, and a provider that
        declares nothing (or lies low) would otherwise size this array wrong
        rather than simply growing it. */
    private static byte[] readFully(InputStream input) throws Exception {
        ByteArrayOutputStream collected = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) != -1) collected.write(buffer, 0, read);
        return collected.toByteArray();
    }

    private void replyError(WebMessagePortCompat port, String error) {
        JSONObject body = new JSONObject();
        try {
            body.put("ok", false);
            body.put("error", error);
        } catch (JSONException ignored) {
            // "ok" and a string are always representable; this cannot fire.
        }
        port.postMessage(new WebMessageCompat(body.toString()));
    }
}
