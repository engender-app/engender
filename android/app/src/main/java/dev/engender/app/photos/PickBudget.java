package dev.engender.app.photos;

import java.io.IOException;

/**
 * What a multi-pick may hand over in one go, judged from the sizes the
 * content provider declares before a token for any file exists. Mirrors
 * src/lib/data/media/budget.ts: 100 files, 1 GiB in all.
 *
 * <p>The per-file ceiling already existed; the count and the total did not,
 * and a hostile or just enormous selection could keep the app reading for as
 * long as it liked. The system picker caps a gallery pick at {@code
 * MediaStore.getPickImagesMaxLimit()}, 100 on shipped devices, so the count
 * refuses nothing the picker itself offers.
 */
final class PickBudget {
    static final int MAX_COUNT = 100;
    static final long MAX_BYTES = 1024L * 1024 * 1024;

    private PickBudget() {}

    /** @param knownBytes the sum of the declared sizes; a provider that does not say counts as 0 */
    static void check(int count, long knownBytes) throws IOException {
        if (count > MAX_COUNT || knownBytes > MAX_BYTES) throw new IOException("selection-too-large");
    }
}
