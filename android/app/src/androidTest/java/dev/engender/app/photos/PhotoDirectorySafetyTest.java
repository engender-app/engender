package dev.engender.app.photos;

import static org.junit.Assert.*;
import android.content.Context;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import dev.engender.app.MainActivity;
import java.io.File;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class PhotoDirectorySafetyTest {
    @Test public void refusesRootAndUnlistedDirectoriesWithoutTouchingFiles() throws Exception {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File protectedFile = new File(app.getFilesDir(), "journal-key.wrapped");
        byte[] original = protectedFile.exists() ? java.nio.file.Files.readAllBytes(protectedFile.toPath()) : null;
        for (String name : new String[] {".", "arbitrary", "../photos"}) {
            try { PhotoFiles.directory(app, name); fail("accepted " + name); }
            catch (IllegalArgumentException expected) { }
            try { PhotoFiles.deleteDirectory(app, name); fail("deleted " + name); }
            catch (IllegalArgumentException expected) { }
        }
        if (original != null) assertArrayEquals(original, java.nio.file.Files.readAllBytes(protectedFile.toPath()));
    }

    @Test public void listingKeepsPrivacyMarkerOutOfOrphanCandidates() throws Exception {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File directory = PhotoFiles.directory(app, "initialization-test-photos");
        File photo = new File(directory, "orphan.jpg");
        photo.createNewFile();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                PhotosPlugin plugin = (PhotosPlugin) activity.getBridge().getPlugin("Photos").getInstance();
                PluginCall call = new PluginCall(null, "Photos", "list-proof", "listFiles",
                    new JSObject().put("directory", "initialization-test-photos")) {
                    @Override public void resolve(JSObject result) {
                        assertEquals("[\"orphan.jpg\"]", result.optJSONArray("names").toString());
                    }
                };
                plugin.listFiles(call);
            });
            assertTrue(new File(directory, ".nomedia").isFile());
        } finally { PhotoFiles.deleteDirectory(app, "initialization-test-photos"); }
    }
}
