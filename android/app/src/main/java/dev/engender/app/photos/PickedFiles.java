package dev.engender.app.photos;

import java.io.ByteArrayInputStream;
import java.io.Closeable;
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
 * structured clone, or {@code PhotosPlugin.readPickedChunk} where it cannot -
 * without the pick itself having to know which, and without the bytes being
 * read at all until something asks for them. Both of those matter for a
 * document: the ceiling is 25 MB and a scan reaches it.
 *
 * <p>A source is a supplier of a fresh stream rather than the bytes
 * themselves. Two things follow. Nothing sits in the Java heap for the
 * interval between the pick and the read - the read itself buffers the whole
 * file for {@link PhotoPickChannel} and a chunk of it for the base64
 * fallback, which is those transports' price and not this store's. And
 * either transport can consume the same entry its own way: {@link #take}
 * hands the whole source over at once, and {@link #readChunk} walks the same
 * source a buffer at a time.
 *
 * <p><b>The chunked read is the one entry that outlives a single call</b>
 * (phase 9 audit ticket 14). A Capacitor plugin response is one JSON string
 * by construction, so the only way for the base64 fallback to stay under a
 * bounded allocation is to answer a piece per call, which means the open
 * stream has to be here between them. One read is in flight at a time -
 * picker.ts reads a multi-pick's files one after another - so this is a
 * single slot rather than a map, and anything that says the previous read is
 * over closes it: reaching the end of the file, a failure, a chunk asked for
 * a different token, or a new pick.
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

    /** The one chunked read in flight, and the token it belongs to. Both
        null between reads. */
    private static String readingToken;
    private static InputStream reading;

    private PickedFiles() {}

    /** Replaces whatever the previous pick held, and answers a token per
        source in the order they were given. */
    public static synchronized List<String> hold(List<Source> sources) {
        endRead();
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
        already taken, or belonged to an earlier pick.

        Removed before the read rather than after it, so a read that fails
        (an unmounted card, a file deleted from under the picker) leaves no
        token to try again with. That is deliberate: the recovery is to pick
        again, which is also what the web half does when a File's
        arrayBuffer() rejects, and holding a token open for a retry nobody
        makes is the leak this store exists to avoid. */
    public static synchronized Source take(String token) {
        return token == null ? null : HELD.remove(token);
    }

    /** The next {@code buffer.length} bytes of the file {@code token} names,
        filling {@code buffer} from the start and answering how many bytes
        went into it. The file is opened on the first call for a token and
        the same stream continues on every call after it.

        <p>Fewer bytes than the buffer holds means the file is finished, and
        by then this has already closed it and dropped the token - so a file
        whose length divides evenly by the buffer ends on a 0, one extra
        call, rather than the caller having to guess. The fill loop is what
        makes that reliable: a stream may hand back less than it was asked
        for without being at its end, and reading that as the end of the file
        would truncate a picked scan with nothing reporting it.

        <p>-1 for a token that was never held, was taken whole by the other
        transport, or whose read has already finished - the same "pick again"
        recovery {@link #take} documents, including after a failure, which
        propagates with the read already ended.

        <p>A chunk's read from the content provider happens under this
        class's lock, where before only the map access did. That is a buffer
        at a time rather than a whole file, and it is what stops a pick
        arriving mid-read from racing the stream it is about to close. */
    public static synchronized int readChunk(String token, byte[] buffer) throws Exception {
        if (token == null) return -1;
        if (!token.equals(readingToken)) {
            endRead();
            Source source = HELD.remove(token);
            if (source == null) return -1;
            InputStream opened = source.open();
            if (opened == null) throw new IllegalStateException("could not read selected file");
            readingToken = token;
            reading = opened;
        }

        int filled = 0;
        try {
            while (filled < buffer.length) {
                int read = reading.read(buffer, filled, buffer.length - filled);
                if (read == -1) break;
                filled += read;
            }
        } catch (Exception e) {
            endRead();
            throw e;
        }
        if (filled < buffer.length) endRead();
        return filled;
    }

    /** Closes whatever read is in flight, quietly: every caller here is
        already saying the read is over, and a close that fails changes
        nothing any of them can do about it. */
    private static void endRead() {
        close(reading);
        readingToken = null;
        reading = null;
    }

    private static void close(Closeable stream) {
        if (stream == null) return;
        try {
            stream.close();
        } catch (Exception ignored) {
            // nothing to do about a file that will not close
        }
    }

    /** For bytes that exist already rather than behind a content provider:
        the camera's thumbnail, which arrives as a Bitmap in the activity
        result and has no URI to reopen. */
    public static Source ofBytes(byte[] bytes) {
        return () -> new ByteArrayInputStream(bytes);
    }
}
