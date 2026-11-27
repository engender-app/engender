package dev.engender.app.lock;

import java.util.List;

/**
 * Allow a one-minute lock grace for a trusted activity opened for a
 * result so its picker can return to the mounted route. For implicit
 * intents require a system default handler, or all system candidates
 * when Android shows a chooser. Explicit components are app-selected.
 * MainActivity supplies PackageManager data to the JVM-testable rule.
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
