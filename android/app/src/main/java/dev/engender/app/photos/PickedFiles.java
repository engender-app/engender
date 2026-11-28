package dev.engender.app.photos;

import java.io.ByteArrayInputStream;
import java.io.Closeable;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Holds one pick as file tokens. Each token supplies a fresh stream on demand.
 *
 * <p>{@link PhotoPickChannel} buffers a file when asked and releases the token
 * on acknowledgement. A timeout leaves the source available for the chunked
 * base64 fallback. Chunked reads keep one stream and buffer across calls to
 * keep allocation bounded for documents up to 25 MB. EOF, read failure, a
 * different token or a new pick closes that reader.
 *
 * <p>A new pick replaces the batch and expires old tokens. If the app locks
 * during a read, it can reopen a retained token once while its batch is current.
 */
public final class PickedFiles {

    /** A picked file, openable once the WebView asks for it. */
    public interface Source {
        InputStream open() throws Exception;
    }

    /** Insertion-ordered only so a multi-pick's tokens read in the order the
        person picked them; the map is small and always one pick's worth. */
    private static final Map<String, Source> HELD = new LinkedHashMap<>();

    /** What was handed over for reading, kept until the next pick or a reset
        so a read that lost a race with a lock can be taken back (reopen). It
        is one pick's worth, like HELD, and a file here is only a way to open
        it again, not a copy: camera bytes are the one exception, held in
        memory until the next pick. */
    private static final Map<String, Source> RETAINED = new LinkedHashMap<>();

    /** The one channel or chunked read in flight, and its token. Both
        null between reads. */
    private static String readingToken;
    private static InputStream reading;
    private static boolean channelReading;

    private PickedFiles() {}

    /** Replaces whatever the previous pick held, and answers a token per
        source in the order they were given. */
    public static synchronized List<String> hold(List<Source> sources) {
        endRead();
        HELD.clear();
        RETAINED.clear();
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
        token to try again with (only reopen, for a lock that landed
        mid-read, can bring one back, and only until the next pick). That is deliberate: the recovery is to pick
        again, which is also what the web half does when a File's
        arrayBuffer() rejects, and holding a token open for a retry nobody
        makes is the leak this store exists to avoid. */
    public static synchronized Source take(String token) {
        return token == null ? null : retain(token, HELD.remove(token));
    }

    private static Source retain(String token, Source source) {
        if (source != null) RETAINED.put(token, source);
        return source;
    }

    /** Makes a token that was read redeemable again, once: the page read a
        pick while the app was locking and keeps only the token instead of the
        bytes (stores/pendingPick.ts). False for a token no longer retained. */
    public static synchronized boolean reopen(String token) {
        Source source = token == null ? null : RETAINED.remove(token);
        if (source == null) return false;
        HELD.put(token, source);
        return true;
    }

    /** Keeps the source redeemable until JavaScript acknowledges the bytes.
        A timeout can then reopen it through the chunked transport. */
    static InputStream openForChannel(String token) throws Exception {
        final Source source;
        synchronized (PickedFiles.class) {
            source = HELD.get(token);
            if (source == null) return null;
            endRead();
        }
        InputStream opened = source.open();
        if (opened == null) throw new IllegalStateException("could not read selected file");
        synchronized (PickedFiles.class) {
            if (HELD.get(token) != source || reading != null) {
                close(opened);
                return null;
            }
            readingToken = token;
            reading = opened;
            channelReading = true;
        }
        return opened;
    }

    static synchronized void finishChannelRead(InputStream stream) {
        if (channelReading && reading == stream) endRead();
    }

    static synchronized void cancelChannelRead(String token) {
        if (channelReading && token.equals(readingToken)) endRead();
    }

    /** Drops every held pick: the device reset, so a file kept through a lock
        (pendingPick.ts) cannot outlive the journal it was picked for. */
    public static synchronized void clear() {
        endRead();
        HELD.clear();
        RETAINED.clear();
    }

    static synchronized void release(String token) {
        retain(token, HELD.remove(token));
        cancelChannelRead(token);
    }

    /** Fill {@code buffer} from the token's stream and return bytes read.
        Open on the first call and reuse the stream until EOF. Fill
        across short reads so only EOF returns less than buffer length.
        An exact multiple ends with an extra call returning 0.
        Close and drop the token on EOF or failure. Return -1 for absent
        tokens, including those taken by {@link #take}, and pick again.
        Hold the lock for each chunk so a new pick cannot close it mid-read. */
    public static synchronized int readChunk(String token, byte[] buffer) throws Exception {
        if (token == null) return -1;
        if (!token.equals(readingToken) || channelReading) {
            endRead();
            Source source = retain(token, HELD.remove(token));
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
        channelReading = false;
    }

    private static void close(Closeable stream) {
        if (stream == null) return;
        try {
            stream.close();
        } catch (Exception ignored) {
            // nothing to do about a file that will not close
        }
    }

    /** For camera bytes read before their disposable cache file is deleted. */
    public static Source ofBytes(byte[] bytes) {
        return () -> new ByteArrayInputStream(bytes);
    }
}
