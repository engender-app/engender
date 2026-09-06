package dev.barankiewicz.genderdiary.photos;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * The token store between a pick and whichever transport reads its bytes
 * (phase 9 audit ticket 06). Pure logic, so a JVM test rather than an
 * instrumented one - {@code PhotoPickChannelTest} is where the channel that
 * redeems these tokens meets a real WebView.
 */
public class PickedFilesTest {

    private static PickedFiles.Source bytes(int... values) {
        byte[] payload = new byte[values.length];
        for (int i = 0; i < values.length; i++) payload[i] = (byte) values[i];
        return PickedFiles.ofBytes(payload);
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
        assertEquals(true, PickedFiles.take(fresh) != null);
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

        assertEquals(false, opened[0]);
    }
}
