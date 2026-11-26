package dev.engender.app.files;

import android.app.Activity;
import android.content.Intent;
import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
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
    private static final java.util.concurrent.atomic.AtomicLong resetEpoch = new java.util.concurrent.atomic.AtomicLong();
    private static final String processId = UUID.randomUUID().toString();
    private static RetainedPicker retainedPicker;
    private long pendingResetEpoch;
    private String pendingProcessId = processId;
    private String restoredTransferId;
    private long pickerResetEpoch;
    private String pickerProcessId;
    private IOException recoveryError;
    private boolean completing;
    private boolean callbackHandled;
    private StagedFile staged;
    private String transferId;
    private String fileName;
    private String type;
    private long byteLength;
    private String sha256;
    private boolean picking;
    private boolean recordBackup;

    @Override public void load() {
        synchronized (FileDeliveryPlugin.class) {
            try {
                if (retainedPicker == null) {
                    resetTransfers();
                    removeOrphanStaging(getContext(), null);
                    getBridge().execute(() -> {
                        try { ManualExportCleanup.recover(getContext()); }
                        catch (IOException error) { recoveryError = error; }
                    });
                } else {
                    removeOrphanStaging(getContext(), retainedPicker.staged.file);
                }
            } catch (IOException error) { throw new IllegalStateException("export-staging-cleanup-failed", error); }
        }
    }

    public static void wipe(Context context) throws IOException {
        resetTransfers();
        removeOrphanStaging(context, null);
        ManualExportCleanup.reset(context);
    }

    private static void removeOrphanStaging(Context context, File retained) throws IOException {
        File[] files = context.getCacheDir().listFiles((directory, name) ->
            name.equals(STAGING_FILE) || name.matches("manual-export-[a-f0-9-]{36}\\.pending"));
        if (files != null) for (File file : files) {
            if (file.equals(retained)) continue;
            if (!file.delete()) throw new IOException("export-staging-cleanup-failed");
        }
    }

    static File stagingFile(File cache, String id) { return new File(cache, "manual-export-" + id + ".pending"); }

    @PluginMethod public synchronized void beginFile(PluginCall call) {
        String name = call.getString("fileName");
        String mime = call.getString("type");
        discardStaleFile();
        if (staged != null) { call.reject("export-in-progress"); return; }
        if (name == null || name.isEmpty() || name.contains("/") || name.contains("\\") || name.indexOf('\0') >= 0) {
            call.reject("invalid-export-name"); return;
        }
        try {
            pendingResetEpoch = resetEpoch.get();
            pendingProcessId = processId;
            completing = false;
            transferId = UUID.randomUUID().toString();
            staged = StagedFile.encrypted(stagingFile(getContext().getCacheDir(), transferId));
            fileName = name;
            recordBackup = Boolean.TRUE.equals(call.getBoolean("recordBackup", false));
            type = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
            JSObject out = new JSObject();
            out.put("transferId", transferId);
            call.resolve(out);
        } catch (Exception error) { call.reject("export-staging-failed", StorageFailure.code(error, StorageFailure.DEVICE_FULL), error); }
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
        } catch (Exception error) { call.reject("export-transfer-failed", StorageFailure.code(error, StorageFailure.DEVICE_FULL), error); }
    }

    @PluginMethod public void finishFile(PluginCall call) {
        final StagedFile delivery;
        synchronized (this) {
            try { requireTransfer(call); }
            catch (Exception error) { call.reject("unknown-export-transfer", error); return; }
            if (picking) { call.reject("export-already-prepared"); return; }
            if (restoredTransferId != null && !callbackHandled) { call.reject("export-in-progress"); return; }
            picking = true;
            delivery = staged;
        }
        try {
            long length = StagedFile.byteCount(call.getData().opt("byteLength"));
            String hash = call.getString("sha256");
            delivery.prepare(length, hash);
            synchronized (this) {
                if (staged != delivery || pendingResetEpoch != resetEpoch.get() || delivery.isClosed()) throw new IOException("export-aborted");
                byteLength = length;
                sha256 = hash;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(type);
                intent.putExtra(Intent.EXTRA_TITLE, fileName);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                ManualExportCleanup.picker(getContext(), transferId);
                restoredTransferId = transferId;
                pickerProcessId = pendingProcessId;
                pickerResetEpoch = pendingResetEpoch;
                callbackHandled = false;
                startActivityForResult(call, intent, "savedFile");
            }
        } catch (Exception error) {
            synchronized (this) {
                if (staged == delivery) {
                    try { ManualExportCleanup.pickerFinished(getContext(), transferId); }
                    catch (IOException cleanup) { error.addSuppressed(cleanup); }
                    callbackHandled = true;
                    cleanup();
                }
            }
            call.reject("export-prepare-failed", StorageFailure.code(error, StorageFailure.DEVICE_FULL), error);
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
        final String id;
        final JSObject identity;
        Uri returned = result == null || result.getData() == null ? null : result.getData().getData();
        // The handler is another app: only a document URI of a content provider
        // is ever opened, recorded or deleted under (DocumentUris).
        final boolean refused = returned != null && !DocumentUris.isDocument(returned.toString());
        Uri uri = refused ? null : returned;
        synchronized (this) {
            // A callback with no transfer identity cannot release another owner.
            if (call == null || callbackHandled) return;
            id = call.getString("transferId");
            identity = resultIdentity(id);
            try { requireTransfer(call); }
            catch (Exception error) {
                // Restored picker identity proves ownership even when process death lost the key.
                if (id != null && id.equals(restoredTransferId)) {
                    callbackHandled = true;
                    if (uri != null) {
                        try { ManualExportCleanup.destination(getContext(), id, uri); }
                        catch (IOException record) { error.addSuppressed(record); }
                        ManualExportCleanup.failed(getContext(), id, uri);
                    }
                    try { ManualExportCleanup.pickerFinished(getContext(), id); }
                    catch (IOException cleanup) { error.addSuppressed(cleanup); }
                }
                call.reject("unknown-export-transfer", error, identity);
                return;
            }
            callbackHandled = true;
            completing = true;
            delivery = staged; expectedLength = byteLength; expectedHash = sha256;
            synchronized (FileDeliveryPlugin.class) {
                if (retainedPicker != null && retainedPicker.staged == delivery) retainedPicker = null;
            }
        }
        if (result == null || result.getResultCode() != Activity.RESULT_OK || uri == null) {
            try {
                if (uri != null) {
                    ManualExportCleanup.destination(getContext(), id, uri);
                    if (!ManualExportCleanup.failed(getContext(), id, uri)) throw new IOException("export-cleanup-pending");
                }
                ManualExportCleanup.pickerFinished(getContext(), id);
                if (refused) throw new IOException("invalid-destination");
                call.resolve(identity.put("saved", false));
            } catch (Exception error) { call.reject("export-delivery-failed", error, identity); }
            finally { synchronized (this) { if (staged == delivery) cleanup(); } }
            return;
        }
        try {
            ManualExportCleanup.destination(getContext(), id, uri);
            ParcelFileDescriptor destination = getContext().getContentResolver().openFileDescriptor(uri, "wt");
            if (destination == null) throw new IllegalStateException("destination-unavailable");
            try (OutputStream output = new ParcelFileDescriptor.AutoCloseOutputStream(destination);
                 InputStream input = delivery.openStream()) {
                /* The preflight (last-audit ui 37): refused only when one of
                   Android's on-device providers handed over a file whose own
                   volume measured short. Any other provider, a cloud drive
                   included, goes straight to the write, whose ENOSPC is
                   still caught below. */
                Long available = StorageFailure.isLocalProvider(uri.getAuthority())
                    ? StorageFailure.availableBytes(destination)
                    : null;
                if (StorageFailure.refuses(available, expectedLength)) {
                    throw new StorageFailure.DestinationFull(expectedLength, available);
                }
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    if (pendingResetEpoch != resetEpoch.get() || delivery.isClosed()) throw new IOException("export-aborted");
                    output.write(buffer, 0, read);
                }
            }
            try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
                if (input == null) throw new IllegalStateException("destination-unavailable");
                StagedFile.verify(input, expectedLength, expectedHash);
            }
            synchronized (this) {
                if (staged != delivery || pendingResetEpoch != resetEpoch.get() || delivery.isClosed()) throw new IOException("export-aborted");
                ManualExportCleanup.delivered(getContext(), id);
                JSObject out = identity.put("saved", true).put("recordBackup", recordBackup).put("savedAt", System.currentTimeMillis());
                cleanup();
                call.resolve(out);
            }
        } catch (Exception error) {
            ManualExportCleanup.failed(getContext(), id, uri);
            try { ManualExportCleanup.pickerFinished(getContext(), id); }
            catch (IOException cleanup) { error.addSuppressed(cleanup); }
            synchronized (this) { if (staged == delivery) cleanup(); }
            call.reject("export-delivery-failed", StorageFailure.code(error, StorageFailure.DESTINATION_FULL), error, identity);
        }
    }

    @PluginMethod public synchronized void abortFile(PluginCall call) {
        if (transferId != null && transferId.equals(call.getString("transferId"))) cleanup();
        call.resolve();
    }

    static synchronized void resetTransfers() {
        resetEpoch.incrementAndGet();
        if (retainedPicker != null) {
            try { retainedPicker.staged.close(); }
            catch (IOException ignored) { /* wipe also removes the owned cache file. */ }
            retainedPicker = null;
        }
    }

    void discardStaleFile() {
        if (staged != null && pendingResetEpoch != resetEpoch.get()) cleanup();
    }

    @PluginMethod public synchronized void abortPendingTransfers(PluginCall call) {
        resetTransfers();
        cleanup();
        try { ManualExportCleanup.reset(getContext()); call.resolve(); }
        catch (IOException error) { call.reject("export-cleanup-record-failed", error); }
    }

    @PluginMethod public void recoveryStatus(PluginCall call) {
        try {
            if (recoveryError != null) throw recoveryError;
            call.resolve(new JSObject().put("processId", processId).put("resetEpoch", resetEpoch.get())
                .put("interrupted", ManualExportCleanup.consumeInterrupted(getContext()))
                .put("cleanupPending", ManualExportCleanup.pending(getContext())));
        } catch (IOException error) { call.reject("export-cleanup-record-failed", error); }
    }

    private JSObject resultIdentity(String id) {
        return new JSObject().put("transferId", id).put("processId", pickerProcessId).put("resetEpoch", pickerResetEpoch);
    }

    private void requireTransfer(PluginCall call) {
        if (pendingResetEpoch != resetEpoch.get() || staged == null || transferId == null || !transferId.equals(call.getString("transferId"))) {
            throw new IllegalStateException("unknown-export-transfer");
        }
    }

    private void cleanup() {
        try { if (staged != null) staged.close(); }
        catch (Exception ignored) { /* The next export truncates an interrupted staging file. */ }
        staged = null; transferId = null; fileName = null; type = null; sha256 = null; picking = false;
    }

    @Override protected synchronized Bundle saveInstanceState() {
        Bundle state = super.saveInstanceState();
        if (state != null && staged != null && picking && !completing && pendingResetEpoch == resetEpoch.get()) {
            synchronized (FileDeliveryPlugin.class) { retainedPicker = new RetainedPicker(this); }
            state.putString("transferId", transferId);
            state.putString("processId", pendingProcessId);
            state.putLong("resetEpoch", pendingResetEpoch);
        }
        return state;
    }

    @Override protected synchronized void restoreState(Bundle state) {
        restoredTransferId = state.getString("transferId");
        pendingProcessId = state.getString("processId");
        pendingResetEpoch = state.getLong("resetEpoch", -1);
        pickerProcessId = pendingProcessId;
        pickerResetEpoch = pendingResetEpoch;
        synchronized (FileDeliveryPlugin.class) {
            RetainedPicker owner = retainedPicker;
            if (owner == null || !owner.id.equals(restoredTransferId) || owner.epoch != resetEpoch.get()) return;
            staged = owner.staged; transferId = owner.id; byteLength = owner.length; sha256 = owner.hash;
            picking = true;
            recordBackup = owner.recordBackup;
            retainedPicker = null;
        }
    }

    @Override protected synchronized void handleOnDestroy() {
        synchronized (FileDeliveryPlugin.class) {
            if (retainedPicker != null && retainedPicker.staged == staged && !completing) {
                // Only the bytes and their in-memory key survive, never the activity or bridge.
                staged = null;
            }
        }
        cleanup();
        super.handleOnDestroy();
    }

    private static final class RetainedPicker {
        final StagedFile staged;
        final String id;
        final long epoch;
        final long length;
        final String hash;
        final boolean recordBackup;
        RetainedPicker(FileDeliveryPlugin owner) {
            staged = owner.staged; id = owner.transferId; epoch = owner.pendingResetEpoch;
            length = owner.byteLength; hash = owner.sha256; recordBackup = owner.recordBackup;
        }
    }
}
