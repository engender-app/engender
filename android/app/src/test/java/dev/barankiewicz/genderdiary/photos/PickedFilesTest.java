package dev.barankiewicz.genderdiary.photos;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * The token store between a pick and whichever transport reads its bytes
 * (phase 9 audit ticket 06). Pure logic, so a JVM test rather than an
 * instrumented one - {@code PhotoPickChannelTest} is where the channel that
 * redeems these tokens meets a real WebView.
 *
 * <p>The chunked half is phase 9 audit ticket 14's: the base64 fallback
 * hands a picked file back a piece at a time, so unlike {@link
 * PickedFiles#take} its entry has to survive between bridge calls. What
 * these check is the lifetime that follows from that - when the stream is
 * opened, when it is closed, and that nothing can read a token twice.
 */
public class PickedFilesTest {

    private static PickedFiles.Source bytes(int... values) {
        byte[] payload = new byte[values.length];
        for (int i = 0; i < values.length; i++) payload[i] = (byte) values[i];
        return PickedFiles.ofBytes(payload);
    }

    /** A stream that says whether it was closed, which is the half of a
        chunked read no return value reports. */
    private static final class WatchedStream extends ByteArrayInputStream {
        boolean closed;

        WatchedStream(byte[] payload) {
            super(payload);
        }

        @Override
        public void close() throws IOException {
            closed = true;
            super.close();
        }
    }

    private static byte[] read(PickedFiles.Source source) throws Exception {
        try (InputStream input = source.open()) {
            byte[] buffer = new byte[64];
            int read = input.read(buffer);
            return Arrays.copyOf(buffer, read == -1 ? 0 : read);
        }
    }

    @Test
    public void aTokenRedeemsTheSourceItWasHandedOutFor() throws Exception {
        List<String> tokens = PickedFiles.hold(Arrays.asList(bytes(1, 2), bytes(3)));

        assertEquals(2, tokens.size());
        assertNotEquals(tokens.get(0), tokens.get(1));
        assertArrayEquals(new byte[] { 1, 2 }, read(PickedFiles.take(tokens.get(0))));
        assertArrayEquals(new byte[] { 3 }, read(PickedFiles.take(tokens.get(1))));
    }

    /** One read per pick is all either transport needs, and an entry that
        outlived its read would be a picked file held open for nothing. */
    @Test
    public void aTokenIsGoodOnce() {
        String token = PickedFiles.hold(Collections.singletonList(bytes(1))).get(0);

        PickedFiles.take(token);

        assertNull(PickedFiles.take(token));
    }

    @Test
    public void aTokenNobodyHandedOutIsNull() {
        assertNull(PickedFiles.take("not-a-token"));
        assertNull(PickedFiles.take(null));
    }

    /** The bound: only the newest pick is held, so an abandoned one leaves
        nothing behind rather than accumulating until the process dies. */
    @Test
    public void aNewPickReplacesTheOneBeforeIt() {
        String stale = PickedFiles.hold(Collections.singletonList(bytes(1))).get(0);

        String fresh = PickedFiles.hold(Collections.singletonList(bytes(2))).get(0);

        assertNull(PickedFiles.take(stale));
        assertNotNull(PickedFiles.take(fresh));
    }

    /** A source is a supplier of a stream rather than the bytes, so nothing
        is read until a transport asks - which is what lets a 25 MB scan
        stay out of the Java heap between the pick and the read. */
    @Test
    public void holdingAFileDoesNotReadIt() {
        boolean[] opened = { false };
        PickedFiles.hold(Collections.<PickedFiles.Source>singletonList(() -> {
            opened[0] = true;
            return new ByteArrayInputStream(new byte[] { 1 });
        }));

        assertFalse(opened[0]);
    }

    /* ---- the chunked read (phase 9 audit ticket 14) ---- */

    /** The shape the base64 fallback needs: a buffer's worth per call until
        a short read says the file is finished. A short read rather than a
        separate flag because that is what makes the last chunk cost no
        extra bridge call for a file that does not divide evenly. */
    @Test
    public void aChunkedReadFillsTheBufferUntilTheFileRunsOut() throws Exception {
        String token = PickedFiles.hold(Collections.singletonList(bytes(1, 2, 3, 4, 5, 6, 7, 8, 9, 10))).get(0);
        byte[] buffer = new byte[4];

        assertEquals(4, PickedFiles.readChunk(token, buffer));
        assertArrayEquals(new byte[] { 1, 2, 3, 4 }, buffer);
        assertEquals(4, PickedFiles.readChunk(token, buffer));
        assertArrayEquals(new byte[] { 5, 6, 7, 8 }, buffer);
        assertEquals(2, PickedFiles.readChunk(token, buffer));
        assertArrayEquals(new byte[] { 9, 10 }, Arrays.copyOf(buffer, 2));
    }

    /** A stream that hands back less than it was asked for without being at
        its end - a content provider over a socket does this - must not be
        read as the end of the file, or a picked scan arrives truncated with
        nothing reporting it. */
    @Test
    public void aShortReadThatIsNotTheEndKeepsFilling() throws Exception {
        String token =
            PickedFiles.hold(Collections.<PickedFiles.Source>singletonList(
                () -> new ByteArrayInputStream(new byte[] { 1, 2, 3, 4, 5, 6 }) {
                    @Override
                    public synchronized int read(byte[] into, int off, int len) {
                        return super.read(into, off, Math.min(len, 1));
                    }
                })).get(0);
        byte[] buffer = new byte[4];

        assertEquals(4, PickedFiles.readChunk(token, buffer));
        assertArrayEquals(new byte[] { 1, 2, 3, 4 }, buffer);
    }

    /** A file whose length divides evenly by the buffer ends on an empty
        chunk rather than a short one - one extra call, and the alternative
        is the reader guessing. */
    @Test
    public void aFileThatDividesEvenlyEndsOnAnEmptyChunk() throws Exception {
        String token = PickedFiles.hold(Collections.singletonList(bytes(1, 2, 3, 4))).get(0);
        byte[] buffer = new byte[4];

        assertEquals(4, PickedFiles.readChunk(token, buffer));
        assertEquals(0, PickedFiles.readChunk(token, buffer));
    }

    /** The end of the chunked read is the end of the token, exactly as
        {@link PickedFiles#take} is: reading past it is a token nobody holds
        rather than a second copy of somebody's file. */
    @Test
    public void aFinishedChunkedReadLeavesNoToken() throws Exception {
        String token = PickedFiles.hold(Collections.singletonList(bytes(1, 2))).get(0);
        byte[] buffer = new byte[4];

        assertEquals(2, PickedFiles.readChunk(token, buffer));

        assertEquals(-1, PickedFiles.readChunk(token, buffer));
        assertNull(PickedFiles.take(token));
    }

    @Test
    public void aTokenNobodyHandedOutHasNoChunk() throws Exception {
        assertEquals(-1, PickedFiles.readChunk("not-a-token", new byte[4]));
        assertEquals(-1, PickedFiles.readChunk(null, new byte[4]));
    }

    /** The two transports read the same entry, so whichever asks first
        takes it - the channel and the fallback are alternatives for one
        pick, never both. */
    @Test
    public void aTokenTakenWholeHasNoChunksLeft() throws Exception {
        String token = PickedFiles.hold(Collections.singletonList(bytes(1, 2))).get(0);

        PickedFiles.take(token);

        assertEquals(-1, PickedFiles.readChunk(token, new byte[4]));
    }

    /** A read left part-way through holds a content provider's file open,
        which is the cost the whole-file transports never had. A new pick is
        proof the old one is abandoned. */
    @Test
    public void aNewPickClosesAReadLeftPartWay() throws Exception {
        WatchedStream stream = new WatchedStream(new byte[] { 1, 2, 3, 4, 5, 6 });
        String token = PickedFiles.hold(Collections.<PickedFiles.Source>singletonList(() -> stream)).get(0);
        PickedFiles.readChunk(token, new byte[2]);

        PickedFiles.hold(Collections.singletonList(bytes(9)));

        assertTrue("a pick left part-way through was not closed", stream.closed);
    }

    /** And so is the next file of a multi-pick: picker.ts reads them one at
        a time, so a second token's first chunk says the first one's read is
        over however it ended. */
    @Test
    public void theNextFilesFirstChunkClosesTheOneBeforeIt() throws Exception {
        WatchedStream stream = new WatchedStream(new byte[] { 1, 2, 3, 4, 5, 6 });
        List<String> tokens =
            PickedFiles.hold(Arrays.asList(() -> stream, PickedFiles.ofBytes(new byte[] { 9 })));
        PickedFiles.readChunk(tokens.get(0), new byte[2]);

        PickedFiles.readChunk(tokens.get(1), new byte[2]);

        assertTrue("the previous file's read was left open", stream.closed);
    }

    /** A read that fails part-way - an unmounted card, a file deleted from
        under the picker - leaves no token to try again with, the same
        recovery {@link PickedFiles#take} documents: pick again. */
    @Test
    public void aFailedChunkEndsTheRead() {
        String token =
            PickedFiles.hold(Collections.<PickedFiles.Source>singletonList(
                () -> new ByteArrayInputStream(new byte[] { 1, 2, 3, 4 }) {
                    @Override
                    public synchronized int read(byte[] into, int off, int len) {
                        throw new IllegalStateException("the card went away");
                    }
                })).get(0);

        assertThrows(IllegalStateException.class, () -> PickedFiles.readChunk(token, new byte[4]));

        assertNull(PickedFiles.take(token));
    }

    /** Opening the file is the first chunk's work, not the pick's - the
        same "nothing is read until a transport asks" the whole-file path
        has. */
    @Test
    public void theFirstChunkIsWhatOpensTheFile() throws Exception {
        boolean[] opened = { false };
        String token =
            PickedFiles.hold(Collections.<PickedFiles.Source>singletonList(() -> {
                opened[0] = true;
                return new ByteArrayInputStream(new byte[] { 1 });
            })).get(0);
        assertFalse(opened[0]);

        PickedFiles.readChunk(token, new byte[4]);

        assertTrue(opened[0]);
    }
}
