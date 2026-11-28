package dev.engender.app.keystore;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.res.AssetManager;
import androidx.test.core.app.ActivityScenario;
import androidx.lifecycle.Lifecycle;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.engender.app.MainActivity;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.util.concurrent.atomic.AtomicInteger;

@RunWith(AndroidJUnit4.class)
public class CredentialWrapStoreTest {
    private static final String OLD = "{\"credential\":\"old\"}";
    private static final String NEXT = "{\"credential\":\"new\"}";

    private Context fixture() throws Exception {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File dir = new File(app.getCacheDir(), "credential-store-tests");
        delete(dir);
        assertTrue(dir.mkdirs());
        return new ContextWrapper(app) {
            @Override public File getFilesDir() { return dir; }
        };
    }

    @Test public void interruptedStagingKeepsTheAuthoritativeWrap() throws Exception {
        Context context = fixture();
        CredentialWrapStore store = new CredentialWrapStore(context);
        store.write(OLD);
        Files.write(new File(context.getFilesDir(), CredentialWrapStore.FILENAME + ".new").toPath(), new byte[]{'{'});
        assertEquals(OLD, new CredentialWrapStore(context).read());
        store.write(NEXT);
        assertEquals(NEXT, new CredentialWrapStore(context).read());
    }

    @Test public void failedStagingDoesNotConfirmOrDamageTheOldWrap() throws Exception {
        Context context = fixture();
        CredentialWrapStore store = new CredentialWrapStore(context);
        store.write(OLD);
        File staged = new File(context.getFilesDir(), CredentialWrapStore.FILENAME + ".new");
        assertTrue(staged.mkdir());
        try { store.write(NEXT); fail("a staging write should fail"); }
        catch (IOException expected) { /* The previous generation remains authoritative. */ }
        assertEquals(OLD, new CredentialWrapStore(context).read());
    }

    @Test public void failedDirectoryPersistenceReportsAnUnconfirmedChangeAcrossRestart() throws Exception {
        Context context = fixture();
        new CredentialWrapStore(context).write(OLD);
        AtomicInteger syncs = new AtomicInteger();
        CredentialWrapStore failing = new CredentialWrapStore(context, directory -> {
            if (syncs.incrementAndGet() == 2) throw new IOException("directory fsync failed");
        });
        try { failing.write(NEXT); fail("confirmation must wait for directory persistence"); }
        catch (IOException expected) { assertEquals("directory fsync failed", expected.getMessage()); }
        assertEquals(2, syncs.get());
        assertEquals(NEXT, new CredentialWrapStore(context).read());
        // Retry publishes durably; there is no fallback to the old credential.
        new CredentialWrapStore(context).write(NEXT);
        assertEquals(NEXT, new CredentialWrapStore(context).read());
    }

    @Test public void adoptionAndRemovalNeverReinstateSupersededCredentials() throws Exception {
        Context context = fixture();
        CredentialWrapStore store = new CredentialWrapStore(context);
        store.adopt(OLD);
        store.write(NEXT);
        new CredentialWrapStore(context).adopt(OLD);
        assertEquals(NEXT, store.read());
        store.remove();
        new CredentialWrapStore(context).adopt(OLD);
        assertEquals("null", store.read());
    }

    /** Host power-cut runner supplies the isolated package and cuts this process/device.
     * This method does no credential mutation; the probe calls production TS flows. */
    @Test public void powerCutHost() throws Exception {
        if (!"true".equals(InstrumentationRegistry.getArguments().getString("powerCutHost"))) return;
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("power cuts require an isolated package", app.getPackageName().startsWith("dev.engender.app.test."));
        String bundle = InstrumentationRegistry.getArguments().getString("probeBundle", "credential-power-cut-probe");
        assertTrue("unknown credential probe", "credential-power-cut-probe".equals(bundle) || "pin-count-probe".equals(bundle));
        File probe = new File(app.getFilesDir(), bundle);
        copy(InstrumentationRegistry.getInstrumentation().getContext().getAssets(), bundle, probe);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            for (int second = 0; second < 300; second++) {
                if (scenario.getState() == Lifecycle.State.DESTROYED) break;
                scenario.onActivity(activity -> {
                    if (!probe.getAbsolutePath().equals(activity.getBridge().getServerBasePath())) {
                        activity.getBridge().setServerBasePath(probe.getAbsolutePath());
                    }
                });
                Thread.sleep(1000);
            }
        }
    }

    private static void copy(AssetManager assets, String path, File target) throws Exception {
        String[] children = assets.list(path);
        if (children != null && children.length > 0) {
            if (!target.exists() && !target.mkdirs()) throw new IOException("cannot create " + target);
            for (String child : children) copy(assets, path + "/" + child, new File(target, child));
        } else {
            try (InputStream in = assets.open(path); FileOutputStream out = new FileOutputStream(target)) {
                byte[] bytes = new byte[8192];
                int count;
                while ((count = in.read(bytes)) != -1) out.write(bytes, 0, count);
            }
        }
    }

    private static void delete(File file) throws Exception {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) delete(child);
        Files.deleteIfExists(file.toPath());
    }
}
