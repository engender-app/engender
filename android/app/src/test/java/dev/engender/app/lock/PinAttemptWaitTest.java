package dev.engender.app.lock;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

public class PinAttemptWaitTest {
    private static final class Store implements PinAttemptWait.Store {
        PinAttemptWait.State state;
        public PinAttemptWait.State read() { return state; }
        public void write(PinAttemptWait.State next) { state = next; }
        public void clear() { state = null; }
    }

    @Test public void elapsedTimeCountsDownAcrossProcessRestarts() {
        Store store = new Store();
        new PinAttemptWait(store).hold(1000, 1000, 5000, 7);
        PinAttemptWait restarted = new PinAttemptWait(store);
        assertEquals(750, restarted.remaining(5250, 7));
        restarted.hold(0, 1000, 5250, 7);
        assertEquals(750, new PinAttemptWait(store).remaining(5250, 7));
        assertEquals(0, restarted.remaining(6000, 7));
    }

    @Test public void aNewBootOwesTheFullDelayAndPersistsItsNewDeadline() {
        Store store = new Store();
        new PinAttemptWait(store).hold(750, 60_000, 5000, 7);
        PinAttemptWait restarted = new PinAttemptWait(store);
        assertEquals(60_000, restarted.remaining(100, 8));
        assertEquals(59_750, new PinAttemptWait(store).remaining(350, 8));
    }

    @Test public void aPaidWaitDoesNotReturnAfterReboot() {
        Store store = new Store();
        PinAttemptWait wait = new PinAttemptWait(store);
        wait.hold(1000, 1000, 5000, 7);
        assertEquals(0, wait.remaining(6000, 7));
        assertEquals(0, new PinAttemptWait(store).remaining(100, 8));
    }

    @Test public void correctPinClearsThePersistedWait() {
        Store store = new Store();
        PinAttemptWait wait = new PinAttemptWait(store);
        wait.hold(60_000, 60_000, 5000, 7);
        wait.reset();
        assertEquals(0, new PinAttemptWait(store).remaining(5000, 7));
    }
}
