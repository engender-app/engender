package dev.engender.app.files;

import static org.junit.Assert.*;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.security.MessageDigest;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class StagedFileTest {
    @Rule public TemporaryFolder folder = new TemporaryFolder();

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte value : bytes) result.append(String.format("%02x", value & 255));
        return result.toString();
    }

    @Test public void largeFileStagesWithoutAWholeStringAndIsRemovedAfterDelivery() throws Exception {
        File file = folder.newFile();
        byte[] piece = new byte[1024 * 1024];
        java.util.Arrays.fill(piece, (byte) 37);
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (StagedFile staged = new StagedFile(file)) {
            for (int i = 0; i < 405; i++) { staged.append((long) i * piece.length, piece); digest.update(piece); }
            staged.prepare(405L * piece.length, hex(digest.digest()));
            assertEquals(405L * piece.length, file.length());
        }
        assertFalse(file.exists());
    }

    @Test public void interruptedReplayedAndChangedFilesCannotBeDelivered() throws Exception {
        byte[] body = {1, 2, 3};
        String hash = hex(MessageDigest.getInstance("SHA-256").digest(body));
        try (StagedFile staged = new StagedFile(folder.newFile())) {
            staged.append(0, body);
            assertThrows(IllegalStateException.class, () -> staged.append(0, body));
            assertThrows(IllegalStateException.class, () -> staged.prepare(4, hash));
            staged.prepare(3, hash);
            assertThrows(IllegalStateException.class, () -> staged.append(3, body));
        }
        assertThrows(IllegalStateException.class, () -> StagedFile.verify(new ByteArrayInputStream(new byte[] {1, 2}), 3, hash));
        assertThrows(IllegalStateException.class, () -> StagedFile.verify(new ByteArrayInputStream(new byte[] {1, 2, 4}), 3, hash));
    }

    @Test public void jsonByteCountsAcceptBothIntegerWidthsAndRejectInvalidValues() {
        assertEquals(0L, StagedFile.byteCount(0));
        assertEquals(405L * 1024 * 1024, StagedFile.byteCount(405 * 1024 * 1024));
        assertEquals(3_000_000_000L, StagedFile.byteCount(3_000_000_000L));
        for (Object invalid : new Object[] {null, -1, 0.5, "3", 9007199254740992L}) {
            assertThrows(IllegalStateException.class, () -> StagedFile.byteCount(invalid));
        }
    }
}
