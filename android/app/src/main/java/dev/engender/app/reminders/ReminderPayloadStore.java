package dev.engender.app.reminders;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Wrap the reminder title, rule, pending occurrence, hide-titles
 * preference and latest entry day with a per-device Keystore AES-GCM key.
 * The alarm receiver needs the payload while the journal is locked, so
 * use {@code setUserAuthenticationRequired(false)}. The separate plaintext
 * launch route contains only a route and reminder ID.
 *
 * <p>This store owns its alias independently of the auto-export password
 * so a reset of either owner in {@code DeviceStores} preserves the other.
 */
public final class ReminderPayloadStore {

    /** The Keystore entry. Named for the app, since the keystore is shared. */
    public static final String ALIAS = "engender-reminders-payload";

    /** The wrapped payload, and the nonce it was wrapped under. Named
        rather than private because the test that reads the file's bytes has
        to know what it is looking at, and a copy spelled out there would
        keep passing after this moved. */
    static final String KEY_CIPHERTEXT = "payload-v2";
    private static final String KEY_NONCE = "payload-v2-nonce";

    /** What builds before this ticket wrote: the same JSON, in the clear. */
    static final String KEY_LEGACY_PLAINTEXT = "payload-v1";

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String CIPHER = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;

    /** Failures a device test switches on to reach the keystore, cipher and
        commit paths, which a healthy phone never takes. Null in production. */
    static final class Faults {
        volatile boolean keyGeneration;
        volatile boolean cipher;
        volatile boolean commit;
    }

    static volatile Faults faults;

    private ReminderPayloadStore() {}

    static void write(Context context, JSONObject payload) throws Exception {
        Cipher cipher = Cipher.getInstance(CIPHER);
        cipher.init(Cipher.ENCRYPT_MODE, key());
        if (faults != null && faults.cipher) throw new IllegalStateException("injected cipher failure");
        byte[] ciphertext = cipher.doFinal(payload.toString().getBytes(StandardCharsets.UTF_8));

        /* commit rather than apply: this write is also the one that takes
           an older build's plaintext off disk, and apply returns before the
           file does. Occurrence consumption also reaches disk before a
           notification is posted, so another boot cannot replay it. */
        boolean committed = !(faults != null && faults.commit) && prefs(context).edit()
            .putString(KEY_NONCE, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .putString(KEY_CIPHERTEXT, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
            .remove(KEY_LEGACY_PLAINTEXT)
            .commit();
        if (!committed) throw new IllegalStateException("Could not persist reminder payload");
    }

    /**
     * The payload, or null when there is none to read.
     *
     * <p>Null also covers every way the read can fail - a payload that will
     * not parse, a ciphertext whose alias has gone, a tag that does not check
     * out - because they are one thing to every caller: there are no rules to
     * schedule and no notification to post. That is what a missing payload
     * already meant before this ticket.
     */
    static JSONObject read(Context context) {
        SharedPreferences prefs = prefs(context);
        String nonce = prefs.getString(KEY_NONCE, null);
        String ciphertext = prefs.getString(KEY_CIPHERTEXT, null);
        if (nonce != null && ciphertext != null) return parse(decrypt(nonce, ciphertext));
        return readLegacy(context, prefs);
    }

    /**
     * A payload an older build left in the clear: read once, rewrapped, and
     * the plaintext removed. Nobody loses their reminders to this ticket.
     *
     * <p>If the rewrap throws, the read returns nothing and the plaintext
     * stays on disk for a retry. Handing it back would keep medication names
     * and schedules readable and in use on a phone whose keystore is failing,
     * which is exactly the phone where that matters. The app's own reminders
     * are the source of truth and are rebuilt by the next sync, so nothing is
     * lost by waiting; {@link #legacyCopyPending} is what the reminders
     * screen reads to offer a retry or an erase. A payload that will not
     * parse is removed either way: it schedules nothing, so all it can still
     * do is read as a title.
     */
    private static JSONObject readLegacy(Context context, SharedPreferences prefs) {
        String raw = prefs.getString(KEY_LEGACY_PLAINTEXT, null);
        if (raw == null || raw.isBlank()) return null;

        JSONObject payload = parse(raw);
        if (payload == null) {
            prefs.edit().remove(KEY_LEGACY_PLAINTEXT).commit();
            return null;
        }

        try {
            write(context, payload);
        } catch (Exception failedRewrap) {
            return null;
        }
        return payload;
    }

    /** Whether an older build's plaintext payload is still on disk, which is
        to say a rewrap failed and nothing has retried it or erased it. */
    static boolean legacyCopyPending(Context context) {
        String raw = prefs(context).getString(KEY_LEGACY_PLAINTEXT, null);
        return raw != null && !raw.isBlank();
    }

    /** Tries the rewrap again. True when no plaintext is left. */
    static boolean retryLegacy(Context context) {
        read(context);
        return !legacyCopyPending(context);
    }

    /** Deletes the plaintext without wrapping it. Committed, not applied: the
        caller tells the person it is gone. */
    static void eraseLegacy(Context context) {
        if (!prefs(context).edit().remove(KEY_LEGACY_PLAINTEXT).commit()) {
            throw new IllegalStateException("Could not erase the old reminder copy");
        }
    }

    /** Static, and no context: the wrapping key outlives the ciphertext, so
        the reset has to reach it after the preference file holding the
        payload is already gone. */
    static void deleteKey() throws Exception {
        KeyStore keyStore = keystore();
        if (keyStore.containsAlias(ALIAS)) keyStore.deleteEntry(ALIAS);
    }

    private static boolean aliasExists() throws Exception {
        return keystore().containsAlias(ALIAS);
    }

    /* Reading never mints a key. key() creates one when the alias is
       absent, which on this path would mean answering "the key is gone"
       with a fresh key that cannot open the stored ciphertext - the same
       null in the end, by way of a GCM tag failure and a keystore entry
       nothing can use. */
    private static String decrypt(String nonce, String ciphertext) {
        try {
            if (!aliasExists()) return null;
            Cipher cipher = Cipher.getInstance(CIPHER);
            cipher.init(
                Cipher.DECRYPT_MODE,
                key(),
                new GCMParameterSpec(GCM_TAG_BITS, Base64.decode(nonce, Base64.DEFAULT)));
            return new String(cipher.doFinal(Base64.decode(ciphertext, Base64.DEFAULT)), StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static JSONObject parse(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static SecretKey key() throws Exception {
        if (faults != null && faults.keyGeneration) throw new IllegalStateException("injected key failure");
        SecretKey existing = (SecretKey) keystore().getKey(ALIAS, null);
        if (existing != null) return existing;

        KeyGenerator keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        keyGenerator.init(
            new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(false)
                .build());
        return keyGenerator.generateKey();
    }

    private static KeyStore keystore() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        return keyStore;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE);
    }
}
