package dev.engender.app.lock;

import org.junit.Test;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class OwnSystemUiTest {
    @Test public void aRequestForAResultIsOpenUntilTheResultComesBack() {
        OwnSystemUi window = new OwnSystemUi();
        assertFalse(window.isOpen());
        window.opened(7);
        assertTrue(window.isOpen());
        window.closed();
        assertFalse(window.isOpen());
    }

    @Test public void aPlainStartActivityIsNotTheAppsOwnScreen() {
        OwnSystemUi window = new OwnSystemUi();
        window.opened(-1);
        assertFalse(window.isOpen());
    }
}
