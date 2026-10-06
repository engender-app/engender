package dev.engender.app.backup;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;

public class BackupRetentionTest {
    private static final class Document implements BackupRetention.Document {
        final String uri;
        final String name;
        boolean deleted;
        boolean removable = true;
        Document(String uri, String name) { this.uri = uri; this.name = name; }
        public String uri() { return uri; }
        public String name() { return name; }
        public boolean delete() { deleted = removable; return deleted; }
    }

    @Test public void keepsFiveNewestVerifiedBackupsAndPreservesOtherDocuments() {
        List<String> verified = new ArrayList<>();
        List<Document> documents = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            verified.add("uri-" + i);
            documents.add(new Document("uri-" + i, "auto-backup-" + i + ".ttbackup"));
        }
        Document foreign = new Document("foreign", "auto-backup-0.ttbackup");
        Document manual = new Document("manual", "journal.ttbackup");
        verified.add(manual.uri);
        documents.add(foreign);
        documents.add(manual);

        BackupRetention.prune(verified, documents);

        assertEquals(Arrays.asList("uri-3", "uri-4", "uri-5", "uri-6", "uri-7", "manual"), verified);
        for (int i = 0; i < 8; i++) assertEquals(i < 3, documents.get(i).deleted);
        assertFalse(foreign.deleted);
        assertFalse(manual.deleted);
    }

    @Test public void aFailedDeleteKeepsOwnershipSoTheNextVerifiedBackupCanRetry() {
        List<String> verified = new ArrayList<>();
        List<Document> documents = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            verified.add("uri-" + i);
            documents.add(new Document("uri-" + i, "auto-backup-" + i + ".ttbackup"));
        }
        documents.get(0).removable = false;
        BackupRetention.prune(verified, documents);
        assertEquals(6, verified.size());
        assertFalse(documents.get(0).deleted);

        documents.get(0).removable = true;
        BackupRetention.prune(verified, documents);
        assertEquals(5, verified.size());
        assertTrue(documents.get(0).deleted);
    }

    @Test public void forgetsMissingDocumentsWithoutDeletingOtherFolders() {
        List<String> verified = new ArrayList<>(Arrays.asList("old-folder"));
        BackupRetention.prune(verified, new ArrayList<Document>());
        assertTrue(verified.isEmpty());
    }
}
