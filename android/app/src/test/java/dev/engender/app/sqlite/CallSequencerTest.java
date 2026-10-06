package dev.engender.app.sqlite;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.Test;

/**
 * A JVM test - no device needed. The JS driver pipelines its bridge calls and
 * numbers them (ux-carpet 200, ADR-0089); this is the half that puts them back
 * in order. Each case delivers calls out of order and reads back the order they
 * reached "SQLite" in.
 */
public class CallSequencerTest {

    private final CallSequencer sequencer = new CallSequencer();
    private final List<String> ran = new ArrayList<>();
    private final List<String> refused = new ArrayList<>();

    private void deliver(String session, long seq, String name) {
        sequencer.accept(session, seq, () -> ran.add(name), refused::add);
    }

    @Test
    public void interleavedCallsWithATransactionRunInCallOrder() {
        // Call order: open, a read, BEGIN, the transaction's write, an
        // unrelated read made while it is open, COMMIT, a read after it.
        String[] calls = { "open", "query a", "BEGIN", "run insert", "query b", "COMMIT", "query c" };
        long[] arrival = { 3, 1, 6, 0, 5, 2, 4 };
        for (long seq : arrival) deliver("s1", seq, calls[(int) seq]);

        assertEquals(Arrays.asList(calls), ran);
        assertEquals(0, sequencer.heldCount("s1"));
        assertTrue(refused.isEmpty());
    }

    @Test
    public void anEarlyCallWaitsForTheOneBeforeIt() {
        deliver("s1", 0, "open");
        deliver("s1", 2, "COMMIT");
        assertEquals(Arrays.asList("open"), ran);
        assertEquals(1, sequencer.heldCount("s1"));

        deliver("s1", 1, "BEGIN");
        assertEquals(Arrays.asList("open", "BEGIN", "COMMIT"), ran);
    }

    @Test
    public void callsInOrderRunAsTheyArrive() {
        for (int i = 0; i < 5; i++) {
            deliver("s1", i, "call " + i);
            assertEquals(i + 1, ran.size());
        }
    }

    @Test
    public void eachSessionCountsFromItsOwnOpen() {
        // A lock closes one driver and the unlock makes another; the second
        // starts again at 0 and must not wait on the first one's numbers.
        deliver("old", 0, "old open");
        deliver("old", 1, "old close");
        deliver("new", 1, "new query");
        deliver("new", 0, "new open");
        assertEquals(Arrays.asList("old open", "old close", "new open", "new query"), ran);
    }

    @Test
    public void aRepeatedNumberIsRefusedRatherThanRunTwice() {
        deliver("s1", 0, "open");
        deliver("s1", 0, "open again");
        deliver("s1", 2, "held");
        deliver("s1", 2, "held again");
        assertEquals(Arrays.asList("open"), ran);
        assertEquals(2, refused.size());
    }

    @Test
    public void aCallThatThrowsDoesNotStrandTheOnesBehindIt() {
        deliver("s1", 1, "after");
        sequencer.accept("s1", 0, () -> {
            throw new IllegalStateException("a plugin method that forgot to catch");
        }, refused::add);
        assertEquals(Arrays.asList("after"), ran);
    }

    @Test public void closingDriversPrunesSessionsAndBoundsRetiredHistory() {
        for (int i = 0; i < 1000; i++) {
            String session = "session-" + i;
            deliver(session, 0, "open");
            sequencer.accept(session, 1, () -> sequencer.finish(session), refused::add);
        }
        assertEquals(0, sequencer.sessionCount());
        assertEquals(64, sequencer.closedCount());
        deliver("session-999", 2, "late query");
        assertEquals(1, refused.size());
        assertEquals(0, sequencer.sessionCount());
    }

    @Test public void aCallQueuedAfterCloseIsRefusedInsteadOfStranded() {
        deliver("s1", 0, "open");
        deliver("s1", 2, "late query");
        sequencer.accept("s1", 1, () -> sequencer.finish("s1"), refused::add);
        assertEquals(Arrays.asList("open"), ran);
        assertEquals(1, refused.size());
        assertEquals(0, sequencer.sessionCount());
    }
}
