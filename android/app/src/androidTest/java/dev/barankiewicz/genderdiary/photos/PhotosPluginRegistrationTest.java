package dev.barankiewicz.genderdiary.photos;

import static org.junit.Assert.assertTrue;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import dev.barankiewicz.genderdiary.MainActivity;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Ticket 37 smoke check: the Photos Capacitor bridge must be present in the
 * app runtime plugin map, or every photo call fails before reaching Java.
 */
@RunWith(AndroidJUnit4.class)
public class PhotosPluginRegistrationTest {

    @Test
    public void photosPluginIsRegisteredInTheBridge() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue("Photos plugin did not become available", awaitPhotosPlugin(scenario));
        }
    }

    private static boolean awaitPhotosPlugin(ActivityScenario<MainActivity> scenario)
        throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);

        while (System.nanoTime() < deadline) {
            AtomicReference<String> value = new AtomicReference<>();
            CountDownLatch evaluated = new CountDownLatch(1);

            scenario.onActivity(
                activity ->
                    activity
                        .getBridge()
                        .getWebView()
                        .evaluateJavascript(
                            "typeof window.Capacitor !== 'undefined'"
                                + " && !!window.Capacitor.Plugins"
                                + " && !!window.Capacitor.Plugins.Photos",
                            result -> {
                                value.set(result);
                                evaluated.countDown();
                            }));

            if (!evaluated.await(10, TimeUnit.SECONDS)) {
                throw new AssertionError("the WebView stopped answering");
            }

            if ("true".equals(value.get())) return true;
            Thread.sleep(250);
        }

        return false;
    }
}
