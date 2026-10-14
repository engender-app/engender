package dev.engender.app.keystore;

import android.content.Context;
import android.system.Os;
import android.system.OsConstants;

import org.json.JSONObject;

import java.io.File;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;

/** The authoritative PIN/passphrase wrap, including a durable removal marker.
 * No previous generation is read as a fallback: it could revive a revoked secret. */
public final class CredentialWrapStore {
    static final String FILENAME = "journal-credential.json";
    private static final Object OWNER = new Object();
    private final File file;
    private final JournalKeystore.DirectorySync directorySync;

    public CredentialWrapStore(Context context) {
        this(context, FILENAME, CredentialWrapStore::syncDirectory);
    }

    CredentialWrapStore(Context context, JournalKeystore.DirectorySync directorySync) {
        this(context, FILENAME, directorySync);
    }

    /** PIN accounting uses the same durable publication boundary, a separate file. */
    public static CredentialWrapStore pinAttempts(Context context) {
        return new CredentialWrapStore(context, "pin-attempts.json", CredentialWrapStore::syncDirectory);
    }

    private CredentialWrapStore(Context context, String filename, JournalKeystore.DirectorySync directorySync) {
        file = new File(context.getFilesDir(), filename);
        this.directorySync = directorySync;
    }

    /** Missing means not adopted yet; literal null means deliberately removed. */
    public String read() throws Exception {
        synchronized (OWNER) {
            return file.exists() ? new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8) : null;
        }
    }

    public void adopt(String serialized) throws Exception {
        synchronized (OWNER) {
            if (!file.exists()) write(serialized);
            // Retry a previously published adoption whose directory sync failed.
            else directorySync.sync(file.getParentFile());
        }
    }

    public void write(String serialized) throws Exception {
        if (serialized == null || serialized.length() > 16384) {
            throw new IllegalArgumentException("credential metadata must be a JSON object of at most 16384 characters");
        }
        new JSONObject(serialized);
        synchronized (OWNER) { publish(serialized); }
    }

    public void remove() throws Exception {
        synchronized (OWNER) { publish("null"); }
    }

    private void publish(String serialized) throws Exception {
        File staged = new File(file.getPath() + ".new");
        // Make an earlier unconfirmed rename durable before replacing it.
        if (file.exists()) directorySync.sync(file.getParentFile());
        try {
            try (FileOutputStream out = new FileOutputStream(staged)) {
                out.write(serialized.getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            }
            Files.move(staged.toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            directorySync.sync(file.getParentFile());
        } finally {
            Files.deleteIfExists(staged.toPath());
        }
    }

    private static void syncDirectory(File directory) throws Exception {
        FileDescriptor descriptor = Os.open(directory.getPath(), OsConstants.O_RDONLY, 0);
        try { Os.fsync(descriptor); }
        finally { Os.close(descriptor); }
    }
}
