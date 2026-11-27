package dev.engender.app.files;

import android.os.ParcelFileDescriptor;
import android.system.Os;
import android.system.OsConstants;
import android.system.StructStat;
import android.system.StructStatVfs;
import java.io.IOException;

/**
 * Which storage ran out when a native operation failed. Capacitor hands
 * JavaScript a rejection's message and code and never its exception, so a
 * full disk has to become a code here or the screen can only say the export
 * failed.
 *
 * <p>{@link #DEVICE_FULL} is app-private storage on the phone, including
 * export staging and PIN attempt accounting; {@link #DESTINATION_FULL} is the
 * place picked in the save dialog, which can be another volume or a cloud
 * provider with no free space to measure. Every other failure keeps no code,
 * so it is never called a full disk.
 */
public final class StorageFailure {
    public static final String DEVICE_FULL = "storage-full";
    static final String DESTINATION_FULL = "destination-full";

    private StorageFailure() {}

    /** The preflight's refusal: the destination said how much space it has, and it is less than the export. */
    static final class DestinationFull extends IOException {
        DestinationFull(long needed, long available) {
            super("destination-full: needs " + needed + " bytes, has " + available);
        }
    }

    /** ENOSPC as libcore and java.nio word it, anywhere in the cause chain. */
    static boolean isOutOfSpace(Throwable error) {
        for (Throwable at = error; at != null; at = at.getCause() == at ? null : at.getCause()) {
            String message = at.getMessage();
            if (message != null && (message.contains("ENOSPC") || message.contains("No space left on device"))) return true;
        }
        return false;
    }

    /** The rejection code for a failure while writing to {@code where}, or null when it was not a full disk. */
    public static String code(Throwable error, String where) {
        if (error instanceof DestinationFull) return DESTINATION_FULL;
        return isOutOfSpace(error) ? where : null;
    }

    /**
     * Bytes free on the filesystem the destination's descriptor writes to, or
     * null when the provider did not hand over a regular file - a pipe from a
     * cloud provider has no free space of its own to read, and guessing from
     * the phone's would refuse exports that would have fit.
     */
    static Long availableBytes(ParcelFileDescriptor destination) {
        try {
            StructStat stat = Os.fstat(destination.getFileDescriptor());
            boolean regular = OsConstants.S_ISREG(stat.st_mode);
            if (!regular) return null;
            StructStatVfs space = Os.fstatvfs(destination.getFileDescriptor());
            return availableBytes(true, space.f_bavail, space.f_frsize, space.f_bsize);
        } catch (Exception unknown) {
            return null;
        }
    }

    static Long availableBytes(boolean regularFile, long availableBlocks, long fragmentSize, long blockSize) {
        if (!regularFile || availableBlocks < 0) return null;
        long unit = fragmentSize > 0 ? fragmentSize : blockSize;
        return unit > 0 ? availableBlocks * unit : null;
    }

    /**
     * Android's own on-device providers: shared storage and SD cards, and
     * Downloads. Their descriptors are files on the volume the export lands
     * on. Any other provider may be a cloud drive whose descriptor is a
     * local cache, where the phone's free space says nothing about the
     * destination, so it is never measured.
     */
    static boolean isLocalProvider(String authority) {
        return "com.android.externalstorage.documents".equals(authority)
            || "com.android.providers.downloads.documents".equals(authority);
    }

    /** Only a destination that measured short is refused; an unknown one gets the write and its own answer. */
    static boolean refuses(Long available, long length) {
        return available != null && available < length;
    }
}
