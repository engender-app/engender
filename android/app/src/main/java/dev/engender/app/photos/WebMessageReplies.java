package dev.engender.app.photos;

import android.util.Log;

import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebMessagePortCompat;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * The failure reply both message channels send, in one place for the reason
 * {@link PhotoFiles} gives about the path-traversal guard: two transports
 * cross into native separately, but the same envelope reaches the same
 * parser on the other side.
 *
 * <p>{@code android-write-channel.ts} and {@code android-pick-channel.ts}
 * each read {@code {"ok":false,"error":...}} out of a string reply, so a
 * drift between two producers of it would be a silent failure on whichever
 * side stopped matching - the write would resolve as a success, or the pick
 * would report "unparseable reply" for a real error.
 *
 * <p>The success replies stay with their own channels, because they do not
 * share a shape: a write acks with {@code {"ok":true}} and a pick answers
 * with the bytes themselves.
 */
final class WebMessageReplies {
    private WebMessageReplies() {}

    static void replyError(WebMessagePortCompat port, String error) {
        JSONObject body = new JSONObject();
        try {
            body.put("ok", false);
            body.put("error", error);
        } catch (JSONException ignored) {
            // "ok" and a string are always representable; this cannot fire.
        }
        port.postMessage(new WebMessageCompat(body.toString()));
    }

    /** A message that arrived with no port to answer on: there is nowhere to
        send a failure, so the only thing left is to say so in the log rather
        than to throw on the WebView's callback thread. */
    static void dropped(String tag, String what) {
        Log.w(tag, what + " arrived without a reply port; dropping it");
    }
}
