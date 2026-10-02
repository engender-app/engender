package dev.engender.app.files;

import android.app.Activity;
import android.content.Intent;
import android.content.Context;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.UUID;

/** Manual exports use the system save picker instead of WebView downloads. */
@CapacitorPlugin(name = "FileDelivery")
public final class FileDeliveryPlugin extends Plugin {
    private static final String STAGING_FILE = "manual-export.pending";
    private StagedFile staged;
    private String transferId;
    private String fileName;
    private String type;
    private long byteLength;
    private String sha256;
    private boolean picking;

    @Override public void load() {
        try { wipe(getContext()); }
        catch (IOException error) { throw new IllegalStateException("export-staging-cleanup-failed", error); }
    }

    public static void wipe(Context context) throws IOException {
        File file = new File(context.getCacheDir(), STAGING_FILE);
        if (file.exists() && !file.delete()) throw new IOException("export-staging-cleanup-failed");
    }

    @PluginMethod public synchronized void beginFile(PluginCall call) {
        String name = call.getString("fileName");
        String mime = call.getString("type");
        if (staged != null) { call.reject("export-in-progress"); return; }
        if (name == null || name.isEmpty() || name.contains("/") || name.contains("\\") || name.indexOf('\0') >= 0) {
            call.reject("invalid-export-name"); return;
        }
        try {
            staged = StagedFile.encrypted(new File(getContext().getCacheDir(), STAGING_FILE));
            transferId = UUID.randomUUID().toString();
            fileName = name;
            type = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
            JSObject out = new JSObject();
            out.put("transferId", transferId);
            call.resolve(out);
        } catch (Exception error) { call.reject("export-staging-failed", error); }
    }

    @PluginMethod public synchronized void appendFile(PluginCall call) {
        try {
            requireTransfer(call);
            if (picking) throw new IllegalStateException("export-already-prepared");
            long offset = StagedFile.byteCount(call.getData().opt("offset"));
            String base64 = call.getString("base64");
            if (base64 == null || base64.length() > 2 * StagedFile.MAX_PIECE_BYTES) {
                throw new IllegalStateException("incomplete-file");
            }
            staged.append(offset, Base64.decode(base64, Base64.NO_WRAP));
            call.resolve();
        } catch (Exception error) { call.reject("export-transfer-failed", error); }
    }

    @PluginMethod public void finishFile(PluginCall call) {
        final StagedFile delivery;
        synchronized (this) {
            try { requireTransfer(call); }
            catch (Exception error) { call.reject("unknown-export-transfer", error); return; }
            if (picking) { call.reject("export-already-prepared"); return; }
            picking = true;
            delivery = staged;
        }
        try {
            long length = StagedFile.byteCount(call.getData().opt("byteLength"));
            String hash = call.getString("sha256");
            delivery.prepare(length, hash);
            synchronized (this) {
                if (staged != delivery || delivery.isClosed()) throw new IOException("export-aborted");
                byteLength = length;
                sha256 = hash;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(type);
                intent.putExtra(Intent.EXTRA_TITLE, fileName);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                startActivityForResult(call, intent, "savedFile");
            }
        } catch (Exception error) {
            synchronized (this) { if (staged == delivery) cleanup(); }
            call.reject("export-prepare-failed", error);
        }
    }

    @ActivityCallback private void savedFile(PluginCall call, ActivityResult result) {
        // Provider I/O and verification must not block the activity's UI thread.
        getBridge().execute(() -> complete(call, result));
    }

    private void complete(PluginCall call, ActivityResult result) {
        final StagedFile delivery;
        final long expectedLength;
        final String expectedHash;
        synchronized (this) {
            if (call == null) { cleanup(); return; }
            try { requireTransfer(call); }
            catch (Exception error) { call.reject("unknown-export-transfer", error); return; }
            delivery = staged; expectedLength = byteLength; expectedHash = sha256;
        }
        Uri uri = result == null || result.getData() == null ? null : result.getData().getData();
        if (result == null || result.getResultCode() != Activity.RESULT_OK || uri == null) {
            synchronized (this) { if (staged == delivery) cleanup(); }
            JSObject out = new JSObject(); out.put("saved", false); call.resolve(out);
            return;
        }
        try {
            try (InputStream input = delivery.openStream();
                 OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (output == null) throw new IllegalStateException("destination-unavailable");
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    if (delivery.isClosed()) throw new IOException("export-aborted");
                    output.write(buffer, 0, read);
                }
            }
            try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
                if (input == null) throw new IllegalStateException("destination-unavailable");
                StagedFile.verify(input, expectedLength, expectedHash);
            }
            synchronized (this) {
                if (staged != delivery || delivery.isClosed()) throw new IOException("export-aborted");
                cleanup();
                JSObject out = new JSObject(); out.put("saved", true); call.resolve(out);
            }
        } catch (Exception error) {
            try { DocumentsContract.deleteDocument(getContext().getContentResolver(), uri); }
            catch (Exception ignored) { /* Provider may refuse cleanup; delivery still fails. */ }
            synchronized (this) { if (staged == delivery) cleanup(); }
            call.reject("export-delivery-failed", error);
        }
    }

    @PluginMethod public synchronized void abortFile(PluginCall call) {
        if (transferId != null && transferId.equals(call.getString("transferId"))) cleanup();
        call.resolve();
    }

    private void requireTransfer(PluginCall call) {
        if (staged == null || transferId == null || !transferId.equals(call.getString("transferId"))) {
            throw new IllegalStateException("unknown-export-transfer");
        }
    }

    private void cleanup() {
        try { if (staged != null) staged.close(); }
        catch (Exception ignored) { /* The next export truncates an interrupted staging file. */ }
        staged = null; transferId = null; fileName = null; type = null; sha256 = null; picking = false;
    }

    @Override protected synchronized void handleOnDestroy() {
        cleanup();
        super.handleOnDestroy();
    }
}
