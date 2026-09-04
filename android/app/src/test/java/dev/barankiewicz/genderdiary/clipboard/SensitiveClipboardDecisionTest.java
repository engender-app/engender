package dev.barankiewicz.genderdiary.clipboard;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * The one decision the self-clearing copy has to get right (phase 8 audit
 * ticket 09): a clipboard the person has since used for something of their
 * own is not ours to wipe. Everything else about the clear needs a real
 * ClipboardManager and lives in the instrumentation test; this is the part
 * that holds no Android type, so it can be exercised here.
 */
public class SensitiveClipboardDecisionTest {

    private static final String KEY = "K7QF-2M9X-BTRW-4HDC-8PNZ";

    @Test
    public void recognisesTheKeyItPutThere() {
        assertTrue(SensitiveClipboard.isWhatWeCopied(SensitiveClipboard.digest(KEY), KEY));
    }

    @Test
    public void leavesSomethingCopiedSinceAlone() {
        byte[] ours = SensitiveClipboard.digest(KEY);

        assertFalse(SensitiveClipboard.isWhatWeCopied(ours, "an address she pasted after"));
        assertFalse(SensitiveClipboard.isWhatWeCopied(ours, ""));
        // One group wrong is a different string, and not ours.
        assertFalse(SensitiveClipboard.isWhatWeCopied(ours, "K7QF-2M9X-BTRW-4HDC-8PNY"));
    }

    @Test
    public void treatsAnEmptyClipboardAsNotOurs() {
        assertFalse(SensitiveClipboard.isWhatWeCopied(SensitiveClipboard.digest(KEY), null));
    }
}
