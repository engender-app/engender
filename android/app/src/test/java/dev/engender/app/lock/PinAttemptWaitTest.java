package dev.engender.app.lock;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

public class PinAttemptWaitTest {
    @Test public void elapsedTimeCountsDownAcrossWebViewReloads() {
        PinAttemptWait wait = new PinAttemptWait();
        wait.hold(1000, 5000);
        assertEquals(750, wait.remaining(5250));
        wait.hold(0, 5250);
        assertEquals(750, wait.remaining(5250));
        assertEquals(0, wait.remaining(6000));
    }

    @Test public void correctPinClearsTheNativeWait() {
        PinAttemptWait wait = new PinAttemptWait();
        wait.hold(60_000, 5000);
        wait.reset();
        assertEquals(0, wait.remaining(5000));
    }
}
