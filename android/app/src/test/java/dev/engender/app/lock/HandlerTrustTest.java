package dev.engender.app.lock;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;

public class HandlerTrustTest {
    private static final HandlerTrust.Handler SYSTEM = new HandlerTrust.Handler(true);
    private static final HandlerTrust.Handler OTHER = new HandlerTrust.Handler(false);

    @Test public void aSystemHandlerKeepsTheGrace() {
        assertTrue(HandlerTrust.verified(false, Collections.singletonList(SYSTEM)));
        assertTrue(HandlerTrust.verified(false, Arrays.asList(SYSTEM, SYSTEM)));
    }

    @Test public void oneNonSystemHandlerAmongTheAnswersLosesIt() {
        assertFalse(HandlerTrust.verified(false, Collections.singletonList(OTHER)));
        assertFalse(HandlerTrust.verified(false, Arrays.asList(SYSTEM, OTHER)));
    }

    @Test public void noVisibleHandlerIsUnknownNotTrusted() {
        assertFalse(HandlerTrust.verified(false, Collections.<HandlerTrust.Handler>emptyList()));
        assertFalse(HandlerTrust.verified(false, null));
    }

    @Test public void anIntentTheAppAddressedItselfIsItsOwnScreen() {
        assertTrue(HandlerTrust.verified(true, Collections.<HandlerTrust.Handler>emptyList()));
    }
}
