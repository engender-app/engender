package dev.engender.app.keystore;

import static org.junit.Assert.*;

import android.content.Context;
import android.util.Base64;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.Before;
import org.junit.Assume;
import org.junit.runner.RunWith;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

/** Separate instrumentation processes, with an owned QEMU power cut between
 * them. The host supplies wraps made by the production crypto in the WebView. */
@RunWith(AndroidJUnit4.class)
public class CredentialWrapFailureRestartTest {
    @Before public void requireHostFixtures() {
        Assume.assumeTrue("standalone failure/restart host supplies both wraps",
            InstrumentationRegistry.getArguments().getString("old") != null
            && InstrumentationRegistry.getArguments().getString("next") != null);
    }

    private Context context() {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("failure probes require an isolated package", app.getPackageName().startsWith("dev.engender.app.test."));
        return app;
    }

    private String wrap(String name) {
        String encoded = InstrumentationRegistry.getArguments().getString(name);
        assertNotNull("the host must supply " + name, encoded);
        return new String(Base64.decode(encoded, Base64.DEFAULT), StandardCharsets.UTF_8);
    }

    @Test public void prepareFailedPersistence() throws Exception {
        Context app = context();
        new CredentialWrapStore(app).write(wrap("old"));
        AtomicInteger syncs = new AtomicInteger();
        CredentialWrapStore failing = new CredentialWrapStore(app, directory -> {
            if (syncs.incrementAndGet() == 2) throw new IOException("directory fsync failed");
        });
        try {
            failing.write(wrap("next"));
            fail("an incomplete change must not be confirmed");
        } catch (IOException expected) {
            assertEquals("directory fsync failed", expected.getMessage());
        }
        assertEquals("the fault must be after publication", 2, syncs.get());
        assertEquals(wrap("next"), failing.read());
        // Do not retry or sync here. The host cuts QEMU before the next test.
    }

    @Test public void verifyAuthorityAfterRestart() throws Exception {
        String actual = new CredentialWrapStore(context()).read();
        assertTrue("an unconfirmed change must retain the old or new wrap",
            wrap("old").equals(actual) || wrap("next").equals(actual));
    }
}
