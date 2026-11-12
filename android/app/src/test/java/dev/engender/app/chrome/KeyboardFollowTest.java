package dev.engender.app.chrome;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class KeyboardFollowTest {
    @Test public void openingMovesThePaddingWithTheKeyboardFromWhereItStood() {
        KeyboardFollow.Track t = new KeyboardFollow.Track();
        t.prepare(0);
        t.started(1000);
        assertEquals(0, t.progress(0));
        assertEquals(400, t.progress(400));
        assertEquals(1000, t.progress(1000));
    }

    @Test public void openingNeverDropsBelowThePaddingItStartedWith() {
        KeyboardFollow.Track t = new KeyboardFollow.Track();
        t.prepare(120);
        t.started(1000);
        assertEquals(120, t.progress(30));
        assertEquals(600, t.progress(600));
    }

    @Test public void closingRunsTheOtherWayDownToNothing() {
        KeyboardFollow.Track t = new KeyboardFollow.Track();
        t.prepare(1000);
        t.started(1000);
        assertEquals(750, t.progress(750));
        assertEquals(0, t.progress(0));
    }

    @Test public void theInsetsPassCannotMovePaddingMidMovementButCanAfterwards() {
        KeyboardFollow.Track t = new KeyboardFollow.Track();
        t.prepare(0);
        t.started(1000);
        t.progress(250);
        assertEquals(250, t.reapply(1000));
        t.finished();
        assertEquals(700, t.reapply(700));
    }

    @Test public void beforeTheFirstFrameThePaddingStaysWhereItWas() {
        KeyboardFollow.Track t = new KeyboardFollow.Track();
        t.prepare(300);
        assertEquals(300, t.reapply(1000));
    }
}
