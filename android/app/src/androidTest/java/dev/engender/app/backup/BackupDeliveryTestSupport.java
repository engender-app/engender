package dev.engender.app.backup;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.engender.app.webview.WebViewProbe;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.runner.RunWith;

/** SAF and WebView fixtures without inheriting another class's test methods. */
@RunWith(AndroidJUnit4.class)
abstract class BackupDeliveryTestSupport {
    protected final Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
    protected final Uri tree = DocumentsContract.buildTreeDocumentUri(BackupDocumentsProvider.AUTHORITY, "root");
    protected final ContentResolver resolver = app.getContentResolver();

    protected JSONObject command(WebViewProbe probe, String expression) throws Exception {
        probe.evaluate("window.backupProbe." + expression);
        probe.awaitTrue("window.backupProbe.ready");
        String raw = probe.evaluate("JSON.stringify(window.backupProbe.result)");
        return new JSONObject(new JSONArray("[" + raw + "]").getString(0));
    }

    protected List<Uri> documents() throws Exception {
        List<Uri> found = new ArrayList<>();
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, "root");
        try (Cursor cursor = resolver.query(children, new String[] {DocumentsContract.Document.COLUMN_DOCUMENT_ID}, null, null, null)) {
            while (cursor.moveToNext()) found.add(DocumentsContract.buildDocumentUriUsingTree(tree, cursor.getString(0)));
        }
        return found;
    }

    protected byte[] hash(Uri uri) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = resolver.openInputStream(uri)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        return digest.digest();
    }

    protected void copyDocument(Uri uri, File target) throws Exception {
        try (InputStream input = resolver.openInputStream(uri); FileOutputStream output = new FileOutputStream(target)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
        }
    }

    protected void copyAssets(String path, File target) throws Exception {
        android.content.res.AssetManager assets = InstrumentationRegistry.getInstrumentation().getContext().getAssets();
        String[] children = assets.list(path);
        if (children.length > 0) {
            target.mkdirs();
            for (String child : children) copyAssets(path + "/" + child, new File(target, child));
        } else {
            try (InputStream input = assets.open(path); FileOutputStream output = new FileOutputStream(target)) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            }
        }
    }
}
