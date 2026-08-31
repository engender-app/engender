package dev.barankiewicz.genderdiary.backup;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class AutoExportDerivationTest {

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    @Test
    public void derivationMatchesGoldenVectorsFromHashWasm() {
        byte[] salt1 = new byte[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16};
        byte[] key1 = AutoExportPlugin.deriveArgon2id("correct horse", salt1, 65536, 3, 1, 32);
        assertEquals(
            "c157c50f9f198840868c180e3cc89815b7d0aab8785fd4cf280e82ac440fba39",
            bytesToHex(key1)
        );

        byte[] salt2 = new byte[]{16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1};
        byte[] key2 = AutoExportPlugin.deriveArgon2id("another password 123!", salt2, 8192, 1, 1, 32);
        assertEquals(
            "fa081e0706300855bf325249b26a5dd959bdeec8644a96a1ecd90f9e76df6398",
            bytesToHex(key2)
        );
    }

    /** G-04: {@code deriveKey} no longer reads a cost off the bridge call at
        all, so there is no "absurd parameters" case left to send it - the
        elimination is structural, not something this test can exercise
        through a {@code PluginCall} without the WebView-backed
        {@code MessageHandler} that constructing one for real would need,
        which this test tier (no Robolectric) cannot provide. What this
        pins down instead: {@code deriveArchiveKey}, the method {@code
        deriveKey} actually calls, always produces the archive profile's
        bytes (ADR-0013) against the raw primitive, so a future change that
        reintroduces a caller-controlled cost parameter here breaks a byte
        comparison rather than passing silently. */
    @Test
    public void deriveArchiveKeyAlwaysRunsTheArchiveProfile() {
        byte[] salt = new byte[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16};
        byte[] expected = AutoExportPlugin.deriveArgon2id("correct horse", salt, 65536, 3, 1, 32);
        byte[] actual = AutoExportPlugin.deriveArchiveKey("correct horse", salt);
        assertArrayEquals(expected, actual);
    }
}
