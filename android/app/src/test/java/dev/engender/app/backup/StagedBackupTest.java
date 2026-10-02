package dev.engender.app.backup;

import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertFalse;

import java.io.File;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class StagedBackupTest {
    @Rule public TemporaryFolder folder = new TemporaryFolder();

    @Test public void emptyDeliveryCannotBecomeABackup() throws Exception {
        File file = folder.newFile();
        try (StagedBackup backup = new StagedBackup(file)) {
            assertThrows(IllegalStateException.class,
                () -> backup.prepare(0, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"));
        }
    }
    @Test public void emptyAndReplayedPiecesAreRejected() throws Exception {
        File file = folder.newFile();
        try (StagedBackup backup = new StagedBackup(file)) {
            assertThrows(IllegalStateException.class, () -> backup.append(0, new byte[0]));
            backup.append(0, new byte[] {1});
            assertThrows(IllegalStateException.class, () -> backup.append(0, new byte[] {1}));
            assertThrows(IllegalStateException.class,
                () -> backup.append(1, new byte[StagedBackup.MAX_PIECE_BYTES + 1]));
        }
        assertFalse(file.exists());
    }

    @Test public void aCompleteFrameCanBePreparedAgainForDestinationRetry() throws Exception {
        byte[] bytes = framedBytes(1, 29);
        try (StagedBackup backup = new StagedBackup(folder.newFile())) {
            backup.append(0, bytes);
            backup.prepare(bytes.length, sha256(bytes));
            backup.prepare(bytes.length, sha256(bytes));
            assertThrows(IllegalStateException.class, () -> backup.append(bytes.length, new byte[] {1}));
        }
    }

    @Test public void headerOnlyAndMissingFramesAreRejectedEvenWithMatchingHash() throws Exception {
        for (byte[] bytes : new byte[][] {framedBytes(1, 0), framedBytes(2, 29)}) {
            try (StagedBackup backup = new StagedBackup(folder.newFile())) {
                backup.append(0, bytes);
                assertThrows(IllegalStateException.class, () -> backup.prepare(bytes.length, sha256(bytes)));
            }
        }
    }

    @Test public void incompleteBridgeDeliveryCannotBeCommitted() throws Exception {
        byte[] bytes = framedBytes(1, 29);
        try (StagedBackup backup = new StagedBackup(folder.newFile())) {
            backup.append(0, java.util.Arrays.copyOf(bytes, bytes.length - 1));
            assertThrows(IllegalStateException.class, () -> backup.prepare(bytes.length, sha256(bytes)));
        }
    }

    @Test public void changedOrTruncatedDestinationBytesFailReadBack() throws Exception {
        byte[] bytes = framedBytes(1, 29);
        String expected = sha256(bytes);
        StagedBackup.verify(new ByteArrayInputStream(bytes), bytes.length, expected);
        assertThrows(IllegalStateException.class,
            () -> StagedBackup.verify(new ByteArrayInputStream(bytes), bytes.length + 1, expected));
        assertThrows(IllegalStateException.class,
            () -> StagedBackup.verify(new ByteArrayInputStream(bytes), bytes.length - 1, expected));
        bytes[bytes.length - 1] ^= 1;
        assertThrows(IllegalStateException.class,
            () -> StagedBackup.verify(new ByteArrayInputStream(bytes), bytes.length, expected));
    }

    private static byte[] framedBytes(int totalChunks, int frameLength) throws Exception {
        byte[] json = ("{\"chunkSize\":1048576,\"totalChunks\":" + totalChunks + "}")
            .getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream output = new DataOutputStream(bytes)) {
            output.write("GDIARY".getBytes(StandardCharsets.US_ASCII));
            output.writeShort(2);
            output.writeInt(json.length);
            output.write(json);
            output.write(new byte[frameLength]);
        }
        return bytes.toByteArray();
    }

    private static String sha256(byte[] bytes) throws Exception {
        StringBuilder hex = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) hex.append(String.format("%02x", value & 0xff));
        return hex.toString();
    }

}
