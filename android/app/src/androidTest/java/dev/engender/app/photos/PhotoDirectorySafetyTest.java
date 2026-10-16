package dev.engender.app.photos;

import static org.junit.Assert.*;
import android.content.Context;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import dev.engender.app.webview.WebViewProbe;
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
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebViewProbe page = new WebViewProbe(scenario, 10);
            for (String name : new String[] {".", "arbitrary", "../photos"}) {
                for (String method : new String[] {"directoryPath", "removeDirectory"}) {
                    JSONObject answer = page.awaitCall(page.startCall("Photos", method, new JSONObject().put("directory", name)));
                    assertEquals("accepted " + method + " " + name + ": " + answer, "rejected", answer.getString("state"));
                }
            }
        }
        if (original != null) assertArrayEquals(original, java.nio.file.Files.readAllBytes(protectedFile.toPath()));
    }

    @Test public void listingKeepsPrivacyMarkerOutOfOrphanCandidates() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebViewProbe page = new WebViewProbe(scenario, 10);
            JSONObject arguments = new JSONObject().put("directory", "initialization-test-photos");
            JSONObject path = page.awaitCall(page.startCall("Photos", "directoryPath", arguments));
            assertEquals(path.toString(), "resolved", path.getString("state"));
            File directory = new File(path.getJSONObject("result").getString("path"));
            File photo = new File(directory, "orphan.jpg");
            assertTrue(photo.createNewFile() || photo.exists());
            try {
                JSONObject answer = page.awaitCall(page.startCall("Photos", "listFiles", arguments));
                assertEquals(answer.toString(), "resolved", answer.getString("state"));
                assertEquals("[\"orphan.jpg\"]", answer.getJSONObject("result").getJSONArray("names").toString());
                assertTrue(new File(directory, ".nomedia").isFile());
            } finally {
                JSONObject removed = page.awaitCall(page.startCall("Photos", "removeDirectory", arguments));
                assertEquals(removed.toString(), "resolved", removed.getString("state"));
            }
        }
    }
}
