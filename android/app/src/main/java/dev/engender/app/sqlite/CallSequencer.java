package dev.engender.app.sqlite;

import java.util.HashMap;
import java.util.Map;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.function.Consumer;

/**
 * Runs the JS driver's calls in the order it made them, whatever order they
 * arrive in (ux-carpet 200, ADR-0089).
 *
 * <p>The driver no longer waits for one bridge call to come back before it
 * sends the next: that wait was a full round trip per statement, 9-11 ms on
 * the Pixel, and the whole of a warm screen's delay. So order is this class's
 * job now. Every sequenced call carries the driver's {@code session} (one per
 * {@code createAndroidSqlite}) and a {@code seq} counting up from 0, the open.
 * A call whose turn has come runs at once, followed by any held calls it
 * unblocks; a call that arrives early is held until the calls before it have
 * run. Capacitor 8.5 happens to deliver plugin calls in order on one thread,
 * but that is its internal, and a BEGIN before its statements and the
 * migration runner's composition are too load-bearing to rest on it.
 *
 * <p>Not thread-safe by design: every call to {@link #accept} is made on the
 * plugin's one worker thread, so the state here is only ever touched from
 * there. Closing a driver drops its sequence state and refuses later calls.
 * A bounded set remembers recent closed sessions without accumulating one
 * map per unlock.
 */
final class CallSequencer {

    private static final class Session {
        long next = 0;
        final Map<Long, Pending> held = new HashMap<>();
        boolean closed;
    }

    private static final class Pending {
        final Runnable work;
        final Consumer<String> refuse;
        Pending(Runnable work, Consumer<String> refuse) { this.work = work; this.refuse = refuse; }
    }

    private final Map<String, Session> sessions = new HashMap<>();
    private final Set<String> closedSessions = new LinkedHashSet<>();

    /**
     * Runs {@code work} now if it is {@code session}'s next call, and then any
     * held calls that follow it; otherwise holds it. A sequence number that
     * has already run, or is already held, is refused through {@code refuse}
     * rather than run twice or dropped.
     */
    void accept(String session, long seq, Runnable work, Consumer<String> refuse) {
        if (closedSessions.contains(session)) {
            refuse.accept("sqlite session is closed");
            return;
        }
        Session state = sessions.computeIfAbsent(session, (key) -> new Session());
        if (seq < state.next || state.held.containsKey(seq)) {
            refuse.accept("sqlite call " + seq + " of session " + session + " arrived twice");
            return;
        }
        if (seq != state.next) {
            state.held.put(seq, new Pending(work, refuse));
            return;
        }
        runSafely(work);
        state.next++;
        Pending following;
        while ((following = state.held.remove(state.next)) != null) {
            if (state.closed) following.refuse.accept("sqlite session is closed");
            else runSafely(following.work);
            state.next++;
        }
    }

    /** Called by the sequenced close, after the connection has been closed. */
    void finish(String session) {
        Session state = sessions.remove(session);
        if (state != null) state.closed = true;
        closedSessions.add(session);
        if (closedSessions.size() > 64) closedSessions.remove(closedSessions.iterator().next());
    }

    int sessionCount() { return sessions.size(); }
    int closedCount() { return closedSessions.size(); }

    /** How many calls are waiting for an earlier one, for the tests. */
    int heldCount(String session) {
        Session state = sessions.get(session);
        return state == null ? 0 : state.held.size();
    }

    /* Every plugin method resolves or rejects its own call, so anything that
       escapes one is a bug in it. It must not stop the calls queued behind
       it: they belong to other callers, who would wait forever. */
    private static void runSafely(Runnable work) {
        try {
            work.run();
        } catch (RuntimeException e) {
            e.printStackTrace();
        }
    }
}
