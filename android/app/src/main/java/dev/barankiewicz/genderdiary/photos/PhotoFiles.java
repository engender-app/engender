package dev.barankiewicz.genderdiary.photos;

import android.content.Context;

import java.io.File;
import java.io.IOException;

/**
 * Directory and file resolution for app-private photo storage, shared by
 * {@link PhotosPlugin} and {@link PhotoWriteChannel} (ticket 19). Both cross
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
