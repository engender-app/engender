package dev.engender.app.lock;

import org.junit.Test;
import static org.junit.Assert.*;

public class PinAttemptWaitTest {
    private static final class Store implements PinAttemptWait.Store {
        PinAttemptWait.State state;
        boolean fail;
        public PinAttemptWait.State read() { return state; }
        public void write(PinAttemptWait.State next) {
            if (fail) throw new IllegalStateException("persistence failed");
            state = next;
        }
        public void clear() { write(new PinAttemptWait.State(0, 0, 0, 0, true, false, null, null)); }
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

    @Test public void admissionCountsBeforeDerivationAndSurvivesAZeroDelayRestart() {
        Store store = new Store();
        PinAttemptWait wait = new PinAttemptWait(store);
        wait.adopt(0, false, 100, 7);
        String token = wait.admit("document-1", 100, 7);
        assertEquals(1, new PinAttemptWait(store).wrongAttempts());
        assertEquals(0, wait.remaining(100, 7));
        assertThrows(IllegalStateException.class, () -> wait.admit("document-1", 100, 7));
        wait.finish("document-1", token, false, 200, 7);
        PinAttemptWait restarted = new PinAttemptWait(store);
        restarted.recover("document-2", 250, 7);
        String next = restarted.admit("document-2", 250, 7);
        restarted.finish("document-2", next, false, 300, 7);
        assertEquals(2, restarted.wrongAttempts());
        assertEquals(1000, restarted.remaining(300, 7));
        assertEquals(0, restarted.remaining(1300, 7));
        assertEquals(2, new PinAttemptWait(store).wrongAttempts());
    }

    @Test public void interruptedDerivationOwesFullDelayAndRejectsItsOldCompletion() {
        Store store = new Store();
        PinAttemptWait wait = new PinAttemptWait(store);
        wait.adopt(3, false, 100, 7);
        String token = wait.admit("document-1", 100, 7);
        PinAttemptWait restarted = new PinAttemptWait(store);
        restarted.recover("document-2", 500, 7);
        assertEquals(4, restarted.wrongAttempts());
        assertEquals(4000, restarted.remaining(500, 7));
        assertThrows(IllegalStateException.class, () -> restarted.finish("document-1", token, true, 500, 7));
        assertEquals(4, new PinAttemptWait(store).wrongAttempts());
        assertEquals(4000, new PinAttemptWait(store).remaining(100, 8));
    }

    @Test public void unsuccessfulPublicationCannotAdmitSettleOrResetInMemory() {
        Store store = new Store();
        PinAttemptWait wait = new PinAttemptWait(store);
        wait.adopt(1, false, 100, 7);
        store.fail = true;
        assertThrows(IllegalStateException.class, () -> wait.admit("document", 100, 7));
        assertEquals(1, wait.wrongAttempts());
        store.fail = false;
        String token = wait.admit("document", 100, 7);
        store.fail = true;
        assertThrows(IllegalStateException.class, () -> wait.finish("document", token, false, 200, 7));
        assertThrows(IllegalStateException.class, () -> wait.finish("document", token, true, 200, 7));
        assertEquals(2, wait.wrongAttempts());
        store.fail = false;
        wait.finish("document", token, true, 200, 7);
        PinAttemptWait reset = new PinAttemptWait(store);
        reset.adopt(99, true, 300, 7);
        assertEquals(0, reset.wrongAttempts());
        assertFalse(reset.hasState());
    }

    @Test public void adoptionPreservesBothLegacyPendingWritesAndNativeMinimumEscalation() {
        Store store = new Store();
        PinAttemptWait wait = new PinAttemptWait(store);
        wait.hold(0, 0, 100, 7); // An older paid native wait cannot erase a newer web miss.
        wait.adopt(8, true, 200, 7);
        assertEquals(60_000, wait.remaining(200, 7));
        assertEquals(8, wait.wrongAttempts());
        wait.adopt(0, false, 300, 7);
        assertEquals(8, wait.wrongAttempts());
        Store nativeOnly = new Store();
        PinAttemptWait nativeWait = new PinAttemptWait(nativeOnly);
        nativeWait.hold(250, 4000, 100, 7);
        nativeWait.adopt(1, false, 100, 7);
        assertEquals(4, nativeWait.wrongAttempts());
        assertEquals(250, nativeWait.remaining(100, 7));
    }
}
