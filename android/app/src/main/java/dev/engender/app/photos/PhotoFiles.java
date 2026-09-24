package dev.engender.app.photos;

import android.content.Context;

import java.io.File;
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

    private PhotoFiles() {}

    static File directory(Context context, String directoryName) {
        if (directoryName == null) directoryName = DEFAULT_DIRECTORY;
        if (directoryName.trim().isEmpty() || directoryName.contains("/") || directoryName.contains("\\")
            || directoryName.contains("..")) {
            throw new IllegalArgumentException("invalid photo directory name");
        }

        File directory = new File(context.getFilesDir(), directoryName);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("could not create photo directory " + directory);
        }
        if (!directory.isDirectory()) {
            throw new IllegalStateException(directory + " is not a directory");
        }

        File noMedia = new File(directory, ".nomedia");
        if (!noMedia.exists()) {
            try {
                if (!noMedia.createNewFile()) {
                    throw new IllegalStateException("could not create " + noMedia);
                }
            } catch (IOException e) {
                throw new IllegalStateException("could not create " + noMedia, e);
            }
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
        if (directoryName == null || directoryName.trim().isEmpty() || directoryName.contains("/")
            || directoryName.contains("\\") || directoryName.contains("..")) {
            throw new IllegalArgumentException("invalid photo directory name");
        }
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
    static String message(Exception e) {
        String detail = e.getMessage();
        return detail == null || detail.isEmpty() ? e.getClass().getName() : detail;
    }
}
