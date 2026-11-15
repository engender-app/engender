package dev.engender.app.lock;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

public class HandlerTrustTest {
    private static final HandlerTrust.Handler SYSTEM = new HandlerTrust.Handler(true, false);
    private static final HandlerTrust.Handler OTHER = new HandlerTrust.Handler(false, false);
    private static final HandlerTrust.Handler CHOOSER = new HandlerTrust.Handler(true, true);
    private static final List<HandlerTrust.Handler> NONE = Collections.emptyList();

    @Test public void aSystemDefaultKeepsTheGraceEvenWithOtherCameraAppsInstalled() {
        assertTrue(HandlerTrust.verified(false, SYSTEM, Arrays.asList(SYSTEM, OTHER)));
    }

    @Test public void aNonSystemDefaultLosesIt() {
        assertFalse(HandlerTrust.verified(false, OTHER, Arrays.asList(SYSTEM, OTHER)));
    }

    @Test public void aChooserNeedsEveryCandidateToBeASystemApp() {
        assertTrue(HandlerTrust.verified(false, CHOOSER, Arrays.asList(SYSTEM, SYSTEM)));
        assertFalse(HandlerTrust.verified(false, CHOOSER, Arrays.asList(SYSTEM, OTHER)));
    }

    @Test public void noVisibleHandlerIsUnknownNotTrusted() {
        assertFalse(HandlerTrust.verified(false, null, NONE));
        assertFalse(HandlerTrust.verified(false, null, null));
        assertFalse(HandlerTrust.verified(false, CHOOSER, NONE));
    }

    @Test public void anIntentTheAppAddressedItselfIsItsOwnScreen() {
        assertTrue(HandlerTrust.verified(true, null, null));
    }
}
