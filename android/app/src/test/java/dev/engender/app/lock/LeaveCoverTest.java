package dev.engender.app.lock;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Before;
import org.junit.Test;

/** The leave cover's decision (tester-report-02 ticket 07, return from Home). */
public class LeaveCoverTest {
    @Before
    public void reset() {
        LeaveCover.resetForTest();
    }

    @Test
    public void coversALeaveThatLocksAtOnce() {
        LeaveCover.set(true, "#0D141A");
        assertTrue(LeaveCover.coverOnLeave(false));
        assertTrue(LeaveCover.isShown());
        assertEquals(0xFF0D141A, LeaveCover.ground());
    }

    @Test
    public void leavesTheWindowAloneWhenTheLeaveDoesNotLock() {
        LeaveCover.set(false, "#F4F8FB");
        assertFalse(LeaveCover.coverOnLeave(false));
        assertFalse(LeaveCover.isShown());
    }

    @Test
    public void givesTheAppsOwnScreensTheirGrace() {
        LeaveCover.set(true, "#F4F8FB");
        assertFalse(LeaveCover.coverOnLeave(true));
    }

    @Test
    public void staysUpThroughEveryLeaveCallbackUntilThePageRevealsIt() {
        LeaveCover.set(true, "#F4F8FB");
        assertTrue(LeaveCover.coverOnLeave(false)); // onUserLeaveHint
        assertTrue(LeaveCover.coverOnLeave(false)); // onPause
        assertTrue(LeaveCover.coverOnLeave(true)); // a later own-screen report does not take it down
        assertTrue(LeaveCover.reveal());
        assertFalse(LeaveCover.isShown());
        assertFalse(LeaveCover.reveal());
    }

    @Test
    public void keepsTheLastGoodGround() {
        LeaveCover.set(true, "#F4F8FB");
        LeaveCover.set(true, "not a colour");
        assertEquals(0xFFF4F8FB, LeaveCover.ground());
    }
}
