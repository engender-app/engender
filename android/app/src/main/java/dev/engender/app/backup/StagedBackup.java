package dev.engender.app.backup;

import java.io.DataInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import org.json.JSONObject;

/** Encrypted archive staging. No destination is opened until delivery is complete. */
final class StagedBackup implements AutoCloseable {
    static final int MAX_PIECE_BYTES = 1024 * 1024 + 28;
    final File file;
    private FileOutputStream output;
    private long length;

    StagedBackup(File file) throws IOException {
        this.file = file;
        output = new FileOutputStream(file);
    }

    void append(long offset, byte[] bytes) throws IOException {
        if (output == null || offset != length || bytes.length == 0 || bytes.length > MAX_PIECE_BYTES) {
            throw new IllegalStateException("incomplete-archive");
        }
        output.write(bytes);
        length += bytes.length;
    }

    void prepare(long expectedLength, String sha256) throws Exception {
        if (expectedLength <= 0 || length != expectedLength || sha256 == null || !sha256.matches("[a-f0-9]{64}")) {
            throw new IllegalStateException("incomplete-archive");
        }
        if (output != null) {
            output.close();
            output = null;
        }
        try (InputStream input = new FileInputStream(file)) {
            verify(input, expectedLength, sha256);
        }
        verifyFraming();
    }

    private void verifyFraming() throws Exception {
        try (DataInputStream input = new DataInputStream(new FileInputStream(file))) {
            byte[] magic = new byte[6];
            input.readFully(magic);
            int version = input.readUnsignedShort();
            int jsonLength = input.readInt();
            if (!"GDIARY".equals(new String(magic, StandardCharsets.US_ASCII)) || version < 1 || version > 2
                || jsonLength <= 0 || jsonLength > 65536) {
                throw new IllegalStateException("incomplete-archive");
            }
            byte[] json = new byte[jsonLength];
            input.readFully(json);
            JSONObject header = new JSONObject(new String(json, StandardCharsets.UTF_8));
            long chunkSize = header.getLong("chunkSize");
            long totalChunks = header.getLong("totalChunks");
            if (chunkSize <= 0 || chunkSize > 16L * 1024 * 1024 || totalChunks <= 0 || totalChunks > 0xffffffffL) {
                throw new IllegalStateException("incomplete-archive");
            }
            long finalFrame = length - 12 - jsonLength - (totalChunks - 1) * (chunkSize + 28);
            if (finalFrame <= 28 || finalFrame > chunkSize + 28) {
                throw new IllegalStateException("incomplete-archive");
            }
        }
    }

    static void verify(InputStream input, long expectedLength, String sha256) throws IOException {
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
