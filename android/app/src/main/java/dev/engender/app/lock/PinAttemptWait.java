package dev.engender.app.lock;

/** Process-local PIN wait. Elapsed realtime survives WebView recreation and
 * includes device sleep without trusting the editable wall clock. */
final class PinAttemptWait {
    private long deadline;

    synchronized void hold(long remainingMs, long elapsedRealtime) {
        deadline = Math.max(deadline, elapsedRealtime + remainingMs);
    }

    synchronized long remaining(long elapsedRealtime) {
        return Math.max(0, deadline - elapsedRealtime);
    }

    synchronized void reset() {
        deadline = 0;
    }
}
