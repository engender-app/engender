package dev.engender.app.backup;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertNotNull;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

/** Which archive in the auto-export folder a folder sync merges. */
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
        assertEquals("b", FolderArchives.newest(folder, Collections.emptyList(), 0, Collections.emptyList()).uri);
    }

    @Test public void neverTakesAnArchiveThisDeviceWrote() {
        List<Document> folder = Arrays.asList(archive("mine", 50), archive("theirs", 20));
        assertEquals("theirs", FolderArchives.newest(folder, Collections.singletonList("mine"), 0, Collections.emptyList()).uri);
        assertNull(FolderArchives.newest(
            Collections.singletonList(archive("mine", 50)), Collections.singletonList("mine"), 0, Collections.emptyList()));
    }

    @Test public void takesNothingAtOrBeforeTheLastOneMerged() {
        List<Document> folder = Arrays.asList(archive("a", 10), archive("b", 20));
        assertNull(FolderArchives.newest(folder, Collections.emptyList(), 20, Collections.singletonList("b")));
        assertEquals("b", FolderArchives.newest(folder, Collections.emptyList(), 19, Collections.emptyList()).uri);
    }

    /* Backups were .ttbackup renamed them .gnd: a phone on an older build shares the folder,
       so its archives still count. */
    @Test public void takesAnotherDevicesArchiveUnderEitherExtension() {
        List<Document> folder = Arrays.asList(
            new Document("old", "auto-backup-20.ttbackup", 20, 100),
            new Document("new", "auto-backup-10.gnd", 10, 100));
        assertEquals("old", FolderArchives.newest(folder, Collections.emptyList(), 0, Collections.emptyList()).uri);
        assertEquals("new", FolderArchives.newest(folder, Collections.singletonList("old"), 0, Collections.emptyList()).uri);
        assertEquals("new", FolderArchives.newest(folder.subList(1, 2), Collections.emptyList(), 0, Collections.emptyList()).uri);
    }

    @Test public void skipsWhatIsNotAnArchiveOrIsEmpty() {
        List<Document> folder = Arrays.asList(
            new Document("tmp", ".syncthing.auto-backup.ttbackup.tmp", 90, 100),
            new Document("text", "notes.txt", 80, 100),
            new Document("empty", "auto-backup.ttbackup", 70, 0),
            new Document("unnamed", null, 60, 100),
            archive("real", 10));
        assertEquals("real", FolderArchives.newest(folder, Collections.emptyList(), 0, Collections.emptyList()).uri);
    }

    @Test public void anArchiveModifiedInTheSameMillisecondAsTheLastOneTriedIsStillTaken() {
        List<Document> folder = Arrays.asList(archive("tried", 20), archive("twin", 20));
        assertEquals("twin", FolderArchives.newest(folder, Collections.emptyList(), 20, Collections.singletonList("tried")).uri);
        assertNull(FolderArchives.newest(folder, Collections.emptyList(), 20, Arrays.asList("tried", "twin")));
    }

    /* a device that ran out of space keeps the folder's position, so the same archive is
       taken on the next open; any other ending moves past it, and a cancelled one leaves it
       too. */
    @Test public void aMergeThatRanOutOfSpaceLeavesThePositionSoTheArchiveIsTakenAgain() {
        FolderArchives.Position before = new FolderArchives.Position(10, Collections.singletonList("older"));
        assertNull(FolderArchives.after(before, 30, "b", "no-space"));
        assertNull(FolderArchives.after(before, 0, null, "no-space"));
        assertNull(FolderArchives.after(before, 30, "b", "cancelled"));
        List<Document> folder = Arrays.asList(archive("a", 10), archive("b", 30));
        assertEquals("b", FolderArchives.newest(folder, Collections.emptyList(), before.mergedThrough, before.tried).uri);
    }

    @Test public void anyOtherEndingMovesPastTheArchive() {
        FolderArchives.Position before = new FolderArchives.Position(10, Collections.singletonList("older"));
        for (String outcome : Arrays.asList("merged", "failed", "corrupt", "wrong-password")) {
            FolderArchives.Position next = FolderArchives.after(before, 30, "b", outcome);
            assertNotNull(outcome, next);
            assertEquals(outcome, 30, next.mergedThrough);
            assertEquals(outcome, Collections.singletonList("b"), next.tried);
            List<Document> folder = Arrays.asList(archive("a", 10), archive("b", 30));
            assertNull(outcome, FolderArchives.newest(folder, Collections.emptyList(), next.mergedThrough, next.tried));
        }
        FolderArchives.Position twin = FolderArchives.after(before, 10, "a", "failed");
        assertEquals(10, twin.mergedThrough);
        assertEquals(Arrays.asList("older", "a"), twin.tried);
    }
}
