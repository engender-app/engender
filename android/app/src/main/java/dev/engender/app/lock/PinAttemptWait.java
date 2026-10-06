package dev.engender.app.lock;

/** A persisted elapsed-realtime deadline is valid only on its recorded boot. */
final class PinAttemptWait {
    static final class State {
        final long deadline;
        final int bootCount;
        final long fullDelayMs;
        State(long deadline, int bootCount, long fullDelayMs) {
            this.deadline = deadline;
            this.bootCount = bootCount;
            this.fullDelayMs = fullDelayMs;
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

    boolean hasState() { return state != null; }
    long fullDelayMs() { return state == null ? 0 : state.fullDelayMs; }

    void hold(long remainingMs, long fullDelayMs, long elapsedRealtime, int bootCount) {
        long owed = Math.max(remaining(elapsedRealtime, bootCount), remainingMs);
        state = new State(elapsedRealtime + owed, bootCount, owed == 0 ? 0 : fullDelayMs);
        store.write(state);
    }

    long remaining(long elapsedRealtime, int bootCount) {
        if (state == null) return 0;
        if (state.bootCount != bootCount) {
            state = new State(elapsedRealtime + state.fullDelayMs, bootCount, state.fullDelayMs);
            store.write(state);
        }
        long owed = Math.max(0, state.deadline - elapsedRealtime);
        if (owed == 0 && state.fullDelayMs != 0) {
            state = new State(0, bootCount, 0);
            store.write(state);
        }
        return owed;
    }

    void reset() {
        store.clear();
        state = null;
    }
}
