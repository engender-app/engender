package dev.engender.app.navigation;

/**
 * The rules of the predictive step back (tester report 02, ticket 04),
 * kept free of Android so a JVM test can hold them.
 *
 * On Android 14 and later a back swipe reports where it is before it is
 * released, but only to an enabled callback. Capacitor's App plugin has one
 * that is always on and hears only the release, so on its own the system
 * draws its arrow and nothing else. StepBackPlugin adds a second callback
 * that hears the whole swipe and passes it to the page, which draws a new
 * entry's step back under the finger.
 *
 * Two rules keep that callback from ever costing a Back:
 *
 * - It is on only while the page says so (arm), and a page that starts
 *   loading or dies takes that back with it (pageStarted). The page is the
 *   source of truth; nothing here turns it on.
 * - The release is never handled here. Whatever the state, released() hands
 *   the Back on to the ordinary back button, which is the path every Back
 *   took before this existed. A callback left on by mistake therefore costs
 *   the drawing at most, never the Back itself.
 */
public final class StepBackGesture {
    /** Where the swipe goes: the page's StepBack listeners. */
    public interface Page {
        void started();
        void progressed(float progress);
        void cancelled();
    }

    private final Page page;
    private final Runnable ordinaryBack;
    private boolean armed;

    public StepBackGesture(Page page, Runnable ordinaryBack) {
        this.page = page;
        this.ordinaryBack = ordinaryBack;
    }

    /** Whether the callback should be enabled now. */
    public boolean enabled() {
        return armed;
    }

    public void arm(boolean on) {
        armed = on;
    }

    /** A new document, a reload or a dead renderer: whatever armed the
        callback is gone, so the callback goes off until the new page asks. */
    public void pageStarted() {
        armed = false;
    }

    public void started() {
        page.started();
    }

    public void progressed(float progress) {
        page.progressed(Math.max(0f, Math.min(1f, progress)));
    }

    public void cancelled() {
        page.cancelled();
    }

    public void released() {
        ordinaryBack.run();
    }
}
