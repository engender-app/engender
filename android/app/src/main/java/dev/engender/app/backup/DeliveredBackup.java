package dev.engender.app.backup;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.ProviderInfo;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.system.Os;
import android.system.OsConstants;
import androidx.documentfile.provider.DocumentFile;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

/** The delivery boundary shared by foreground and scheduled automatic backups. */
final class DeliveredBackup {
    private static final String LOCAL_AUTHORITY = "com.android.externalstorage.documents";
    private static boolean supports(Context context, Uri uri) {
        if (BackupProviderCapability.supportsTestProvider(context, uri)) return true;
        if (!LOCAL_AUTHORITY.equals(uri.getAuthority())) return false;
        ProviderInfo provider = context.getPackageManager().resolveContentProvider(LOCAL_AUTHORITY, 0);
        return provider != null && (provider.applicationInfo.flags
            & (ApplicationInfo.FLAG_SYSTEM | ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) != 0;
    }

    static void writeAndVerify(Context context, DocumentFile folder, DocumentFile target,
        File staged, long length, String digest) throws Exception {
        try {
            // SAF has no remote-commit acknowledgement. A cloud cache descriptor is insufficient.
            if (!supports(context, target.getUri())) throw new IllegalStateException("destination-durability-unavailable");
            try (ParcelFileDescriptor descriptor = context.getContentResolver().openFileDescriptor(target.getUri(), "wt")) {
                if (descriptor == null) throw new IllegalStateException("destination-unavailable");
                if (!OsConstants.S_ISREG(Os.fstat(descriptor.getFileDescriptor()).st_mode)) {
                    throw new IllegalStateException("destination-durability-unavailable");
                }
                try (InputStream input = new FileInputStream(staged);
                     OutputStream output = new ParcelFileDescriptor.AutoCloseOutputStream(descriptor)) {
                    byte[] buffer = new byte[8192];
                    int count;
                    while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                    output.flush();
                    descriptor.getFileDescriptor().sync();
                }
            }
            // Persist the new directory entry as well as its contents before publishing success.
            try (ParcelFileDescriptor directory = context.getContentResolver().openFileDescriptor(folder.getUri(), "r")) {
                if (directory == null || !OsConstants.S_ISDIR(Os.fstat(directory.getFileDescriptor()).st_mode)) {
                    throw new IllegalStateException("destination-durability-unavailable");
                }
                Os.fsync(directory.getFileDescriptor());
            }
            try (InputStream input = context.getContentResolver().openInputStream(target.getUri())) {
                if (input == null) throw new IllegalStateException("destination-unavailable");
                StagedBackup.verify(input, length, digest);
            }
        } catch (Exception failed) {
            discard(target, failed);
            throw failed;
        }
    }

    static void discard(DocumentFile target, Exception failure) {
        if (target == null) return;
        try {
            if (target.exists() && !target.delete()) failure.addSuppressed(new java.io.IOException("partial-backup-cleanup-failed"));
        } catch (Exception cleanup) { failure.addSuppressed(cleanup); }
    }
}
