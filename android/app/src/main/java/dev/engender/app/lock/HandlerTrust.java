package dev.engender.app.lock;

import java.util.List;

/**
 * Which handlers of an implicit intent may keep the journal unlocked while
 * they are in front. "Lock immediately" waits a minute on a screen the app
 * opened for a result, because a picker the person is in the middle of
 * should not send them back to the lock screen, and a locked route unmounts,
 * so a photo or file that comes back after a lock has nowhere to land. That
 * grace is for the system's own pickers and camera. An implicit intent goes
 * to whichever app answers it, and one that is not a system app can sit
 * translucent over the journal for the whole grace, so it gets none:
 * leaving to it locks as any other leave does.
 *
 * <p>The handler that decides is the one the system will actually open, the
 * default for that intent. The usual phone has one answer (Google Camera,
 * DocumentsUI), or a default the person picked, and keeps the grace even
 * with other camera apps installed. When there is no default the system
 * shows its chooser and the person may pick any candidate, so the grace
 * needs every candidate to be a system app.
 *
 * <p>An intent with a component set was addressed by the app itself (the
 * device credential prompt), so it is the app's own screen. Plain data, so
 * a JVM test holds the rule; MainActivity reads the handlers off the
 * PackageManager.
 */
public final class HandlerTrust {
    private HandlerTrust() {}

    /** One app that could answer the intent. {@code chooser}: the framework's
        own resolver, which stands for a choice still to be made. */
    public static final class Handler {
        final boolean system;
        final boolean chooser;
        public Handler(boolean system, boolean chooser) { this.system = system; this.chooser = chooser; }
    }

    /** {@code resolved} is what the system would open (null when nothing
        answers); {@code all} is every app that could answer. */
    public static boolean verified(boolean explicitComponent, Handler resolved, List<Handler> all) {
        if (explicitComponent) return true;
        if (resolved != null && !resolved.chooser) return resolved.system;
        if (all == null || all.isEmpty()) return false;
        for (Handler handler : all) if (!handler.system) return false;
        return true;
    }
}
