package dev.barankiewicz.genderdiary.backup;

import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

import org.bouncycastle.crypto.generators.Argon2BytesGenerator;
import org.bouncycastle.crypto.params.Argon2Parameters;

/**
 * Android side of scheduled encrypted backup destination management
 * (ticket 16): a SAF tree the person picks, verified writes into it,
 * and the wrapped backup password the schedule reuses.
 */
@CapacitorPlugin(name = "AutoExport")
public class AutoExportPlugin extends Plugin {
    private static final int DAY_MS = 24 * 60 * 60 * 1000;

    /** Named rather than private because the reset has to prove it cleared
        this file and deleted that alias (phase 5 security ticket 01), and a
        test that spelled either out itself would pass while the app moved. */
    public static final String PREFS = "gender-diary-auto-export";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_SCHEDULE = "schedule";
    private static final String KEY_DESTINATION_URI = "destinationUri";
    private static final String KEY_DESTINATION_LABEL = "destinationLabel";
    private static final String KEY_PASSWORD_NONCE = "passwordNonce";
    private static final String KEY_PASSWORD_CIPHERTEXT = "passwordCiphertext";
    private static final String KEY_LAST_SUCCESS_AT = "lastSuccessAt";
    private static final String KEY_LAST_FAILURE_AT = "lastFailureAt";
    private static final String KEY_LAST_FAILURE_REASON = "lastFailureReason";

    private static final String KEYSTORE = "AndroidKeyStore";
    public static final String PASSWORD_ALIAS = "gender-diary-auto-export-password";
    private static final String PASSWORD_CIPHER = "AES/GCM/NoPadding";

    private static final String FAILURE_CHANNEL = "backup_failures";
    /* Only reached when the JS side sends nothing, which it does not: the
       localized name and body come from messages/*.json (phase 6 ticket 04). */
    private static final String FAILURE_CHANNEL_FALLBACK_NAME = "Backups";
    private static final int FAILURE_NOTIFICATION_ID = 1601;

