package dev.engender.app.lock;

/** Admission counts survive a process; elapsed deadlines belong to one boot. */
final class PinAttemptWait {
    static final class State {
        final long deadline;
        final int bootCount;
        final long fullDelayMs;
        final int wrongAttempts;
        final boolean adopted;
        final boolean waitRecorded;
        final String pendingOwner;
        final String pendingToken;
        State(long deadline, int bootCount, long fullDelayMs) {
            this(deadline, bootCount, fullDelayMs, 0, false, true, null, null);
        }
        State(long deadline, int bootCount, long fullDelayMs, int wrongAttempts,
              boolean adopted, boolean waitRecorded, String pendingOwner, String pendingToken) {
            this.deadline = deadline;
            this.bootCount = bootCount;
            this.fullDelayMs = fullDelayMs;
            this.wrongAttempts = wrongAttempts;
            this.adopted = adopted;
            this.waitRecorded = waitRecorded;
            this.pendingOwner = pendingOwner;
            this.pendingToken = pendingToken;
        }
    }

    interface Store {
        State read();
        void write(State state);
        void clear();
    }

    private final Store store;
    private State state;

    PinAttemptWait(Store store) {
        this.store = store;
        state = store.read();
    }

    boolean hasState() { return state != null && state.waitRecorded; }
    long fullDelayMs() { return state == null ? 0 : state.fullDelayMs; }
    int wrongAttempts() { return state == null ? 0 : state.wrongAttempts; }
    boolean adopted() { return state != null && state.adopted; }

    void adopt(int legacyCount, boolean legacyPending, long elapsedRealtime, int bootCount) {
        if (adopted()) return;
        int minimum = 0;
        while (minimum < 8 && delay(minimum) < fullDelayMs()) minimum++;
        int count = Math.max(legacyCount, minimum);
        long missingDelay = legacyPending ? delay(count) : 0;
        boolean missingWait = missingDelay > fullDelayMs();
        publish(new State(missingWait ? elapsedRealtime + missingDelay : state == null ? 0 : state.deadline,
            missingWait ? bootCount : state == null ? bootCount : state.bootCount,
            Math.max(missingDelay, fullDelayMs()), count, true, hasState() || legacyPending, null, null));
    }

    /** A new document resumes an admitted but unfinished guess as a miss. */
    void recover(String owner, long elapsedRealtime, int bootCount) {
        if (state != null && state.pendingOwner != null && !state.pendingOwner.equals(owner)) {
            publish(new State(elapsedRealtime + state.fullDelayMs, bootCount, state.fullDelayMs,
                state.wrongAttempts, true, true, null, null));
        }
    }

    String admit(String owner, long elapsedRealtime, int bootCount) {
        if (!adopted()) throw new IllegalStateException("PIN accounting was not adopted");
        if (state.pendingToken != null) throw new IllegalStateException("pin-attempt-busy");
        if (remaining(elapsedRealtime, bootCount) > 0) throw new IllegalStateException("pin-attempt-wait");
        int count = wrongAttempts() == Integer.MAX_VALUE ? Integer.MAX_VALUE : wrongAttempts() + 1;
        String token = java.util.UUID.randomUUID().toString();
        publish(new State(0, bootCount, delay(count), count, true, true, owner, token));
        return token;
    }

    void finish(String owner, String token, boolean successful, long elapsedRealtime, int bootCount) {
        if (state == null || !owner.equals(state.pendingOwner) || !token.equals(state.pendingToken)) {
            throw new IllegalStateException("pin-attempt-superseded");
        }
        if (successful) reset();
        else publish(new State(elapsedRealtime + state.fullDelayMs, bootCount, state.fullDelayMs,
            state.wrongAttempts, true, true, null, null));
    }

    private static long delay(int count) {
        return count < 2 ? 0 : count >= 8 ? 60_000 : 1000L << (count - 2);
    }

    private void publish(State next) { store.write(next); state = next; }

    void hold(long remainingMs, long fullDelayMs, long elapsedRealtime, int bootCount) {
        long owed = Math.max(remaining(elapsedRealtime, bootCount), remainingMs);
        if (state != null && state.pendingToken != null) return;
        publish(new State(elapsedRealtime + owed, bootCount,
            owed == 0 ? 0 : Math.max(fullDelayMs(), fullDelayMs), wrongAttempts(), adopted(), true, null, null));
    }

    long remaining(long elapsedRealtime, int bootCount) {
        if (state == null) return 0;
        if (state.pendingToken != null) return state.fullDelayMs;
        if (!state.waitRecorded) return 0;
        if (state.bootCount != bootCount) {
            publish(new State(elapsedRealtime + state.fullDelayMs, bootCount, state.fullDelayMs,
                state.wrongAttempts, state.adopted, true, null, null));
        }
        long owed = Math.max(0, state.deadline - elapsedRealtime);
        if (owed == 0 && state.fullDelayMs != 0) {
            publish(new State(0, bootCount, 0, state.wrongAttempts, state.adopted, true, null, null));
        }
        return owed;
    }

    void reset() {
        store.clear();
        // A reset marker prevents a stale WebView count being adopted again.
        state = new State(0, 0, 0, 0, true, false, null, null);
    }
}
