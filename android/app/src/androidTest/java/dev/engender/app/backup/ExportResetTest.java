package dev.engender.app.backup;

import static org.junit.Assert.*;
import androidx.test.core.app.ActivityScenario;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import dev.engender.app.MainActivity;
import dev.engender.app.webview.WebViewProbe;
import java.io.File;
import java.util.UUID;
import org.junit.Test;

public class ExportResetTest extends BackupDeliveryTestSupport {
    @Test public void resetDuringAttachmentReadAllowsAnotherBackupWithoutRestart() throws Exception {
        resetDuringTransfer(false, false);
    }

    @Test public void resetRequestedDuringDerivationAllowsAnotherBackupWithoutRestart() throws Exception {
        resetDuringTransfer(true, false);
    }

    @Test public void resetAbortsAScheduledReadThatNeverSettles() throws Exception {
        resetDuringTransfer(false, true);
    }

    private void resetDuringTransfer(boolean duringDerivation, boolean scheduler) throws Exception {
        File bundle = new File(app.getFilesDir(), "reset-backup-probe");
        copyAssets("auto-export-probe", bundle);
        new LongJournalBackupSupport().configure();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            final AutoExportPlugin[] original = new AutoExportPlugin[1];
            scenario.onActivity(activity -> {
                original[0] = (AutoExportPlugin) activity.getBridge().getPlugin("AutoExport").getInstance();
                activity.getBridge().setServerBasePath(bundle.getAbsolutePath());
            });
            WebViewProbe probe = new WebViewProbe(scenario, 30);
            probe.awaitTrue("!!window.backupProbe && window.backupProbe.ready");
            String page = probe.evaluate("window.backupProbe.pageId");
            probe.evaluate("window.backupProbe.resetDuringTransfer(" + duringDerivation + ", " + scheduler + ")");
            try {
                probe.awaitTrue("document.readyState === 'complete' && (!window.backupProbe || (window.backupProbe.ready && window.backupProbe.pageId !== " + page + "))");
            } catch (AssertionError failed) {
                throw new AssertionError(failed.getMessage() + "; state=" + probe.evaluate("JSON.stringify(window.backupProbe)"), failed);
            }
            scenario.onActivity(activity -> {
                AutoExportPlugin plugin = (AutoExportPlugin) activity.getBridge().getPlugin("AutoExport").getInstance();
                assertSame("reload must retain the native plugin", original[0], plugin);
                CapturedCall begin = new CapturedCall("beginBackup", new JSObject().put("fileName", "new-journal.ttbackup"));
                plugin.beginBackup(begin);
                assertNull("first backup after reset", begin.error);
                plugin.abortBackup(new CapturedCall("abortBackup", new JSObject().put("transferId", begin.result.getString("transferId"))));
            });
            new LongJournalBackupSupport().configure();
            String priorProbe = probe.evaluate("window.backupProbe ? window.backupProbe.pageId : null");
            scenario.onActivity(activity -> activity.getBridge().setServerBasePath(bundle.getAbsolutePath()));
            probe.awaitTrue("!!window.backupProbe && window.backupProbe.ready && window.backupProbe.pageId !== " + priorProbe);
            assertEquals("true", probe.evaluate("window.backupProbe.backUpNewJournal(); true"));
            try {
                probe.awaitTrue("window.backupProbe.newJournalStep === 'manual backup' || !!window.backupProbe.result");
                probe.awaitTrue("!!window.backupProbe.result");
                probe.awaitTrue("window.backupProbe.ready");
            }
            catch (AssertionError failed) {
                throw new AssertionError(failed.getMessage() + "; state=" + probe.evaluate("JSON.stringify(window.backupProbe)"), failed);
            }
            org.json.JSONObject result = new org.json.JSONObject(new org.json.JSONArray(
                "[" + probe.evaluate("JSON.stringify(window.backupProbe.result)") + "]").getString(0));
            assertFalse(result.toString(), result.has("error"));
            assertEquals(1, result.getInt("rows"));
            assertEquals("ok", result.getJSONObject("manual").getString("outcome"));
            assertEquals("staged", result.getJSONObject("scheduled").getString("outcome"));
            System.out.println("Reset backup proof (derivation=" + duringDerivation + ", scheduler=" + scheduler + "): " + result + "; native calls=" + probe.evaluate("JSON.stringify(window.backupProbe.nativeCallTimes)"));
            copyDocument(documents().get(0), new File(bundle, "new-manual.ttbackup"));
            org.json.JSONObject stage = new org.json.JSONObject(BackupWork.preferences(app).getString("encryptedStage", "{}"));
            java.nio.file.Files.copy(new File(PersistentBackup.directory(app), stage.getString("file")).toPath(),
                new File(bundle, "new-scheduled.ttbackup").toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        } finally {
            AutoExportPlugin.wipe(app);
        }
    }

    private static final class CapturedCall extends PluginCall {
        JSObject result;
        String error;
        CapturedCall(String method, JSObject data) { super(null, "AutoExport", UUID.randomUUID().toString(), method, data); }
        @Override public void resolve(JSObject value) { result = value; }
        @Override public void resolve() { result = new JSObject(); }
        @Override public void reject(String message, String code, Exception exception, JSObject data) { error = message; }
    }
}
