package dev.engender.app.chrome;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class KeyboardFollowTest {
    @Test public void thePaddingRidesTheKeyboardFromStartToEnd() {
        assertEquals(0, KeyboardFollow.paddingAt(0, 1000, 0f));
        assertEquals(500, KeyboardFollow.paddingAt(0, 1000, 0.5f));
        assertEquals(1000, KeyboardFollow.paddingAt(0, 1000, 1f));
    }

    @Test public void closingRunsTheOtherWay() {
        assertEquals(1000, KeyboardFollow.paddingAt(1000, 0, 0f));
        assertEquals(250, KeyboardFollow.paddingAt(1000, 0, 0.75f));
    }

    @Test public void anOvershootingFractionStaysWithinTheTwoEnds() {
        assertEquals(1000, KeyboardFollow.paddingAt(0, 1000, 1.08f));
        assertEquals(0, KeyboardFollow.paddingAt(0, 1000, -0.02f));
    }

    @Test public void whileTheKeyboardMovesTheInsetsPassCannotMoveThePaddingToTheEnd() {
        KeyboardFollow.Track t = new KeyboardFollow.Track();
        t.prepare(0);
        // The end padding lands before the first frame; the first frame stays at the start.
        assertEquals(0, t.started(1000));
        t.progress(0.25f);
        // Capacitor's listener re-applies 1000 on the next insets pass; ours puts the frame's value back.
        assertEquals(250, t.reapply(1000));
        t.progress(0.5f);
        assertEquals(500, t.reapply(1000));
    }

    @Test public void afterTheKeyboardStopsThePaddingIsLeftAlone() {
        KeyboardFollow.Track t = new KeyboardFollow.Track();
        t.prepare(0);
        t.started(1000);
        assertEquals(1000, t.finished());
        assertEquals(700, t.reapply(700));
    }
}
