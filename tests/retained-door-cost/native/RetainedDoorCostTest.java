package dev.engender.app.longjournal;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import android.content.Context;
import android.content.res.AssetManager;
import android.view.WindowManager;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.engender.app.MainActivity;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Native save/revisit research, restricted to a disposable package. */
@RunWith(AndroidJUnit4.class)
public class RetainedDoorCostTest {
    @Test public void measureRetainedDoors() throws Exception {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("retained door probe requires its isolated package",
            app.getPackageName().equals("dev.engender.app.test.retained81"));
        File target = new File(app.getFilesDir(), "retained-door-cost-probe");
        deleteRecursively(target);
        app.deleteDatabase("retained-door-cost.sqlite3");
        deleteRecursively(new File(app.getFilesDir(), "long-journal-photos"));
        AssetManager assets = InstrumentationRegistry.getInstrumentation().getContext().getAssets();
        copyAssetDirectory(assets, "retained-door-cost-probe", target);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                activity.getBridge().setServerBasePath(target.getAbsolutePath());
            });
            long deadline = System.nanoTime() + TimeUnit.MINUTES.toNanos(60);
            String raw = null;
            while (System.nanoTime() < deadline) {
                AtomicReference<String> answer = new AtomicReference<>();
                CountDownLatch evaluated = new CountDownLatch(1);
                scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(
                    "JSON.stringify(window.__retainedDoorResult || null)", value -> {
                        answer.set(value); evaluated.countDown();
                    }));
                assertTrue("WebView stopped answering", evaluated.await(30, TimeUnit.SECONDS));
                raw = unquote(answer.get());
                if (raw != null && !raw.equals("null")) break;
                Thread.sleep(500);
            }
            assertTrue("retained door probe did not finish", raw != null && !raw.equals("null"));
            JSONObject result = new JSONObject(raw);
            java.nio.file.Files.write(new File(app.getFilesDir(), "retained-door-cost-result.json").toPath(),
                raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            assertFalse("retained door probe failed: " + raw, result.has("error"));
            assertTrue("twelve timing and trace samples required", result.getJSONArray("samples").length() == 12);
        } finally {
            deleteRecursively(target);
            app.deleteDatabase("retained-door-cost.sqlite3");
            deleteRecursively(new File(app.getFilesDir(), "long-journal-photos"));
        }
    }

    private static String unquote(String evaluated) {
        if (evaluated == null || evaluated.equals("null") || evaluated.equals("\"\"")) return null;
        try {
            return new JSONArray("[" + evaluated + "]").getString(0);
        } catch (Exception e) {
            return null;
        }
    }

    private static void copyAssetDirectory(AssetManager assets, String path, File target) throws IOException {
        String[] children = assets.list(path);
        if (children == null || children.length == 0) {
            copyAssetFile(assets, path, target);
            return;
        }
        if (!target.exists() && !target.mkdirs()) throw new IOException("could not create " + target);
        for (String child : children) {
            copyAssetDirectory(assets, path + "/" + child, new File(target, child));
        }
    }

    private static void copyAssetFile(AssetManager assets, String path, File target) throws IOException {
        File parent = target.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IOException("could not create " + parent);
        }
        try (InputStream in = assets.open(path);
             OutputStream out = new FileOutputStream(target)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
        }
    }

    private static void deleteRecursively(File file) {
        if (file == null) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteRecursively(child);
        file.delete();
    }
}
