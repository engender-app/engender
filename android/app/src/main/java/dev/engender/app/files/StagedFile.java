package dev.engender.app.files;

import java.io.File;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** App-private export staging with ordered chunks and verified bytes. */
public class StagedFile implements AutoCloseable {
    public static final int MAX_PIECE_BYTES = 1024 * 1024 + 28;
    public final File file;
    private DataOutputStream output;
    private long length;
    private SecretKey key;
    private volatile boolean closed;

    public StagedFile(File file) throws IOException {
        this(file, null);
    }

    private StagedFile(File file, SecretKey key) throws IOException {
        this.file = file;
        this.key = key;
        output = new DataOutputStream(new FileOutputStream(file));
    }

    /** Manual exports can be plaintext; their staging key never leaves memory. */
    public static StagedFile encrypted(File file) throws IOException {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        SecretKey secret = new SecretKeySpec(key, "AES");
        java.util.Arrays.fill(key, (byte) 0);
        return new StagedFile(file, secret);
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
        if (key == null) output.write(bytes);
        else {
            byte[] nonce = new byte[12];
            new SecureRandom().nextBytes(nonce);
            try {
                Cipher cipher = cipher(Cipher.ENCRYPT_MODE, key, nonce);
                byte[] encrypted = cipher.doFinal(bytes);
                output.writeInt(encrypted.length);
                output.write(nonce);
                output.write(encrypted);
            } catch (java.security.GeneralSecurityException error) { throw new IOException(error); }
        }
        length += bytes.length;
    }

    public void prepare(long expectedLength, String sha256) throws Exception {
        if (expectedLength <= 0 || length != expectedLength || sha256 == null || !sha256.matches("[a-f0-9]{64}")) {
            throw new IllegalStateException("incomplete-file");
        }
        DataOutputStream writing = output;
        if (writing != null) {
            writing.close();
            output = null;
        }
        try (InputStream input = openStream()) {
            verify(input, expectedLength, sha256);
        }
    }

    /** Authenticate one bounded piece at a time, never an entire export. */
    public InputStream openStream() throws IOException {
        if (closed) throw new IOException("staging-closed");
        SecretKey secret = key;
        if (secret == null) return new FileInputStream(file);
        DataInputStream input = new DataInputStream(new FileInputStream(file));
        return new InputStream() {
            byte[] piece = new byte[0];
            int at;
            private boolean availablePiece() throws IOException {
                if (closed) throw new IOException("staging-closed");
                if (at < piece.length) return true;
                int first = input.read();
                if (first == -1) return false;
                int size = (first << 24) | (input.readUnsignedByte() << 16)
                    | (input.readUnsignedByte() << 8) | input.readUnsignedByte();
                if (size <= 16 || size > MAX_PIECE_BYTES + 16) throw new IOException("invalid-staging-piece");
                byte[] nonce = new byte[12];
                input.readFully(nonce);
                byte[] encrypted = new byte[size];
                input.readFully(encrypted);
                try { piece = cipher(Cipher.DECRYPT_MODE, secret, nonce).doFinal(encrypted); }
                catch (java.security.GeneralSecurityException error) { throw new IOException(error); }
                at = 0;
                return true;
            }
            @Override public int read() throws IOException { return availablePiece() ? piece[at++] & 255 : -1; }
            @Override public int read(byte[] bytes, int offset, int count) throws IOException {
                if (count == 0) return 0;
                if (!availablePiece()) return -1;
                int copied = Math.min(count, piece.length - at);
                System.arraycopy(piece, at, bytes, offset, copied);
                at += copied;
                return copied;
            }
            @Override public void close() throws IOException { input.close(); }
        };
    }

    private static Cipher cipher(int mode, SecretKey key, byte[] nonce) throws java.security.GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(mode, key, new GCMParameterSpec(128, nonce));
        return cipher;
    }

    public boolean isClosed() { return closed; }

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
        closed = true;
        key = null;
        try {
            DataOutputStream writing = output;
            if (writing != null) writing.close();
        } finally {
            output = null;
            if (file.exists() && !file.delete()) throw new IOException("staging-cleanup-failed");
        }
    }
}
