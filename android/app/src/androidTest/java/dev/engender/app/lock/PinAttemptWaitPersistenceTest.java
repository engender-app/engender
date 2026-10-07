package dev.engender.app.lock;

import android.content.Context;
import android.os.SystemClock;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

@RunWith(AndroidJUnit4.class)
public class PinAttemptWaitPersistenceTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    @Test public void preferenceDeadlineSurvivesANewOwnerAndNewBoot() {
        PinAttemptWait wait = LockTimingPlugin.pinWait(context);
        try {
            wait.reset();
            wait.hold(750, 60_000, 5000, 7);
            assertEquals(500, LockTimingPlugin.pinWait(context).remaining(5250, 7));
            assertEquals(60_000, LockTimingPlugin.pinWait(context).remaining(100, 8));
            assertEquals(59_750, LockTimingPlugin.pinWait(context).remaining(350, 8));
        } finally { LockTimingPlugin.pinWait(context).reset(); }
    }

    // Run twice with pinWaitStage=seed and pinWaitStage=restore, with a force-stop between runs.
    @Test public void deadlineSurvivesActualProcessDeath() {
        String stage = InstrumentationRegistry.getArguments().getString("pinWaitStage");
        org.junit.Assume.assumeTrue("needs the two-process runner", stage != null);
        PinAttemptWait wait = LockTimingPlugin.pinWait(context);
        if ("seed".equals(stage)) {
            wait.reset();
            wait.hold(60_000, 60_000, SystemClock.elapsedRealtime(), LockTimingPlugin.bootCount(context));
            assertTrue(wait.hasState());
        } else {
            assertEquals("restore", stage);
            try {
                assertTrue("no persisted wait after process death", wait.hasState());
                assertTrue("process death cleared the elapsed deadline",
                    wait.remaining(SystemClock.elapsedRealtime(), LockTimingPlugin.bootCount(context)) > 0);
            } finally { wait.reset(); }
        }
    }
}
