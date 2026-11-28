package dev.engender.app.photos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import org.junit.Test;

import java.io.IOException;

/** native half: the count and total of a multi-pick. */
public class PickBudgetTest {

    @Test
    public void aFullGalleryPickOfHeavyPhotosPasses() throws Exception {
        PickBudget.check(PickBudget.MAX_COUNT, 100L * 10 * 1024 * 1024);
    }

    @Test
    public void oneFileOverTheCountIsRefused() {
        IOException refused = assertThrows(IOException.class, () -> PickBudget.check(PickBudget.MAX_COUNT + 1, 0));
        assertEquals("selection-too-large", refused.getMessage());
    }

    @Test
    public void oneByteOverTheTotalIsRefused() throws Exception {
        PickBudget.check(2, PickBudget.MAX_BYTES);
        assertThrows(IOException.class, () -> PickBudget.check(2, PickBudget.MAX_BYTES + 1));
    }

    @Test
    public void theMirroredNumbersAreTheWebOnes() {
        // src/lib/data/media/budget.ts: MAX_PICK_COUNT = 100, MAX_PICK_BYTES = 1 GiB.
        assertEquals(100, PickBudget.MAX_COUNT);
        assertEquals(1024L * 1024 * 1024, PickBudget.MAX_BYTES);
    }
}
