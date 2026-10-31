package dev.engender.app.backup;

import java.util.Collection;
import java.util.List;

/**
 * Which archive in the auto-export folder a folder sync merges (functional
 * audit ticket 49). Kept apart from the plugin, like {@link BackupRetention},
 * so the rule has a JVM test without a document provider behind it.
 *
 * <p>Only an archive another device wrote counts. This device's own are the
 * URIs it recorded as verified backups, the same list retention prunes by,
 * so a file that list names is never merged back into the journal that
 * wrote it. Among the others the newest one modified after the last one
 * merged is taken: an auto-export is the whole journal, so the newest says
 * everything the older ones did. Two archives can share a modification
 * time, so the ones already tried at the last one's time are named rather
 * than all of that millisecond being skipped.
 */
final class FolderArchives {
    static final String EXTENSION = ".ttbackup";

    interface Document {
        String uri();
        String name();
        long lastModified();
        long length();
    }

    private FolderArchives() { }

    static <D extends Document> D newest(List<D> documents, Collection<String> own, long mergedThrough,
                                         Collection<String> triedAtMergedThrough) {
        D newest = null;
        for (D document : documents) {
            String name = document.name();
            if (name == null || !name.endsWith(EXTENSION)) continue;
            if (document.length() <= 0) continue;
            if (own.contains(document.uri())) continue;
            if (document.lastModified() < mergedThrough) continue;
            if (document.lastModified() == mergedThrough && triedAtMergedThrough.contains(document.uri())) continue;
            if (newest == null || document.lastModified() > newest.lastModified()) newest = document;
        }
        return newest;
    }
}
