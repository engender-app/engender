package dev.engender.app.files;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/** App-private export staging with ordered chunks and verified bytes. */
public class StagedFile implements AutoCloseable {
    public static final int MAX_PIECE_BYTES = 1024 * 1024 + 28;
    public final File file;
    private FileOutputStream output;
    private long length;

    public StagedFile(File file) throws IOException {
        this.file = file;
        output = new FileOutputStream(file);
    }

    /** JSON stores small integers as Integer and larger ones as Long. */
    public static long byteCount(Object value) {
        if (!(value instanceof Integer) && !(value instanceof Long)) throw new IllegalStateException("incomplete-file");
        long count = ((Number) value).longValue();
        if (count < 0 || count > 9007199254740991L) throw new IllegalStateException("incomplete-file");
        return count;
    }

    public void append(long offset, byte[] bytes) throws IOException {
        if (output == null || offset != length || bytes.length == 0 || bytes.length > MAX_PIECE_BYTES) {
            throw new IllegalStateException("incomplete-file");
        }
        output.write(bytes);
        length += bytes.length;
    }

    public void prepare(long expectedLength, String sha256) throws Exception {
        if (expectedLength <= 0 || length != expectedLength || sha256 == null || !sha256.matches("[a-f0-9]{64}")) {
            throw new IllegalStateException("incomplete-file");
        }
        if (output != null) {
            output.close();
            output = null;
        }
        try (InputStream input = new FileInputStream(file)) {
            verify(input, expectedLength, sha256);
        }
    }

    public static void verify(InputStream input, long expectedLength, String sha256) throws IOException {
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
        byte[] buffer = new byte[8192];
        long readLength = 0;
        int read;
        while ((read = input.read(buffer)) != -1) {
            readLength += read;
            if (readLength > expectedLength) throw new IllegalStateException("verification-failed");
            digest.update(buffer, 0, read);
        }
        StringBuilder hex = new StringBuilder(64);
        for (byte value : digest.digest()) hex.append(String.format("%02x", value & 0xff));
        if (readLength != expectedLength || !hex.toString().equals(sha256)) {
            throw new IllegalStateException("verification-failed");
        }
    }

    @Override public void close() throws IOException {
        try {
            if (output != null) output.close();
        } finally {
            output = null;
            if (file.exists() && !file.delete()) throw new IOException("staging-cleanup-failed");
        }
    }
}
