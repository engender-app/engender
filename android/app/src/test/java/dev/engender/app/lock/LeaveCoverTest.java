package dev.engender.app.lock;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Before;
import org.junit.Test;

/** The leave cover's decision. */
public class LeaveCoverTest {
    @Before
    public void reset() {
        LeaveCover.resetForTest();
    }

    @Test
    public void coversEveryLeaveWhileALockIsSet() {
        LeaveCover.set(true, "#0D141A");
        assertTrue(LeaveCover.coverOnLeave());
        assertTrue(LeaveCover.isShown());
        assertEquals(0xFF0D141A, LeaveCover.ground());
    }

    @Test
    public void leavesTheWindowAloneWhenNoLockIsSet() {
        LeaveCover.set(false, "#F4F8FB");
        assertFalse(LeaveCover.coverOnLeave());
        assertFalse(LeaveCover.isShown());
    }

    @Test
    public void staysUpThroughEveryLeaveCallbackUntilThePageRevealsIt() {
        LeaveCover.set(true, "#F4F8FB");
        assertTrue(LeaveCover.coverOnLeave()); // onUserLeaveHint
        assertTrue(LeaveCover.coverOnLeave()); // onPause
        LeaveCover.set(false, "#F4F8FB");
        assertTrue(LeaveCover.coverOnLeave()); // a later leave with nothing to cover does not take it down
        assertTrue(LeaveCover.reveal());
        assertFalse(LeaveCover.isShown());
        assertFalse(LeaveCover.reveal());
    }

    @Test
    public void takesTheRecentsPreviewAwayWhileALockIsSet() {
        LeaveCover.set(true, "#F4F8FB");
        assertFalse(LeaveCover.recentsPreviewAllowed(true));
        assertFalse(LeaveCover.recentsPreviewAllowed(false));
        LeaveCover.set(false, "#F4F8FB");
        assertTrue(LeaveCover.recentsPreviewAllowed(true));
        assertFalse(LeaveCover.recentsPreviewAllowed(false));
    }

    @Test
    public void keepsTheLastGoodGround() {
        LeaveCover.set(true, "#F4F8FB");
        LeaveCover.set(true, "not a colour");
        assertEquals(0xFFF4F8FB, LeaveCover.ground());
    }
}
