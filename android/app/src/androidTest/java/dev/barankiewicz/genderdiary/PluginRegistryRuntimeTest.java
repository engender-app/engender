package dev.barankiewicz.genderdiary;

import static org.junit.Assert.assertTrue;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Checks that every plugin the app requires is visible in the Capacitor
 * runtime plugin map once MainActivity starts.
 */
@RunWith(AndroidJUnit4.class)
public class PluginRegistryRuntimeTest {

    @Test
    public void requiredPluginsAreRegisteredInTheBridgeRuntime() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue("required plugins did not become available", awaitRequiredPlugins(scenario));
        }
    }

    private static boolean awaitRequiredPlugins(ActivityScenario<MainActivity> scenario)
        throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
        String required = jsArray(AndroidPluginRegistry.requiredPluginIds());

        while (System.nanoTime() < deadline) {
            AtomicReference<String> value = new AtomicReference<>();
            CountDownLatch evaluated = new CountDownLatch(1);

            scenario.onActivity(
                activity ->
                    activity
                        .getBridge()
                        .getWebView()
                        .evaluateJavascript(
                            "(function(){"
                                + "const required=" + required + ";"
                                + "const plugins=(window.Capacitor&&window.Capacitor.Plugins)||{};"
                                + "return required.every((name)=>!!plugins[name]);"
                                + "})()",
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

    private static String jsArray(List<String> values) {
        StringBuilder builder = new StringBuilder("[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) builder.append(',');
            builder.append('"').append(values.get(i)).append('"');
        }
        builder.append(']');
        return builder.toString();
    }
}