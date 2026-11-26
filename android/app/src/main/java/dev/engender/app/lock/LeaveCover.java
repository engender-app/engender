package dev.engender.app.lock;

/**
 * Cover the window before Android takes a task snapshot when a lock
 * is configured. The JS gate may paint too late. MainActivity owns
 * the cover view and leave-cover.ts removes it after the gate draws.
 *
 * The page mirrors lock state and background ahead of time. Process
 * memory is enough because a fresh process starts locked. Test the
 * decision on the JVM.
 */
public final class LeaveCover {
    private static volatile boolean coverConfigured;
    private static volatile int ground = 0xFF000000;
    private static boolean shown;

    private LeaveCover() {}

    /** The page's mirror: whether a lock is set, and its ground as
        #RRGGBB. A ground that does not parse keeps the last good one. */
    public static synchronized void set(boolean cover, String groundHex) {
        coverConfigured = cover;
        Integer parsed = parseGround(groundHex);
        if (parsed != null) ground = parsed;
    }

    /** Called on every leave. True when the window should be covered now:
        a lock is set, whatever its timing and whichever screen the leave is
        to (the snapshot Recents keeps is taken at the leave, before the
        page can say whether the lock will be due). A leave with nothing to
        cover reports a cover from an earlier leave that is still up, so a
        later callback does not read as taking it down. */
    public static synchronized boolean coverOnLeave() {
        if (!coverConfigured) return shown;
        shown = true;
        return true;
    }

    /** Whether Recents may keep a preview of the window. The task snapshot is
        taken before a cover can be drawn into it, so while a lock is set no
        preview is kept at all (the capture choice still decides screenshots
        taken inside the app, and a capture choice of "no" still hides it). */
    public static boolean recentsPreviewAllowed(boolean captureAllowed) {
        return captureAllowed && !coverConfigured;
    }

    /** The page has drawn the gate, or did not lock: the cover comes off. */
    public static synchronized boolean reveal() {
        boolean was = shown;
        shown = false;
        return was;
    }

    public static synchronized boolean isShown() {
        return shown;
    }

    public static int ground() {
        return ground;
    }

    static Integer parseGround(String hex) {
        if (hex == null) return null;
        String value = hex.trim();
        if (!value.matches("#[0-9A-Fa-f]{6}")) return null;
        return 0xFF000000 | Integer.parseInt(value.substring(1), 16);
    }

    /** Tests only. */
    static synchronized void resetForTest() {
        coverConfigured = false;
        ground = 0xFF000000;
        shown = false;
    }
}
