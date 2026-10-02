package dev.engender.app.photos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

@RunWith(AndroidJUnit4.class)
public class PhotoDirectoryInitializationTest {
    private static final String DIRECTORY = "initialization-test-photos";
    private static final int WORKERS = 8;
    private static final int ROUNDS = 100;

    private static Context context() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    private static File directory() {
        return new File(context().getFilesDir(), DIRECTORY);
    }

    @After
    public void clear() throws Exception {
        if (directory().isDirectory()) directory().setWritable(true, false);
        PhotoFiles.deleteDirectory(context(), DIRECTORY);
    }

    @Test
    public void eightWorkersCanInitializeAFreshDirectory() throws Exception {
        initializeConcurrently(false);
    }

    @Test
    public void eightWorkersCanCreateAMissingPrivacyMarker() throws Exception {
        initializeConcurrently(true);
    }

    @Test
    public void aDirectoryBlockingThePrivacyMarkerIsRefused() throws Exception {
        assertTrue(directory().mkdir());
        File marker = new File(directory(), ".nomedia");
        assertTrue(marker.mkdir());

        try {
            PhotoFiles.directory(context(), DIRECTORY);
            fail("a directory was accepted as the privacy marker");
        } catch (IllegalStateException e) {
            assertTrue("failure must identify the blocked marker", e.getMessage().contains(marker.getAbsolutePath()));
        }
    }

    @Test
    public void aFileBlockingThePhotoDirectoryIsRefused() throws Exception {
        assertTrue(directory().createNewFile());

        try {
            PhotoFiles.directory(context(), DIRECTORY);
            fail("a file was accepted as the photo directory");
        } catch (IllegalStateException e) {
            assertTrue("failure must identify the blocked path", e.getMessage().contains(directory().getAbsolutePath()));
        }
    }

    @Test
    public void anUnwritableDirectoryDoesNotSkipThePrivacyMarker() throws Exception {
        assertTrue(directory().mkdir());
        assertTrue(directory().setWritable(false, false));
        assertFalse("fixture directory is still writable", directory().canWrite());

        try {
            PhotoFiles.directory(context(), DIRECTORY);
            fail("initialization succeeded without creating the privacy marker");
        } catch (IllegalStateException e) {
            assertTrue("failure must identify the marker", e.getMessage().contains(".nomedia"));
            assertTrue("filesystem failure must retain its cause", e.getCause() instanceof java.io.IOException);
            assertFalse(new File(directory(), ".nomedia").exists());
        }
    }

    private void initializeConcurrently(boolean existingDirectory) throws Exception {
        ExecutorService workers = Executors.newFixedThreadPool(WORKERS);
        List<String> failures = new ArrayList<>();
        try {
            for (int round = 0; round < ROUNDS; round++) {
                PhotoFiles.deleteDirectory(context(), DIRECTORY);
                if (existingDirectory) assertTrue(directory().mkdir());
                CountDownLatch ready = new CountDownLatch(WORKERS);
                CountDownLatch start = new CountDownLatch(1);
                List<Future<String>> results = new ArrayList<>();
                for (int worker = 0; worker < WORKERS; worker++) {
                    results.add(workers.submit(() -> {
                        ready.countDown();
                        if (!start.await(10, TimeUnit.SECONDS)) return "workers never started";
                        try {
                            assertEquals(directory(), PhotoFiles.directory(context(), DIRECTORY));
                            return null;
                        } catch (IllegalStateException e) {
                            return e.getMessage();
                        }
                    }));
                }
                try {
                    assertTrue("workers did not reach the start", ready.await(10, TimeUnit.SECONDS));
                } finally {
                    start.countDown();
                }
                for (Future<String> result : results) {
                    String error = result.get(10, TimeUnit.SECONDS);
                    if (error != null) failures.add(error);
                }
                assertTrue("photo directory is missing", directory().isDirectory());
                assertTrue("privacy marker is missing", new File(directory(), ".nomedia").isFile());
            }
        } finally {
            workers.shutdownNow();
            assertTrue("workers did not stop", workers.awaitTermination(10, TimeUnit.SECONDS));
        }
        assertTrue(failures.size() + " of " + (ROUNDS * WORKERS)
            + " initializations failed: " + (failures.isEmpty() ? "" : failures.get(0)), failures.isEmpty());
    }
}
