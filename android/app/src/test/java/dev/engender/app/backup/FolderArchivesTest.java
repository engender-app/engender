package dev.engender.app.backup;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

/** Which archive in the auto-export folder a folder sync merges (FA 49). */
public class FolderArchivesTest {
    private static final class Document implements FolderArchives.Document {
        final String uri;
        final String name;
        final long modified;
        final long length;
        Document(String uri, String name, long modified, long length) {
            this.uri = uri; this.name = name; this.modified = modified; this.length = length;
        }
        public String uri() { return uri; }
        public String name() { return name; }
        public long lastModified() { return modified; }
        public long length() { return length; }
    }

    private static Document archive(String uri, long modified) {
        return new Document(uri, "auto-backup-" + modified + ".ttbackup", modified, 100);
    }

    @Test public void takesTheNewestArchiveAnotherDeviceWrote() {
        List<Document> folder = Arrays.asList(archive("a", 10), archive("b", 30), archive("c", 20));
        assertEquals("b", FolderArchives.newest(folder, Collections.emptyList(), 0).uri);
    }

    @Test public void neverTakesAnArchiveThisDeviceWrote() {
        List<Document> folder = Arrays.asList(archive("mine", 50), archive("theirs", 20));
        assertEquals("theirs", FolderArchives.newest(folder, Collections.singletonList("mine"), 0).uri);
        assertNull(FolderArchives.newest(
            Collections.singletonList(archive("mine", 50)), Collections.singletonList("mine"), 0));
    }

    @Test public void takesNothingAtOrBeforeTheLastOneMerged() {
        List<Document> folder = Arrays.asList(archive("a", 10), archive("b", 20));
        assertNull(FolderArchives.newest(folder, Collections.emptyList(), 20));
        assertEquals("b", FolderArchives.newest(folder, Collections.emptyList(), 19).uri);
    }

    @Test public void skipsWhatIsNotAnArchiveOrIsEmpty() {
        List<Document> folder = Arrays.asList(
            new Document("tmp", ".syncthing.auto-backup.ttbackup.tmp", 90, 100),
            new Document("text", "notes.txt", 80, 100),
            new Document("empty", "auto-backup.ttbackup", 70, 0),
            new Document("unnamed", null, 60, 100),
            archive("real", 10));
        assertEquals("real", FolderArchives.newest(folder, Collections.emptyList(), 0).uri);
    }
}
