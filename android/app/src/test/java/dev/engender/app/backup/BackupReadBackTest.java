package dev.engender.app.backup;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertThrows;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;

/**
 * a backup counts as verified only when the written file opens with the saved
 * backup password. Before, the read-back compared bytes with what was meant
 * to be written, so a file sealed under a mistyped password was listed as
 * verified and pushed good backups out of retention.
 */
public class BackupReadBackTest {
    /** src/lib/data/journal/golden-archive-fixture.ts */
    private static final String GOLDEN_PASSWORD = "a golden horse, stapled";

    private static byte[] golden() throws Exception {
        try (InputStream in = BackupReadBackTest.class.getResourceAsStream("/golden-archive.ttbackup")) {
            assertNotNull("golden-archive.ttbackup is not on the test classpath - check build.gradle's sourceSets.test.resources", in);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            return out.toByteArray();
        }
    }

    private static String sha256(byte[] bytes) throws Exception {
        StringBuilder hex = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) hex.append(String.format("%02x", value & 0xff));
        return hex.toString();
    }

    private static void readBack(byte[] bytes, String password) throws Exception {
        DeliveredBackup.readBack(() -> new ByteArrayInputStream(bytes), bytes.length, sha256(bytes), password);
    }

    @Test public void aFileThatOpensWithTheSavedPasswordIsVerified() throws Exception {
        readBack(golden(), GOLDEN_PASSWORD);
    }

    @Test public void aFileSealedUnderAnotherPasswordIsNotVerifiedThoughItsBytesMatch() throws Exception {
        byte[] bytes = golden();
        assertThrows(IllegalStateException.class, () -> readBack(bytes, "a golden horse, stapLed"));
    }

    @Test public void aDamagedChunkIsNotVerifiedThoughItsHashWasTakenAfterTheDamage() throws Exception {
        byte[] bytes = golden();
        bytes[bytes.length - 20] ^= 1;
        assertThrows(IllegalStateException.class, () -> readBack(bytes, GOLDEN_PASSWORD));
    }

    @Test public void withNoSavedPasswordNothingIsVerified() throws Exception {
        byte[] bytes = golden();
        assertThrows(IllegalStateException.class, () -> readBack(bytes, null));
    }

    /** The order completeVerifiedBackup relies on: a URI joins the verified
        list only after writeAndVerify returns, and retention counts only that
        list. Five good backups and a sixth that does not open: the sixth is
        not counted, so none of the five is pruned. */
    @Test public void aBackupThatDoesNotOpenCannotPushAGoodOneOutOfRetention() throws Exception {
        List<String> verified = new ArrayList<>();
        List<BackupRetention.Document> documents = new ArrayList<>();
        boolean[] deleted = new boolean[6];
        for (int i = 0; i < 6; i++) {
            final int index = i;
            documents.add(new BackupRetention.Document() {
                public String uri() { return "uri-" + index; }
                public String name() { return "auto-backup-" + index + ".ttbackup"; }
                public boolean delete() { deleted[index] = true; return true; }
            });
        }
        for (int i = 0; i < 5; i++) verified.add("uri-" + i);

        byte[] bytes = golden();
        try {
            readBack(bytes, "not the password it was made with");
            verified.add("uri-5");
        } catch (IllegalStateException refused) {
            // Not verified: DeliveredBackup discards the written file.
        }
        BackupRetention.prune(verified, documents, uri -> true);

        assertEquals(Arrays.asList("uri-0", "uri-1", "uri-2", "uri-3", "uri-4"), verified);
        for (int i = 0; i < 5; i++) assertFalse("good backup " + i + " was pruned", deleted[i]);
    }
}
