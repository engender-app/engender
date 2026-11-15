package dev.engender.app.photos;

import org.junit.Test;
import org.junit.runner.RunWith;
import androidx.test.ext.junit.runners.AndroidJUnit4;

/**
 * Does nothing. Running it with `am instrument` starts the app's process with no
 * activity and no plugin, which is the start the camera-capture sweep has to
 * survive (device-proof.sh, GD-012).
 */
@RunWith(AndroidJUnit4.class)
public class ProcessStartProbeTest {
    @Test public void theProcessStarted() {}
}
