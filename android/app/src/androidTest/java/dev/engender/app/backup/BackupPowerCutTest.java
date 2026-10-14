package dev.engender.app.backup;

import static org.junit.Assert.assertTrue;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.system.Os;
import android.webkit.JavascriptInterface;
import androidx.documentfile.provider.DocumentFile;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.engender.app.MainActivity;
import java.io.File;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** Owns only synthetic fixtures; the host runner kills its disposable QEMU process. */
public class BackupPowerCutTest extends BackupDeliveryTestSupport {
    @Test public void powerCutHost() throws Exception {
        if (!"true".equals(InstrumentationRegistry.getArguments().getString("backupPowerCutHost"))) return;
        assertTrue("power cuts require an isolated package", app.getPackageName().startsWith("dev.engender.app.test."));
        File bundle = new File(app.getFilesDir(), "auto-export-probe");
        copyAssets("auto-export-probe", bundle);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            for (int second = 0; second < 600; second++) {
                scenario.onActivity(activity -> {
                    activity.getBridge().getWebView().addJavascriptInterface(new Control(bundle), "backupCutNative");
                    if (!bundle.getAbsolutePath().equals(activity.getBridge().getServerBasePath())) {
                        activity.getBridge().setServerBasePath(bundle.getAbsolutePath());
                    }
                });
                Thread.sleep(1000);
            }
        }
    }

    public final class Control {
        private final File bundle;
        Control(File bundle) { this.bundle = bundle; }

        @JavascriptInterface public String status() throws Exception {
            synchronized (BackupWork.OWNER) {
                android.content.SharedPreferences prefs = BackupWork.preferences(app);
                JSONArray owned = new JSONArray(prefs.getString("verifiedBackups", "[]"));
                JSONArray documents = new JSONArray();
                String destination = prefs.getString("destinationUri", null);
                if (destination != null) {
                    DocumentFile folder = DocumentFile.fromTreeUri(app, Uri.parse(destination));
                    if (folder != null) for (DocumentFile file : folder.listFiles()) {
                        documents.put(new JSONObject().put("uri", file.getUri()).put("name", file.getName()).put("size", file.length()));
                    }
                }
                return new JSONObject().put("verified", owned).put("documents", documents)
                    .put("destinationUri", destination).put("lastSuccessAt", prefs.getLong("lastSuccessAt", 0))
                    .put("stage", prefs.getString("encryptedStage", null)).put("failure", prefs.getString("lastFailureReason", null)).toString();
            }
        }

        @JavascriptInterface public String armWorker(long delayMs) throws Exception {
            assertTrue("only short synthetic scheduler delays are supported", delayMs >= 0 && delayMs <= 10000);
            synchronized (BackupWork.OWNER) {
                android.content.SharedPreferences prefs = BackupWork.preferences(app);
                JSONObject stage = new JSONObject(prefs.getString("encryptedStage", "{}"));
                long prior = System.currentTimeMillis() - 7 * BackupWork.DAY + delayMs;
                assertTrue(prefs.edit().putLong("lastSuccessAt", prior).remove("lastFailureAt").remove("lastFailureReason").commit());
                stage.put("due", BackupWork.due(prefs));
                assertTrue(prefs.edit().putString("encryptedStage", stage.toString()).commit());
                BackupWork.schedule(app);
                return stage.toString();
            }
        }

        @JavascriptInterface public long copyVerified(String value) throws Exception {
            synchronized (BackupWork.OWNER) {
                JSONArray owned = new JSONArray(BackupWork.preferences(app).getString("verifiedBackups", "[]"));
                boolean recorded = false;
                for (int i = 0; i < owned.length(); i++) if (value.equals(owned.getString(i))) recorded = true;
                assertTrue("restore proof can read only a recorded synthetic backup", recorded);
                File target = new File(bundle, "delivered.ttbackup");
                copyDocument(Uri.parse(value), target);
                return target.length();
            }
        }

        @JavascriptInterface public String measureDirectorySync() throws Exception {
            String destination = BackupWork.preferences(app).getString("destinationUri", null);
            DocumentFile folder = DocumentFile.fromTreeUri(app, Uri.parse(destination));
            try (ParcelFileDescriptor descriptor = resolver.openFileDescriptor(folder.getUri(), "r")) {
                int mode = Os.fstat(descriptor.getFileDescriptor()).st_mode;
                Os.fsync(descriptor.getFileDescriptor());
                return new JSONObject().put("mode", mode).put("synced", true).toString();
            }
        }
    }
}
