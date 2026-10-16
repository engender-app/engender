package dev.engender.app.ocr;

import static org.junit.Assert.*;
import android.content.res.AssetManager;
import android.provider.Settings;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.engender.app.MainActivity;
import dev.engender.app.webview.WebViewProbe;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Real production OCR against assets copied unchanged from the installed APK. */
@RunWith(AndroidJUnit4.class)
public class OcrOfflineRecognitionTest {
    @Test public void freshEnglishAndPolishScansWorkInAirplaneMode() throws Exception {
        android.content.Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("use an isolated synthetic package", app.getPackageName().startsWith("dev.engender.app.test."));
        assertEquals("enable airplane mode before first launch", 1,
            Settings.Global.getInt(app.getContentResolver(), Settings.Global.AIRPLANE_MODE_ON, 0));
        File bundle = new File(app.getFilesDir(), "ocr-probe");
        copy(InstrumentationRegistry.getInstrumentation().getContext().getAssets(), "ocr-probe", bundle);
        copy(app.getAssets(), "public/tesseract", new File(bundle, "tesseract"));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.getBridge().setServerBasePath(bundle.getAbsolutePath()));
            WebViewProbe probe = new WebViewProbe(scenario, 180);
            probe.awaitTrue("window.ocrProbe && window.ocrProbe.ready");
            probe.evaluate("window.ocrProbe.run()");
            probe.awaitTrue("window.ocrProbe.ready");
            String encoded = probe.evaluate("JSON.stringify(window.ocrProbe.result)");
            JSONObject result = new JSONObject(new JSONArray("[" + encoded + "]").getString(0));
            assertTrue(result.toString(), result.getBoolean("passed"));
            assertTrue(result.getBoolean("lazy"));
            assertEquals(2, result.getJSONArray("scans").length());
            System.out.println("Offline OCR evidence: " + result);
        } finally { delete(bundle); }
    }

    private void copy(AssetManager assets, String path, File target) throws Exception {
        String[] children = assets.list(path);
        if (children.length > 0) {
            assertTrue(target.mkdirs() || target.isDirectory());
            for (String child : children) copy(assets, path + "/" + child, new File(target, child));
        } else {
            try (InputStream input = assets.open(path); FileOutputStream output = new FileOutputStream(target)) {
                byte[] buffer = new byte[8192]; int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            }
        }
    }
    private void delete(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) delete(child);
        assertTrue(file.delete() || !file.exists());
    }
}
