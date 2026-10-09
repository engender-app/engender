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
    private static final String PROCESS_TOKEN = java.util.UUID.randomUUID().toString();
    private static final long DELAY_MS = 300_000;
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

    // Each stage is a separate instrumentation invocation. Only cleanup clears the fixture.
    @Test public void deadlineSurvivesActualProcessDeath() {
        String stage = InstrumentationRegistry.getArguments().getString("pinWaitStage");
        assertTrue("needs the staged process-death runner", stage != null);
        PinAttemptWait wait = LockTimingPlugin.pinWait(context);
        android.content.SharedPreferences proof = context.getSharedPreferences("pin-wait-process-proof", Context.MODE_PRIVATE);
        if ("cleanup".equals(stage)) {
            wait.reset();
            assertTrue(proof.edit().clear().commit());
            assertTrue("cleanup left persisted wait", !wait.hasState());
        } else if ("seed".equals(stage)) {
            wait.reset();
            long elapsed = SystemClock.elapsedRealtime();
            int boot = LockTimingPlugin.bootCount(context);
            wait.hold(DELAY_MS, DELAY_MS, elapsed, boot);
            assertTrue(proof.edit().putString("token", PROCESS_TOKEN)
                .putInt("pid", android.os.Process.myPid()).putLong("elapsed", elapsed)
                .putInt("boot", boot).commit());
            assertTrue(wait.hasState());
            android.util.Log.i("PinWaitProof", "seed pid=" + android.os.Process.myPid() + " token=" + PROCESS_TOKEN);
            System.out.println("PIN_WAIT_SEED pid=" + android.os.Process.myPid() + " token=" + PROCESS_TOKEN);
        } else {
            assertEquals("restore", stage);
            assertTrue("seed process token missing", proof.contains("token"));
            assertTrue("restore ran in the seed process", !PROCESS_TOKEN.equals(proof.getString("token", "")));
            assertTrue("restore reused the seed PID", proof.getInt("pid", -1) != android.os.Process.myPid());
            assertEquals("device rebooted between stages", proof.getInt("boot", -1), LockTimingPlugin.bootCount(context));
            long elapsed = SystemClock.elapsedRealtime();
            long expected = DELAY_MS - (elapsed - proof.getLong("elapsed", 0));
            long remaining = wait.remaining(elapsed, LockTimingPlugin.bootCount(context));
            assertTrue("no persisted wait after process death", wait.hasState());
            assertTrue("process death cleared the elapsed deadline", remaining > 0);
            assertEquals("persisted deadline changed", expected, remaining);
            android.util.Log.i("PinWaitProof", "restore seedPid=" + proof.getInt("pid", -1)
                + " pid=" + android.os.Process.myPid() + " token=" + PROCESS_TOKEN + " remainingMs=" + remaining);
            System.out.println("PIN_WAIT_RESTORE seedPid=" + proof.getInt("pid", -1)
                + " pid=" + android.os.Process.myPid() + " token=" + PROCESS_TOKEN + " remainingMs=" + remaining);
        }
    }
}
