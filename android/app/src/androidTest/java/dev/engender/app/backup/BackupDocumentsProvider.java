package dev.engender.app.backup;

import android.database.Cursor;
import android.database.MatrixCursor;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract.Document;
import android.provider.DocumentsProvider;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.UUID;

/** A test-only SAF destination with controlled write and read-back failures. */
public class BackupDocumentsProvider extends DocumentsProvider {
    public static final String AUTHORITY = "dev.engender.app.test.backups";
    private volatile String fault = "none";
    private volatile boolean blocked;
    private volatile java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);

    public static class Bootstrap extends android.content.BroadcastReceiver {
        @Override public void onReceive(android.content.Context context, android.content.Intent intent) {
            context.getContentResolver().call(android.net.Uri.parse("content://" + AUTHORITY), "reset", null, null);
        }
    }

    @Override public boolean onCreate() { return true; }

    private File directory() {
        File directory = new File(getContext().getCacheDir(), "backup-destination");
        directory.mkdirs();
        return directory;
    }

    private File file(String id) throws FileNotFoundException {
        if (!id.matches("[a-f0-9-]{36}")) throw new FileNotFoundException(id);
        return new File(directory(), id);
    }

    @Override public Bundle call(String method, String arg, Bundle extras) {
        if ("fault".equals(method)) {
            fault = arg; blocked = false; release = new java.util.concurrent.CountDownLatch(1);
            return Bundle.EMPTY;
        }
        if ("blocked".equals(method)) { Bundle out = new Bundle(); out.putBoolean("blocked", blocked); return out; }
        if ("release".equals(method)) { release.countDown(); return Bundle.EMPTY; }
        if ("reset".equals(method)) {
            release.countDown();
            File[] files = directory().listFiles();
            if (files != null) for (File file : files) file.delete();
            getContext().getSharedPreferences("backup-document-names", 0).edit().clear().commit();
            fault = "none";
            getContext().grantUriPermission("dev.engender.app",
                android.provider.DocumentsContract.buildTreeDocumentUri(AUTHORITY, "root"),
                android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION
                    | android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    | android.content.Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
            return Bundle.EMPTY;
        }
        return super.call(method, arg, extras);
    }

    private MatrixCursor cursor(String[] projection) {
        return new MatrixCursor(projection == null ? new String[] {
            Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE,
            Document.COLUMN_FLAGS, Document.COLUMN_SIZE
        } : projection);
    }

    private void row(MatrixCursor cursor, String id) throws FileNotFoundException {
        boolean root = "root".equals(id);
        MatrixCursor.RowBuilder row = cursor.newRow();
        for (String column : cursor.getColumnNames()) {
            switch (column) {
                case Document.COLUMN_DOCUMENT_ID: row.add(id); break;
                case Document.COLUMN_DISPLAY_NAME: row.add(getContext().getSharedPreferences("backup-document-names", 0).getString(id, id)); break;
                case Document.COLUMN_MIME_TYPE: row.add(root ? Document.MIME_TYPE_DIR : "application/octet-stream"); break;
                case Document.COLUMN_FLAGS: row.add(root ? Document.FLAG_DIR_SUPPORTS_CREATE
                    : Document.FLAG_SUPPORTS_WRITE | Document.FLAG_SUPPORTS_DELETE); break;
                case Document.COLUMN_SIZE: row.add(root ? 0L : file(id).length()); break;
                default: row.add(null);
            }
        }
    }

    @Override public Cursor queryRoots(String[] projection) { return new MatrixCursor(new String[] {"root_id"}); }
    @Override public Cursor queryDocument(String id, String[] projection) throws FileNotFoundException {
        MatrixCursor cursor = cursor(projection);
        row(cursor, id);
        return cursor;
    }
    @Override public Cursor queryChildDocuments(String id, String[] projection, String sortOrder) throws FileNotFoundException {
        MatrixCursor cursor = cursor(projection);
        File[] files = directory().listFiles();
        if (files != null) for (File file : files) row(cursor, file.getName());
        return cursor;
    }
    @Override public boolean isChildDocument(String parent, String child) { return "root".equals(parent); }

    @Override public String createDocument(String parent, String mime, String name) throws FileNotFoundException {
        String id = UUID.randomUUID().toString();
        try {
            if (!file(id).createNewFile()) throw new IOException("create failed");
        } catch (IOException e) { throw new FileNotFoundException(e.toString()); }
        getContext().getSharedPreferences("backup-document-names", 0).edit().putString(id, name).commit();
        return id;
    }

    @Override public void deleteDocument(String id) throws FileNotFoundException {
        if (!file(id).delete()) throw new FileNotFoundException("delete failed");
    }

    @Override public ParcelFileDescriptor openDocument(String id, String mode, CancellationSignal signal)
        throws FileNotFoundException {
        File file = file(id);
        if (mode.contains("w") && "full".equals(fault)) throw new FileNotFoundException("ENOSPC");
        if (mode.contains("w") && "blocked".equals(fault)) {
            blocked = true;
            try {
                if (!release.await(10, java.util.concurrent.TimeUnit.SECONDS)) throw new FileNotFoundException("provider-timeout");
            } catch (InterruptedException error) { throw new FileNotFoundException("provider-interrupted"); }
        }
        if (!mode.contains("w") && "truncated".equals(fault)) {
            try (java.io.RandomAccessFile bytes = new java.io.RandomAccessFile(file, "rw")) {
                bytes.setLength(Math.max(0, bytes.length() - 1));
            } catch (IOException e) { throw new FileNotFoundException(e.toString()); }
        }
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.parseMode(mode));
    }
}
