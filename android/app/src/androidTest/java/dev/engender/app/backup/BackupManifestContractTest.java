package dev.engender.app.backup;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import org.junit.Test;

/** Inspect the installed artifact, including dependency merge-ins. */
public class BackupManifestContractTest {
    @Test public void installedPermissionsAndComponentsMatchLocalDelivery() throws Exception {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PackageInfo info = app.getPackageManager().getPackageInfo(app.getPackageName(),
            PackageManager.GET_PERMISSIONS | PackageManager.GET_SERVICES |
            PackageManager.GET_RECEIVERS | PackageManager.GET_DISABLED_COMPONENTS);
        Set<String> expected = new HashSet<>();
        for (String name : new String[] { "CAMERA", "MODIFY_AUDIO_SETTINGS", "POST_NOTIFICATIONS",
            "RECEIVE_BOOT_COMPLETED", "RECORD_AUDIO", "SCHEDULE_EXACT_ALARM", "USE_BIOMETRIC",
            "USE_FINGERPRINT", "WAKE_LOCK" }) expected.add("android.permission." + name);
        expected.add(app.getPackageName() + ".DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION");
        assertEquals(expected, new HashSet<>(Arrays.asList(info.requestedPermissions)));
        Set<String> services = new HashSet<>();
        for (android.content.pm.ServiceInfo service : info.services) services.add(service.name);
        assertTrue(services.contains("androidx.work.impl.background.systemjob.SystemJobService"));
        assertFalse(services.contains("androidx.work.impl.foreground.SystemForegroundService"));
        Set<String> receivers = new HashSet<>();
        for (android.content.pm.ActivityInfo receiver : info.receivers) receivers.add(receiver.name);
        assertTrue(receivers.contains("androidx.work.impl.background.systemalarm.RescheduleReceiver"));
        assertFalse(receivers.contains("androidx.work.impl.background.systemalarm.ConstraintProxy$NetworkStateProxy"));
    }
}
