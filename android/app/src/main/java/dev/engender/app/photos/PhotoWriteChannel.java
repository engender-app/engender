package dev.engender.app.photos;

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

import java.util.Collections;

/** Writes WebView photo bytes off the Capacitor plugin-call queue. A
 * structured-clone {@code ArrayBuffer} avoids the JSON and base64 conversion
 * measured at 0.8 MB/s on the bridge.
 *
 * <p>JavaScript posts the name and directory as JSON and transfers a port.
 * {@link #onPostMessage} reads the header, then receives the bytes on the
 * transferred port. A worker writes them to disk and the port acknowledges
 * success only after the write lands. Restore relies on that ordering.
 * A failed write returns a JSON error.
 *
 * <p>{@link #registerIfSupported} requires WEB_MESSAGE_LISTENER and
 * WEB_MESSAGE_ARRAY_BUFFER. When unavailable, android-file-store.ts writes
 * through the base64 bridge.
 */
public final class PhotoWriteChannel {
    private static final String TAG = "PhotoWriteChannel";
    private static final String CHANNEL_NAME = "androidPhotoWriteChannel";

    private final Context appContext;
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
            WebMessageReplies.dropped(TAG, "a write header");
            return;
        }
        WebMessagePortCompat port = ports[0];

        String name;
        String directory;
        try {
            JSONObject header = new JSONObject(message.getData());
            name = header.getString("name");
            directory = header.optString("directory", PhotoFiles.DEFAULT_DIRECTORY);
        } catch (JSONException e) {
            WebMessageReplies.replyError(port, "invalid write header");
            return;
        }

        final PhotoWriteOrder.Request request;
        try {
            request = PhotoFiles.reserveWrite(PhotoFiles.fileFor(appContext, directory, name));
        } catch (Exception error) {
            WebMessageReplies.replyError(port, PhotoFiles.message(error));
            return;
        }
        request.result.whenComplete((ignored, error) -> {
            try {
                if (error == null) port.postMessage(new WebMessageCompat("{\"ok\":true}"));
                else {
                    Throwable cause = error.getCause() == null ? error : error.getCause();
                    WebMessageReplies.replyError(port, PhotoFiles.message(cause));
                }
            } catch (RuntimeException closedPort) {
                // JavaScript may have timed out and closed its reply port.
            } finally {
                port.close();
            }
        });
        port.setWebMessageCallback(new WebMessagePortCompat.WebMessageCallbackCompat() {
            @Override
            public void onMessage(@NonNull WebMessagePortCompat p, @Nullable WebMessageCompat payload) {
                if (payload == null || payload.getType() != WebMessageCompat.TYPE_ARRAY_BUFFER) {
                    request.fail(new java.io.IOException("expected a binary payload"));
                    return;
                }
                request.accept(payload.getArrayBuffer());
            }
        });
    }
}
