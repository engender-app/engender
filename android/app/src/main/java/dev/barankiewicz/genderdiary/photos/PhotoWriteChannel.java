package dev.barankiewicz.genderdiary.photos;

import android.content.Context;
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

import java.io.File;
import java.io.FileOutputStream;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The write half of the photo bridge (ticket 19), moved off the Capacitor
 * plugin-call queue the same way ticket 07 moved reads off it. Reads escaped
 * by fetching from Capacitor's local server, but that server only serves
 * files - it has no matching path for the WebView to hand bytes back in - so
 * writes need a transport of their own rather than the read fix's mirror
 * image.
 *
 * <p>A {@code WebMessageListener} carries a JS {@code ArrayBuffer} across as
 * a structured-clone byte array. That is the mechanism: it never becomes a
 * JSON string, so it never pays the cost ticket 07 measured at 0.8MB/s
 * regardless of encoding. The protocol is a small handshake per write,
 * because a single WebMessage carries either a string or bytes, never both:
 *
 * <ol>
 *   <li>JS opens a {@code MessageChannel} and posts the write's name and
 *       directory, as JSON, to {@code window.androidPhotoWriteChannel},
 *       transferring one port along with it.</li>
 *   <li>This class reads that header on {@link #onPostMessage}, then listens
 *       on the transferred port for the second message.</li>
 *   <li>JS posts the photo bytes as an {@code ArrayBuffer} on its remaining
 *       port. This class writes them to the file the header named, on a
 *       worker thread so concurrent writes actually run concurrently rather
 *       than queuing behind the WebView's callback dispatch.</li>
 *   <li>The port replies with a small JSON ack, {@code {"ok":true}} or
 *       {@code {"ok":false,"error":...}}, once the bytes are on disk - so a
 *       caller that awaits the reply never sees success before the write
 *       lands, which is what keeps restore's ordering guarantee (ADR-0011)
 *       intact.</li>
 * </ol>
 *
 * <p>{@link #registerIfSupported} is a no-op below the WebView versions that
 * carry {@code WEB_MESSAGE_LISTENER} and {@code WEB_MESSAGE_ARRAY_BUFFER}.
 * ADR-0023 puts the app's floor at WebView 87, below both, so
 * {@code window.androidPhotoWriteChannel} is not always there - exactly the
 * gap {@code Object.hasOwn} and {@code crypto.randomUUID} left, closed the
 * same way: {@code android-file-store.ts} falls back to the base64 bridge
 * call when the fast channel does not exist.
 */
public final class PhotoWriteChannel {
    private static final String TAG = "PhotoWriteChannel";
    private static final String CHANNEL_NAME = "androidPhotoWriteChannel";

    private final Context appContext;
    private final ExecutorService writes = Executors.newFixedThreadPool(8);

    private PhotoWriteChannel(Context context) {
        this.appContext = context.getApplicationContext();
    }

    /** Registers the channel against {@code webView}, or does nothing where the
        WebView cannot carry it. Must run after the WebView exists, which for a
        {@code BridgeActivity} means after {@code super.onCreate}. */
    public static void registerIfSupported(Context context, WebView webView, String originRule) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
            || !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER)) {
            Log.i(TAG, "WebView lacks WEB_MESSAGE_LISTENER/WEB_MESSAGE_ARRAY_BUFFER; photo writes stay on the bridge");
            return;
        }
        new PhotoWriteChannel(context).register(webView, originRule);
    }

    private void register(WebView webView, String originRule) {
        WebViewCompat.addWebMessageListener(
            webView,
            CHANNEL_NAME,
            Collections.singleton(originRule),
            (view, message, sourceOrigin, isMainFrame, replyProxy) -> onHeader(message)
        );
    }

    private void onHeader(WebMessageCompat message) {
        WebMessagePortCompat[] ports = message.getPorts();
        if (ports == null || ports.length == 0) {
            Log.w(TAG, "write header arrived without a reply port; dropping it");
            return;
        }
        WebMessagePortCompat port = ports[0];

        String name;
        String directory;
        try {
            JSONObject header = new JSONObject(message.getData());
            name = header.getString("name");
            directory = header.optString("directory", "photos");
        } catch (JSONException e) {
            replyError(port, "invalid write header");
            return;
        }

        awaitBytes(port, name, directory);
    }

    private void awaitBytes(WebMessagePortCompat port, String name, String directory) {
        port.setWebMessageCallback(new WebMessagePortCompat.WebMessageCallbackCompat() {
            @Override
            public void onMessage(@NonNull WebMessagePortCompat p, @Nullable WebMessageCompat payload) {
                if (payload == null || payload.getType() != WebMessageCompat.TYPE_ARRAY_BUFFER) {
                    replyError(port, "expected a binary payload");
                    return;
                }
                byte[] bytes = payload.getArrayBuffer();
                writes.execute(() -> writeAndReply(port, name, directory, bytes));
            }
        });
    }

    private void writeAndReply(WebMessagePortCompat port, String name, String directory, byte[] bytes) {
        try {
            File target = PhotoFiles.fileFor(appContext, directory, name);
            try (FileOutputStream out = new FileOutputStream(target, false)) {
                out.write(bytes);
            }
            port.postMessage(new WebMessageCompat("{\"ok\":true}"));
        } catch (Exception e) {
            replyError(port, e.getMessage() == null ? e.getClass().getName() : e.getMessage());
        }
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
