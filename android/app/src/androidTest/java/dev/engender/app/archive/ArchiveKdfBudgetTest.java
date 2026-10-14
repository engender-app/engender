package dev.engender.app.archive;

import static org.junit.Assert.*;
import android.content.res.AssetManager;
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

/** Measures admitted Archive headers through the production WebView derivation. */
@RunWith(AndroidJUnit4.class)
public class ArchiveKdfBudgetTest {
    @Test public void largestAcceptedHeaderStaysWithinThePhoneBudget() throws Exception {
        android.content.Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("use an isolated synthetic package", app.getPackageName().startsWith("dev.engender.app.test."));
        File bundle = new File(app.getFilesDir(), "kdf-budget-probe");
        copy(InstrumentationRegistry.getInstrumentation().getContext().getAssets(), "kdf-budget-probe", bundle);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.getBridge().setServerBasePath(bundle.getAbsolutePath()));
            WebViewProbe probe = new WebViewProbe(scenario, 60);
            probe.awaitTrue("window.archiveKdfProbe && window.archiveKdfProbe.ready");
            probe.evaluate("window.archiveKdfProbe.run()");
            probe.awaitTrue("window.archiveKdfProbe.ready");
            String encoded = probe.evaluate("JSON.stringify(window.archiveKdfProbe.result)");
            JSONObject result = new JSONObject(new JSONArray("[" + encoded + "]").getString(0));
            android.os.Bundle evidence = new android.os.Bundle();
            evidence.putString("stream", "\nArchive KDF budget evidence: " + result + "\n");
            InstrumentationRegistry.getInstrumentation().sendStatus(2, evidence);
            assertTrue(result.toString(), result.getBoolean("passed"));
            assertEquals(10, result.getJSONArray("samples").length());
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
