package dev.engender.app.navigation;

/**
 * Keep Android 14 predictive back rules testable on the JVM.
 * StepBackPlugin forwards gesture progress while the page has armed
 * it. Loading or losing the page clears the arm. released() always
 * forwards to the normal Back path, even if the callback stayed on.
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
