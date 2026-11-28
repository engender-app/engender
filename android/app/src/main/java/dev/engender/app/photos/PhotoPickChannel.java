package dev.engender.app.photos;

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
import java.util.concurrent.atomic.AtomicBoolean;

/** Sends picked file bytes from a worker to the WebView as an ArrayBuffer.
 *
 * <p>A 25 MB document blocked the WebView main thread for 1054ms when
 * decoded through base64, compared with 4ms using the typed buffer.
 * The message port returns bytes on success and a JSON error string on
 * failure. {@link WebMessageReplies} defines the error format.
 *
 * <p>JavaScript transfers a port with the pick token. The worker redeems
 * it through {@link PickedFiles}. A {@code received} acknowledgement
 * consumes the token. {@code cancel} closes the reader and leaves the
 * source available for the chunked fallback.
 *
 * <p>Registration requires WEB_MESSAGE_LISTENER and WEB_MESSAGE_ARRAY_BUFFER.
 * When unavailable, picker.ts uses {@code readPickedChunk} to limit the
 * size of each bridge call.
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
            WebMessageReplies.dropped(TAG, "a pick request");
            return;
        }
        WebMessagePortCompat port = ports[0];

        String token;
        try {
            token = new JSONObject(message.getData()).getString("token");
        } catch (JSONException e) {
            WebMessageReplies.replyError(port, "invalid pick request");
            return;
        }

        AtomicBoolean cancelled = new AtomicBoolean();
        port.setWebMessageCallback(new WebMessagePortCompat.WebMessageCallbackCompat() {
            @Override
            public void onMessage(@NonNull WebMessagePortCompat p, @Nullable WebMessageCompat reply) {
                if (reply == null || reply.getType() != WebMessageCompat.TYPE_STRING) return;
                if ("received".equals(reply.getData())) {
                    PickedFiles.release(token);
                    port.close();
                } else if ("cancel".equals(reply.getData())) {
                    cancelled.set(true);
                    PickedFiles.cancelChannelRead(token);
                    port.close();
                }
            }
        });
        reads.execute(() -> readAndReply(port, token, cancelled));
    }

    private void readAndReply(WebMessagePortCompat port, String token, AtomicBoolean cancelled) {
        if (cancelled.get()) return;
        InputStream input = null;
        try {
            input = PickedFiles.openForChannel(token);
            if (input == null) throw new IllegalStateException("unknown picked file");
            if (cancelled.get()) return;
            byte[] bytes = readFully(input);
            if (!cancelled.get()) port.postMessage(new WebMessageCompat(bytes));
        } catch (Exception error) {
            if (!cancelled.get()) {
                PickedFiles.release(token);
                try {
                    WebMessageReplies.replyError(port, PhotoFiles.message(error));
                } finally {
                    port.close();
                }
            }
        } finally {
            PickedFiles.finishChannelRead(input);
        }
    }

    static InputStream limit(InputStream input, long ceiling) {
        return new java.io.FilterInputStream(input) {
            private long readBytes;

            private void count(int count) throws java.io.IOException {
                if (count > 0) readBytes += count;
                if (readBytes > ceiling) throw new java.io.IOException("too-large");
            }

            @Override
            public int read() throws java.io.IOException {
                int value = in.read();
                count(value == -1 ? 0 : 1);
                return value;
            }

            @Override
            public int read(byte[] bytes, int offset, int length) throws java.io.IOException {
                int count = in.read(bytes, offset, length);
                count(count);
                return count;
            }
        };
    }

    /** The one buffer the bytes pass through. The size a content provider
        declares is not trusted to size it: {@code PhotosPlugin} has already
        refused anything declaring more than the ceiling, and a provider that
        declares nothing (or lies low) would otherwise size this array wrong
        rather than simply growing it. The read also enforces the ceiling when
        the provider reports no size or reports less than it returns. */
    static byte[] readFully(InputStream input) throws Exception {
        ByteArrayOutputStream collected = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) != -1) {
            if (read > 50 * 1024 * 1024 - collected.size()) {
                throw new java.io.IOException("too-large");
            }
            collected.write(buffer, 0, read);
        }
        return collected.toByteArray();
    }
}
