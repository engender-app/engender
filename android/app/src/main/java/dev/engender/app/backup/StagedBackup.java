package dev.engender.app.backup;

import dev.engender.app.files.StagedFile;
import java.io.DataInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Automatic backups also require complete archive framing. */
final class StagedBackup extends StagedFile {
    StagedBackup(File file) throws IOException { super(file); }

    @Override public void prepare(long expectedLength, String sha256) throws Exception {
        super.prepare(expectedLength, sha256);
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
            long finalFrame = file.length() - 12 - jsonLength - (totalChunks - 1) * (chunkSize + 28);
            if (finalFrame <= 28 || finalFrame > chunkSize + 28) {
                throw new IllegalStateException("incomplete-archive");
            }
        }
    }

}
