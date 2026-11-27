package dev.engender.app.sqlite;

import java.util.HashMap;
import java.util.Map;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.function.Consumer;

/**
 * Run calls in each driver's {@code seq} order, starting at 0 for open
 * (ADR-0089). Hold early arrivals until ready, then drain consecutive
 * calls. This keeps transaction ordering without waiting a bridge trip
 * between statements.
 *
 * <p>Only the plugin worker calls {@link #accept}. Close drops sequence
 * state and a bounded set rejects late calls from recent closed sessions.
 */
final class CallSequencer {

    private static final class Session {
        long next = 0;
        final Map<Long, Pending> held = new HashMap<>();
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
            runSafely(following.work);
            state.next++;
        }
    }

    /** Called by the sequenced close, after the connection has been closed. */
    void finish(String session) {
        Session state = sessions.remove(session);
        if (state != null) {
            for (Pending pending : state.held.values()) pending.refuse.accept("sqlite session is closed");
            state.held.clear();
        }
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
