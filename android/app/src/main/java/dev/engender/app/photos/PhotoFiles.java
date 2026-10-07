package dev.engender.app.photos;

import android.content.Context;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * Directory and file resolution for app-private photo storage, shared by
 * {@link PhotosPlugin} and {@link PhotoWriteChannel}. Both cross
 * into native by a different transport, but the same name and directory can
 * reach either one, so the path-traversal guard has to live in one place
 * rather than twice.
 */
final class PhotoFiles {
    static final String DEFAULT_DIRECTORY = "photos";

    private static final PhotoWriteOrder writes = new PhotoWriteOrder();

    private PhotoFiles() {}

    static PhotoWriteOrder.Request reserveWrite(File target) {
        return writes.reserve(target.getAbsolutePath(), bytes -> {
            try (FileOutputStream out = new FileOutputStream(target, false)) {
                out.write(bytes);
                out.getFD().sync();
            }
        });
    }

    static File directory(Context context, String directoryName) {
        if (directoryName == null) directoryName = DEFAULT_DIRECTORY;
        validateDirectory(context, directoryName);

        File directory = new File(context.getFilesDir(), directoryName);
        if (!directory.exists() && !directory.mkdirs() && !directory.isDirectory()) {
            throw new IllegalStateException("could not create photo directory " + directory);
        }
        if (!directory.isDirectory()) {
            throw new IllegalStateException(directory + " is not a directory");
        }

        File noMedia = new File(directory, ".nomedia");
        if (!noMedia.exists()) {
            try {
                // Another worker may already have created the marker.
                noMedia.createNewFile();
            } catch (IOException e) {
                throw new IllegalStateException("could not create " + noMedia, e);
            }
        }
        if (!noMedia.isFile()) {
            throw new IllegalStateException(noMedia + " is not a file");
        }

        return directory;
    }

    /**
     * Deletes the photo directory and everything in it, for the reset
     * (ux-carpet 214). Nothing else ever removed it: the web's reset empties
     * OPFS, which is not where these live, and the orphan sweep that would
     * reach them skips any boot that writes, which a first run always does.
     * So every photo a journal had outlived its start-over, sealed under a
     * key that no longer exists, and kept its space.
     *
     * <p>Flat by construction - names are validated as single path segments
     * on the way in - so one level is everything. Throws rather than leaving
     * a part: a reset that half happened has to say so.
     */
    static void deleteDirectory(Context context, String directoryName) throws IOException {
        validateDirectory(context, directoryName);
        File directory = new File(context.getFilesDir(), directoryName);
        if (!directory.exists()) return;
        File[] children = directory.listFiles();
        if (children != null) {
            for (File child : children) {
                if (!child.delete() && child.exists()) throw new IOException("could not delete " + child.getName());
            }
        }
        if (!directory.delete() && directory.exists()) throw new IOException("could not delete " + directory);
    }

    private static void validateDirectory(Context context, String name) {
        if (DEFAULT_DIRECTORY.equals(name)) return;
        boolean debug = (context.getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (debug && name != null && (java.util.Arrays.asList(
            "write-channel-test", "wipe-test-photos", "initialization-test-photos",
            "contract-probe-photos", "encryption-probe-photos", "long-journal-photos",
            "long-journal-photos-one-year").contains(name)
            || name.matches("(?:ee|me|me2)-(?:wa|aw)-(?:source|replace|merge)-photos"))) return;
        throw new IllegalArgumentException("invalid photo directory name");
    }

    static File fileFor(Context context, String directoryName, String name) {
        String trimmed = name.trim();
        if (trimmed.isEmpty() || trimmed.contains("/") || trimmed.contains("\\") || trimmed.contains("..")) {
            throw new IllegalArgumentException("invalid photo file name");
        }
        return new File(directory(context, directoryName), trimmed);
    }

    /** Shared by both transports so a failure looks the same to either
        caller: a message when the exception has one, the exception's own
        class name when it does not. */
    static String message(Throwable e) {
        String detail = e.getMessage();
        return detail == null || detail.isEmpty() ? e.getClass().getName() : detail;
    }
}
