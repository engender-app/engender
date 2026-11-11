package dev.engender.app.lock;

/**
 * Whether the activity covers its window on the way out, and with what.
 *
 * "Lock immediately" locks in JavaScript, which the activity asks for with
 * evaluateJavascript as it is left. Android photographs the window for its
 * task snapshot before the WebView has drawn the gate, and draws that
 * snapshot first when the person comes back, so the screen they left was
 * visible for about 190ms of every return, and for seconds when the WebView
 * was slow to draw again (tester-report-02 ticket 07). The activity cannot
 * wait for the page, so it covers the window itself, in the same callback,
 * with a block of the page's ground; the snapshot is then of the cover. The
 * page takes it off once it has drawn the gate (leave-cover.ts).
 *
 * The page mirrors what the activity needs ahead of time, because there is
 * no asking it while leaving: whether a leave locks at once, and the ground.
 * Process memory is enough. A new process starts locked and has drawn
 * nothing of the journal for a snapshot to keep.
 *
 * Plain Java, so the decision is held by a JVM test; MainActivity owns the
 * View.
 */
public final class LeaveCover {
    private static volatile boolean coverOnLeave;
    private static volatile int ground = 0xFF000000;
    private static boolean shown;

    private LeaveCover() {}

    /** The page's mirror: whether a leave locks at once, and its ground as
        #RRGGBB. A ground that does not parse keeps the last good one. */
    public static synchronized void set(boolean cover, String groundHex) {
        coverOnLeave = cover;
        Integer parsed = parseGround(groundHex);
        if (parsed != null) ground = parsed;
    }

    /** Called on every leave. True when the window should be covered now:
        the leave locks, and it is not one of the app's own screens (a picker,
        the camera), which the page gives a minute's grace instead. */
    public static synchronized boolean coverOnLeave(boolean ownScreenOpen) {
        if (!coverOnLeave || ownScreenOpen) return shown;
        shown = true;
        return true;
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
        coverOnLeave = false;
        ground = 0xFF000000;
        shown = false;
    }
}
