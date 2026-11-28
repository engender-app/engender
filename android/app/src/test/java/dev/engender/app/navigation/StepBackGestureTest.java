package dev.engender.app.navigation;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.Test;

public class StepBackGestureTest {
    private final List<String> page = new ArrayList<>();
    private int ordinaryBacks;
    private final StepBackGesture gesture = new StepBackGesture(new StepBackGesture.Page() {
        @Override public void started() { page.add("started"); }
        @Override public void progressed(float progress) { page.add("progress " + progress); }
        @Override public void cancelled() { page.add("cancelled"); }
    }, () -> ordinaryBacks++);

    @Test public void offUntilThePageArmsItAndOffAgainWhenItDisarms() {
        assertFalse(gesture.enabled());
        gesture.arm(true);
        assertTrue(gesture.enabled());
        gesture.arm(false);
        assertFalse(gesture.enabled());
    }

    @Test public void aNewOrReloadedPageTurnsItOff() {
        gesture.arm(true);
        gesture.pageStarted();
        assertFalse(gesture.enabled());
    }

    @Test public void theSwipeGoesToThePageClampedToZeroToOne() {
        gesture.arm(true);
        gesture.started();
        gesture.progressed(0.25f);
        gesture.progressed(1.5f);
        gesture.progressed(-0.1f);
        gesture.cancelled();
        assertEquals(List.of("started", "progress 0.25", "progress 1.0", "progress 0.0", "cancelled"), page);
        assertEquals(0, ordinaryBacks);
    }

    @Test public void aReleaseAlwaysGoesOnToTheOrdinaryBack() {
        gesture.arm(true);
        gesture.started();
        gesture.released();
        assertEquals(1, ordinaryBacks);
    }

    @Test public void aReleaseStillGoesOnWhenThePageIsGoneOrSilent() {
        gesture.arm(true);
        gesture.pageStarted();
        gesture.released();
        gesture.arm(false);
        gesture.released();
        assertEquals(2, ordinaryBacks);
        assertFalse(page.contains("released"));
    }
}
