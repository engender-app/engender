package dev.engender.app.backup;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Only verified URI ownership and the automatic prefix permit removal. */
final class BackupRetention {
    static final int KEEP = 5;

    interface Document {
        String uri();
        String name();
        boolean delete();
    }

    static void prune(List<String> verified, List<? extends Document> documents) {
        Map<String, Document> current = new HashMap<>();
        for (Document document : documents) current.put(document.uri(), document);
        int retained = 0;
        for (int i = verified.size() - 1; i >= 0; i--) {
            Document document = current.get(verified.get(i));
            if (document == null) {
                verified.remove(i);
                continue;
            }
            String name = document.name();
            if (name == null || !name.startsWith("auto-") || !name.endsWith(".ttbackup")) continue;
            if (++retained > KEEP && document.delete()) verified.remove(i);
        }
    }
}
