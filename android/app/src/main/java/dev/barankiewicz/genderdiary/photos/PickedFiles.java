package dev.barankiewicz.genderdiary.photos;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * What a pick hands the WebView instead of bytes (phase 9 audit ticket 06):
 * a token per file, redeemable once for that file's bytes.
 *
 * <p>The point of the indirection is that the redeeming can then happen over
 * whichever transport the WebView can carry - {@link PhotoPickChannel} as a
 * structured clone, or {@code PhotosPlugin.readPickedBase64} where it cannot -
 * without the pick itself having to know which, and without the bytes being
 * read at all until something asks for them. Both of those matter for a
 * document: the ceiling is 25 MB and a scan reaches it.
 *
 * <p>A source is a supplier of a fresh stream rather than the bytes
 * themselves, so nothing sits in the Java heap between the pick and the
 * read, and so either transport can consume the same entry its own way -
 * the base64 path still streams straight into a {@code Base64OutputStream}
 * exactly as it did before this indirection existed.
 *
 * <p><b>Only the most recent pick is held.</b> A pick is one user gesture
 * at a time - Capacitor delivers one activity result at a time, and
 * picker.ts reads every token of a multi-pick before its {@code pick()}
 * resolves - so nothing older can still be wanted. Keeping only the last
 * batch is what makes this bounded without a cap or an eviction policy: an
 * abandoned pick leaves nothing behind, and a token from one fails loudly
 * rather than answering with bytes from a file the person has since
 * replaced.
 */
public final class PickedFiles {

    /** A picked file, openable once the WebView asks for it. */
    public interface Source {
        InputStream open() throws Exception;
    }

    /** Insertion-ordered only so a multi-pick's tokens read in the order the
        person picked them; the map is small and always one pick's worth. */
    private static final Map<String, Source> HELD = new LinkedHashMap<>();

    private PickedFiles() {}

    /** Replaces whatever the previous pick held, and answers a token per
        source in the order they were given. */
    public static synchronized List<String> hold(List<Source> sources) {
        HELD.clear();
        List<String> tokens = new ArrayList<>(sources.size());
        for (Source source : sources) {
            String token = UUID.randomUUID().toString();
            HELD.put(token, source);
            tokens.add(token);
        }
        return tokens;
    }

    /** The source {@code token} names, removed as it is handed over - one
        read per pick is all either transport needs, and an entry that
        outlived its read would be a picked file the app is still holding
        open for no reason. Null for a token that was never held, was
        already taken, or belonged to an earlier pick. */
    public static synchronized Source take(String token) {
        return token == null ? null : HELD.remove(token);
    }

    /** For bytes that exist already rather than behind a content provider:
        the camera's thumbnail, which arrives as a Bitmap in the activity
        result and has no URI to reopen. */
    public static Source ofBytes(byte[] bytes) {
        return () -> new ByteArrayInputStream(bytes);
    }
}
