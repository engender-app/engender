package dev.engender.app.backup;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/**
 * Which archive in the auto-export folder a folder sync merges. Kept apart from the plugin, like {@link BackupRetention},
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
    static final String EXTENSION = ".gnd";
    /** The name before backups became .gnd (after the app's first name), still carried
     *  by older files and by a phone on an older build. Mirrors container.ts. */
    static final String LEGACY_EXTENSION = ".ttbackup";

    /** A backup by its name: either extension. Restore checks the contents. */
    static boolean isArchiveName(String name) {
        return name != null && (name.endsWith(EXTENSION) || name.endsWith(LEGACY_EXTENSION));
    }

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
            if (!isArchiveName(name)) continue;
            if (document.length() <= 0) continue;
            if (own.contains(document.uri())) continue;
            if (document.lastModified() < mergedThrough) continue;
            if (document.lastModified() == mergedThrough && triedAtMergedThrough.contains(document.uri())) continue;
            if (newest == null || document.lastModified() > newest.lastModified()) newest = document;
        }
        return newest;
    }

    /** The folder's position: the last archive's time and the ones tried at it. */
    static final class Position {
        final long mergedThrough;
        final List<String> tried;
        Position(long mergedThrough, List<String> tried) {
            this.mergedThrough = mergedThrough;
            this.tried = tried;
        }
    }

    /**
     * Where the position goes once an archive ends. Null leaves it where it
     * was: a cancelled Merge, and one this device ran out of space for
     * (re-check carpet 13), take the same archive again on the next open.
     * Any other outcome moves past it, so an archive that would not open is
     * reported once rather than on every open.
     */
    static Position after(Position before, long modifiedAt, String stagedUri, String outcome) {
        if ("cancelled".equals(outcome) || "no-space".equals(outcome)) return null;
        long through = Math.max(modifiedAt, before.mergedThrough);
        // The archives tried at the watermark: one more when it holds, a fresh list when it moves.
        List<String> tried = through == before.mergedThrough ? new ArrayList<>(before.tried) : new ArrayList<>();
        if (through == modifiedAt && stagedUri != null) tried.add(stagedUri);
        return new Position(through, tried);
    }
}
