package dev.engender.app.backup;

import java.io.DataInputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.json.JSONObject;

/**
 * Opens a written archive with the saved backup password, every chunk of it
 * (FA 56). The container is src/lib/data/archive/container.ts: "GDIARY", a
 * u16 format version, a u32 header length, the header JSON, then AES-256-GCM
 * chunks of nonce, ciphertext and tag, each authenticated against the header
 * bytes followed by its big-endian u32 index. A wrong password, a damaged
 * chunk, a truncated file and trailing bytes all fail here, which a byte
 * comparison with what was meant to be written cannot see.
 *
 * <p>The key is derived from the header's own KDF parameters, bounded by the
 * archive ceiling (ARCHIVE_ARGON2_MAX_PARAMS in src/lib/crypto/params.ts),
 * since those numbers come off the file and are allocated against.
 */
final class ArchiveReadBack {
    private static final int NONCE = 12;
    private static final int OVERHEAD = NONCE + 16;
    private static final int MAX_MEMORY_KB = 65536;
    private static final int MAX_ITERATIONS = 6;
    private static final int MAX_PARALLELISM = 1;
    private static final int HASH_LENGTH = 32;
    private static final long MAX_CHUNK = 16L * 1024 * 1024;

    private ArchiveReadBack() { }

    static void open(InputStream source, String password) throws Exception {
        if (password == null || password.isEmpty()) throw unreadable();
        DataInputStream input = new DataInputStream(source);
        byte[] prefix = new byte[12];
        readFully(input, prefix);
        ByteBuffer view = ByteBuffer.wrap(prefix);
        byte[] magic = new byte[6];
        view.get(magic);
        int version = view.getShort() & 0xffff;
        long jsonLength = view.getInt() & 0xffffffffL;
        if (!"GDIARY".equals(new String(magic, StandardCharsets.US_ASCII)) || version < 1
            || jsonLength <= 0 || jsonLength > 65536) throw unreadable();
        byte[] json = new byte[(int) jsonLength];
        readFully(input, json);

        JSONObject header;
        try { header = new JSONObject(new String(json, StandardCharsets.UTF_8)); }
        catch (org.json.JSONException bad) { throw unreadable(); }
        JSONObject kdf = header.optJSONObject("kdf");
        long chunkSize = header.optLong("chunkSize", 0);
        long totalChunks = header.optLong("totalChunks", 0);
        if (kdf == null || chunkSize <= 0 || chunkSize > MAX_CHUNK || totalChunks <= 0 || totalChunks > 0xffffffffL) {
            throw unreadable();
        }
        int memory = kdf.optInt("memorySize", 0);
        int iterations = kdf.optInt("iterations", 0);
        int parallelism = kdf.optInt("parallelism", 0);
        if (memory <= 0 || memory > MAX_MEMORY_KB || iterations <= 0 || iterations > MAX_ITERATIONS
            || parallelism <= 0 || parallelism > MAX_PARALLELISM || kdf.optInt("hashLength", 0) != HASH_LENGTH) {
            throw unreadable();
        }
        byte[] salt;
        try { salt = java.util.Base64.getDecoder().decode(header.getString("salt")); }
        catch (Exception bad) { throw unreadable(); }

        byte[] key = AutoExportPlugin.deriveArgon2id(password, salt, memory, iterations, parallelism, HASH_LENGTH);
        SecretKeySpec aes = new SecretKeySpec(key, "AES");
        byte[] headerBytes = new byte[prefix.length + json.length];
        System.arraycopy(prefix, 0, headerBytes, 0, prefix.length);
        System.arraycopy(json, 0, headerBytes, prefix.length, json.length);

        byte[] framed = new byte[(int) (chunkSize + OVERHEAD)];
        for (long index = 0; index < totalChunks; index++) {
            boolean last = index == totalChunks - 1;
            int length = last ? readAtMost(input, framed) : readFully(input, framed);
            if (length <= OVERHEAD) throw unreadable();
            if (last && input.read() != -1) throw unreadable();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, aes, new GCMParameterSpec(128, framed, 0, NONCE));
            cipher.updateAAD(headerBytes);
            cipher.updateAAD(ByteBuffer.allocate(4).putInt((int) index).array());
            try { cipher.doFinal(framed, NONCE, length - NONCE); }
            catch (java.security.GeneralSecurityException failed) { throw unreadable(); }
        }
    }

    private static int readFully(DataInputStream input, byte[] into) throws IOException {
        try { input.readFully(into); }
        catch (EOFException truncated) { throw unreadable(); }
        return into.length;
    }

    private static int readAtMost(InputStream input, byte[] into) throws IOException {
        int at = 0;
        while (at < into.length) {
            int read = input.read(into, at, into.length - at);
            if (read == -1) break;
            at += read;
        }
        return at;
    }

    private static IllegalStateException unreadable() {
        return new IllegalStateException("backup-unreadable");
    }
}
