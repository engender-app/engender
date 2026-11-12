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
}
