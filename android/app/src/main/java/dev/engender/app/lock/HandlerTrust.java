package dev.engender.app.lock;

/**
 * Which handlers of an implicit intent may keep the journal unlocked while
 * they are in front. "Lock immediately" waits a minute on a screen the app
 * opened for a result, because a picker the person is in the middle of
 * should not send them back to the lock screen. That grace is for the
 * system's own pickers and camera. An implicit intent goes to whichever app
 * answers it, and one that is not a system app (a third-party camera, a
 * document provider's own activity) can sit translucent over the journal
 * for the whole grace, so a handler like that gets no grace: leaving to it
 * locks as any other leave does, and the result still reaches the plugin
 * that asked.
 *
 * <p>An intent with a component set was addressed by the app itself (the
 * device credential prompt), so it is the app's own screen. Plain data, so
 * a JVM test holds the rule; MainActivity reads the handlers off the
 * PackageManager.
 */
public final class HandlerTrust {
    private HandlerTrust() {}

    /** One app that could answer the intent. */
    public static final class Handler {
        final boolean system;
        public Handler(boolean system) { this.system = system; }
    }

    /** True when every app that could answer is a system app. No visible
        handler is not trust: the answer is unknown. */
    public static boolean verified(boolean explicitComponent, java.util.List<Handler> handlers) {
        if (explicitComponent) return true;
        if (handlers == null || handlers.isEmpty()) return false;
        for (Handler handler : handlers) if (!handler.system) return false;
        return true;
    }
}