    /** The archive profile (ADR-0013), pinned here rather than read off the
        bridge call. A page that can reach {@code deriveKey} - it never
        should, but audit finding G-04 assumed it could - gets this cost or
        nothing: it cannot ask for a cheaper derivation to grind offline, or
        a larger one to crash the app. The salt stays a call argument
        because it is per-archive and random; the cost is not. */
    private static final int ARCHIVE_KDF_MEMORY_SIZE = 65536;
    private static final int ARCHIVE_KDF_ITERATIONS = 3;
    private static final int ARCHIVE_KDF_PARALLELISM = 1;
    private static final int ARCHIVE_KDF_HASH_LENGTH = 32;

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(statusObject());
    }

    @PluginMethod
    public void configure(PluginCall call) {
        Boolean enabledArg = call.getBoolean("enabled");
        String schedule = call.getString("schedule", "weekly");
        if (enabledArg == null) {
            call.reject("configure requires enabled");
            return;
        }
        if (!isSchedule(schedule)) {
            call.reject("invalid schedule");
            return;
        }

        boolean enabled = enabledArg && destinationUri() != null;
        preferences().edit().putBoolean(KEY_ENABLED, enabled).putString(KEY_SCHEDULE, schedule).apply();
        call.resolve(statusObject());
    }

    @PluginMethod
    public void setPassword(PluginCall call) {
        String password = call.getString("password");
        if (password == null || password.isEmpty()) {
            call.reject("setPassword requires password");
            return;
        }
        try {
            passwordStore().write(password);
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    /**
     * Derives an archive encryption key from the saved backup password,
     * without ever exposing the password to the WebView (phase 5 security
     * ticket 06, F-04).
     *
     * <p>Argon2id derivation runs native behind the bridge. The scheduler
     * sends a fresh random salt, and receives a single derived key that
     * opens only the archive about to be written. The password remains in
     * Keystore-wrapped storage and never crosses into JavaScript.
     *
     * <p>The derivation cost is not read off the call (G-04): it is the
     * archive profile pinned in {@link #deriveArchiveKey}, regardless of
     * what the caller asks for.
     */
    @PluginMethod
    public void deriveKey(PluginCall call) {
        String saltBase64 = call.getString("salt");
        if (saltBase64 == null || saltBase64.isEmpty()) {
            call.reject("deriveKey requires salt");
            return;
        }

        try {
            String password = passwordStore().read();
            if (password == null) {
                JSObject out = new JSObject();
                out.put("key", JSObject.NULL);
                call.resolve(out);
                return;
            }

            byte[] salt = Base64.decode(saltBase64, Base64.DEFAULT);
            byte[] derived = deriveArchiveKey(password, salt);

            JSObject out = new JSObject();
            out.put("key", Base64.encodeToString(derived, Base64.NO_WRAP));
            call.resolve(out);
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    /** {@code deriveKey}'s derivation, under the archive profile (ADR-0013)
        pinned above rather than taken as parameters - there is no argument
        list here for a caller's numbers to occupy. Only the salt, which is
        per-archive and random, still comes from outside. */
    public static byte[] deriveArchiveKey(String password, byte[] salt) {
        return deriveArgon2id(
            password, salt, ARCHIVE_KDF_MEMORY_SIZE, ARCHIVE_KDF_ITERATIONS, ARCHIVE_KDF_PARALLELISM, ARCHIVE_KDF_HASH_LENGTH);
    }

    public static byte[] deriveArgon2id(
        String password,
        byte[] salt,
        int memorySize,
        int iterations,
        int parallelism,
        int hashLength
    ) {
        Argon2Parameters params = new Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
            .withVersion(Argon2Parameters.ARGON2_VERSION_13)
            .withIterations(iterations)
            .withMemoryAsKB(memorySize)
            .withParallelism(parallelism)
            .withSalt(salt)
            .build();

        Argon2BytesGenerator generator = new Argon2BytesGenerator();
        generator.init(params);
        byte[] out = new byte[hashLength];
        generator.generateBytes(password.getBytes(StandardCharsets.UTF_8), out);
        return out;
    }

    @PluginMethod
    public void clearPassword(PluginCall call) {
        try {
            passwordStore().clear();
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @PluginMethod
    public void pickDestination(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "pickedDestination");
    }

    @ActivityCallback
    private void pickedDestination(PluginCall call, ActivityResult result) {
        JSObject out = new JSObject();
        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            out.put("picked", false);
            out.put("destinationUri", JSObject.NULL);
            out.put("destinationLabel", JSObject.NULL);
            call.resolve(out);
            return;
        }

        Uri uri = result.getData().getData();
        if (uri == null) {
            out.put("picked", false);
            out.put("destinationUri", JSObject.NULL);
            out.put("destinationLabel", JSObject.NULL);
            call.resolve(out);
            return;
        }

        try {
            int flags = result.getData().getFlags();
            int grants = flags & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            getContext().getContentResolver().takePersistableUriPermission(uri, grants);

            String label = destinationLabel(uri);
            preferences().edit()
                .putString(KEY_DESTINATION_URI, uri.toString())
                .putString(KEY_DESTINATION_LABEL, label)
                .remove(KEY_LAST_FAILURE_AT)
                .remove(KEY_LAST_FAILURE_REASON)
                .apply();

            out.put("picked", true);
            out.put("destinationUri", uri.toString());
            out.put("destinationLabel", label);
            call.resolve(out);
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @PluginMethod
    public void writeBackup(PluginCall call) {
        String fileName = call.getString("fileName");
        String base64 = call.getString("base64");
        if (fileName == null || base64 == null) {
            call.reject("writeBackup requires fileName and base64");
            return;
        }

        Uri destination = destinationUri();
        if (destination == null) {
            disableWithFailure("destination-unavailable");
            call.reject("destination-unavailable");
            return;
        }

        try {
            DocumentFile folder = DocumentFile.fromTreeUri(getContext(), destination);
            if (folder == null || !folder.canWrite()) {
                throw new IllegalStateException("destination-unavailable");
            }

            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            DocumentFile target = folder.createFile("application/octet-stream", fileName);
            if (target == null) {
                throw new IllegalStateException("destination-unavailable");
            }

            Uri targetUri = target.getUri();
            try (OutputStream out = getContext().getContentResolver().openOutputStream(targetUri, "w")) {
                if (out == null) throw new IllegalStateException("destination-unavailable");
                out.write(bytes);
                out.flush();
            }

            verifyBytes(targetUri, bytes);

            long now = System.currentTimeMillis();
            preferences().edit()
                .putLong(KEY_LAST_SUCCESS_AT, now)
                .remove(KEY_LAST_FAILURE_AT)
                .remove(KEY_LAST_FAILURE_REASON)
                .apply();

            JSObject result = new JSObject();
            result.put("writtenAt", now);
            call.resolve(result);
        } catch (SecurityException e) {
            disableWithFailure("destination-revoked");
            call.reject("destination-revoked", e);
        } catch (IOException e) {
            String reason = classifyIoFailure(e);
            failure(reason);
            call.reject(reason, e);
        } catch (IllegalStateException e) {
            String reason = message(e);
            if (reason.contains("destination-unavailable")) {
                disableWithFailure("destination-unavailable");
                call.reject("destination-unavailable", e);
                return;
            }
            failure(reason);
            call.reject(reason, e);
        } catch (Exception e) {
            String reason = message(e);
            failure(reason);
            call.reject(reason, e);
        }
    }

    /**
     * Posts the failure notice with the strings the JS side hands over
     * (phase 6 ticket 04). They used to be English literals here, which made
     * the one notification in the app that nobody could turn off also the one
     * nobody could read in Polish; the fallbacks below are those same
     * literals, for a call that somehow arrives with nothing.
     *
     * <p>Under `hideNotificationTitles` the caller sends the channel's own
     * name and an empty body - the registry's disguise rule, applied on that
     * side because this plugin never sees a preference. An empty body is
     * posted as no body at all rather than as a blank line.
     */
    @PluginMethod
    public void notifyFailure(PluginCall call) {
        try {
            if (!canNotify()) {
                call.resolve();
                return;
            }
            ensureFailureChannel(call.getString("channelName", FAILURE_CHANNEL_FALLBACK_NAME));
            NotificationCompat.Builder builder =
                new NotificationCompat.Builder(getContext(), FAILURE_CHANNEL)
                    .setSmallIcon(android.R.drawable.stat_notify_error)
                    .setContentTitle(call.getString("title", "Scheduled backup failed"))
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .setAutoCancel(true)
                    .setVisibility(NotificationCompat.VISIBILITY_PRIVATE);

            String body = call.getString("body", "");
            if (body != null && !body.isEmpty()) builder.setContentText(body);

            NotificationManagerCompat.from(getContext()).notify(FAILURE_NOTIFICATION_ID, builder.build());
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    /**
     * The reset path (ADR-0014): the destination URI and its label, the
     * wrapped backup password, and - the part a preference clear does not
     * reach - the Keystore alias it was wrapped under. An alias left behind
     * is a key left behind, and the ciphertext beside it is only gone
     * because this file went with it; the two have to leave together or the
     * password stays recoverable by anything that can put the ciphertext
     * back.
     */
    public static void wipe(Context context) throws Exception {
        releaseDestinationGrants(context);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit();
        PasswordStore.deleteKey();
    }

    /**
     * The SAF grant outlives the preference that recorded it. Forgetting
     * the destination URI is not the same as giving it up: the grant stays
     * in the system's own table, where {@code getPersistedUriPermissions}
     * reads it back with the folder's name and path in it, and it is still
     * write access to a folder on a phone the person has just wiped.
     *
     * <p>Every grant this app holds rather than the one the preferences
     * name, and the two are usually the same one - {@code pickedDestination}
     * is the only place anything is taken. A grant whose preference row has
     * already gone is exactly the one a list read from preferences would
     * miss.
     */
    private static void releaseDestinationGrants(Context context) {
        ContentResolver resolver = context.getContentResolver();
        for (UriPermission held : resolver.getPersistedUriPermissions()) {
            int modes =
                (held.isReadPermission() ? Intent.FLAG_GRANT_READ_URI_PERMISSION : 0)
                    | (held.isWritePermission() ? Intent.FLAG_GRANT_WRITE_URI_PERMISSION : 0);
            if (modes != 0) resolver.releasePersistableUriPermission(held.getUri(), modes);
        }
    }

    private void verifyBytes(Uri uri, byte[] expected) throws Exception {
        byte[] written;
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            if (in == null) throw new IllegalStateException("destination-unavailable");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            written = out.toByteArray();
        }

        if (written.length != expected.length) {
            throw new IllegalStateException("verification-failed");
        }
        for (int i = 0; i < expected.length; i++) {
            if (written[i] != expected[i]) throw new IllegalStateException("verification-failed");
        }
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS, Activity.MODE_PRIVATE);
    }

    private PasswordStore passwordStore() {
        return new PasswordStore(getContext(), preferences());
    }

    private Uri destinationUri() {
        String raw = preferences().getString(KEY_DESTINATION_URI, null);
        return raw == null ? null : Uri.parse(raw);
    }

    private static boolean isSchedule(String value) {
        return "weekly".equals(value) || "monthly".equals(value);
    }

    private void disableWithFailure(String reason) {
        long now = System.currentTimeMillis();
        preferences().edit()
            .putBoolean(KEY_ENABLED, false)
            .remove(KEY_DESTINATION_URI)
            .remove(KEY_DESTINATION_LABEL)
            .putLong(KEY_LAST_FAILURE_AT, now)
            .putString(KEY_LAST_FAILURE_REASON, reason)
            .apply();
    }

    private void failure(String reason) {
        long now = System.currentTimeMillis();
        preferences().edit().putLong(KEY_LAST_FAILURE_AT, now).putString(KEY_LAST_FAILURE_REASON, reason).apply();
    }

    private JSObject statusObject() {
        SharedPreferences prefs = preferences();
        JSObject out = new JSObject();

        out.put("enabled", prefs.getBoolean(KEY_ENABLED, false));
        out.put("schedule", prefs.getString(KEY_SCHEDULE, "weekly"));

        String destinationUri = prefs.getString(KEY_DESTINATION_URI, null);
        out.put("destinationUri", destinationUri == null ? JSObject.NULL : destinationUri);

        String destinationLabel = prefs.getString(KEY_DESTINATION_LABEL, null);
        out.put("destinationLabel", destinationLabel == null ? JSObject.NULL : destinationLabel);

        boolean hasPassword = prefs.contains(KEY_PASSWORD_NONCE) && prefs.contains(KEY_PASSWORD_CIPHERTEXT);
        out.put("hasPassword", hasPassword);

        out.put("lastSuccessAt", prefs.contains(KEY_LAST_SUCCESS_AT) ? prefs.getLong(KEY_LAST_SUCCESS_AT, 0) : JSObject.NULL);
        out.put("lastFailureAt", prefs.contains(KEY_LAST_FAILURE_AT) ? prefs.getLong(KEY_LAST_FAILURE_AT, 0) : JSObject.NULL);

        String reason = prefs.getString(KEY_LAST_FAILURE_REASON, null);
        out.put("lastFailureReason", reason == null ? JSObject.NULL : reason);

        Long due = nextDueAt(prefs);
        out.put("nextDueAt", due == null ? JSObject.NULL : due);

        return out;
    }

    private static Long nextDueAt(SharedPreferences prefs) {
        if (!prefs.getBoolean(KEY_ENABLED, false)) return null;
        if (!prefs.contains(KEY_LAST_SUCCESS_AT)) return 0L;

        long last = prefs.getLong(KEY_LAST_SUCCESS_AT, 0);
        String schedule = prefs.getString(KEY_SCHEDULE, "weekly");
        long span = "monthly".equals(schedule) ? 30L * DAY_MS : 7L * DAY_MS;
        return last + span;
    }

    private boolean canNotify() {
        if (Build.VERSION.SDK_INT < 33) return true;
        return ContextCompat.checkSelfPermission(getContext(), android.Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED;
    }

    /* Recreated on every notice rather than only when missing, the way
       RemindersPlugin.ensureChannels and RetrospectiveNotificationsPlugin
       already do it: cheap, and it keeps the channel's displayed name in the
       app's current language instead of freezing it at whatever it was the
       first time a backup failed. */
    private void ensureFailureChannel(String channelName) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel created = new NotificationChannel(
            FAILURE_CHANNEL,
            channelName == null || channelName.isEmpty() ? FAILURE_CHANNEL_FALLBACK_NAME : channelName,
            NotificationManager.IMPORTANCE_DEFAULT
        );
        created.setDescription("Scheduled backup failures that need a new destination or retry.");
        manager.createNotificationChannel(created);
    }

    private static String destinationLabel(Uri uri) {
        String tree = uri.getLastPathSegment();
        if (tree == null || tree.isEmpty()) return "chosen folder";
        int marker = tree.lastIndexOf(':');
        String value = marker >= 0 ? tree.substring(marker + 1) : tree;
        value = Uri.decode(value);
        return value.isEmpty() ? "chosen folder" : value;
    }

    private static String message(Exception e) {
        String detail = e.getMessage();
        return detail == null || detail.isEmpty() ? e.getClass().getName() : detail;
    }

    private static String classifyIoFailure(IOException e) {
        String text = message(e).toLowerCase();
        if (text.contains("no space") || text.contains("enospc") || text.contains("quota")) {
            return "destination-full";
        }
        return "partial-write";
    }

    private static final class PasswordStore {
        private static final int GCM_TAG_BITS = 128;

        private final Context context;
        private final SharedPreferences prefs;

        PasswordStore(Context context, SharedPreferences prefs) {
            this.context = context.getApplicationContext();
            this.prefs = prefs;
        }

        void write(@NonNull String password) throws Exception {
            Cipher cipher = Cipher.getInstance(PASSWORD_CIPHER);
            cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] ciphertext = cipher.doFinal(password.getBytes(StandardCharsets.UTF_8));
            prefs.edit()
                .putString(KEY_PASSWORD_NONCE, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .putString(KEY_PASSWORD_CIPHERTEXT, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .apply();
        }

        String read() throws Exception {
            String nonce = prefs.getString(KEY_PASSWORD_NONCE, null);
            String ciphertext = prefs.getString(KEY_PASSWORD_CIPHERTEXT, null);
            if (nonce == null || ciphertext == null) return null;

            Cipher cipher = Cipher.getInstance(PASSWORD_CIPHER);
            cipher.init(
                Cipher.DECRYPT_MODE,
                key(),
                new GCMParameterSpec(GCM_TAG_BITS, Base64.decode(nonce, Base64.DEFAULT))
            );
            byte[] clear = cipher.doFinal(Base64.decode(ciphertext, Base64.DEFAULT));
            return new String(clear, StandardCharsets.UTF_8);
        }

        void clear() {
            prefs.edit().remove(KEY_PASSWORD_NONCE).remove(KEY_PASSWORD_CIPHERTEXT).apply();
        }

        /** Static, and no {@code prefs}: the wrapping key outlives the
            ciphertext, so the reset has to reach it without an instance
            bound to preferences that are already gone. */
        static void deleteKey() throws Exception {
            java.security.KeyStore keyStore = java.security.KeyStore.getInstance(KEYSTORE);
            keyStore.load(null);
            if (keyStore.containsAlias(PASSWORD_ALIAS)) keyStore.deleteEntry(PASSWORD_ALIAS);
        }

        private SecretKey key() throws Exception {
            java.security.KeyStore keyStore = java.security.KeyStore.getInstance(KEYSTORE);
            keyStore.load(null);
            SecretKey existing = (SecretKey) keyStore.getKey(PASSWORD_ALIAS, null);
            if (existing != null) return existing;

            KeyGenerator keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
            keyGenerator.init(
                new KeyGenParameterSpec.Builder(PASSWORD_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setUserAuthenticationRequired(false)
                    .build());
            return keyGenerator.generateKey();
        }
    }
}
